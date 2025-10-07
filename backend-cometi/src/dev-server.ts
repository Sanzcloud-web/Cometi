import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { processChatRequest, type ChatPayload } from './chat-service';
import { processResumeRequest, type ResumeRequestPayload } from './resume';
import { fetchPageContent } from './resume/network/fetchPageContent';
import { extractMainText } from './resume/extractMainText';
import { microSearch } from './resume/network/microSearch';
import { detectLanguage } from './resume/utils/language';
import { normalizeUrl, isHttpProtocol } from './resume/utils/url';
import { indexAndSelectTopChunks } from './resume/retrieval';
import { buildFinalSummaryPrompt, sanitizeJsonPayload } from './resume/summarize';
import { TextDecoder } from 'node:util';

const PORT = Number(process.env.PORT ?? 3000);
const ORIGIN = process.env.ORIGIN ?? '*';

function applyCorsHeaders(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(json);
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `localhost:${PORT}`}`);

  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url.pathname === '/api/chat') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée.' });
      return;
    }

    try {
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as ChatPayload) : undefined;

      const result = await processChatRequest(payload, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      });

      sendJson(res, result.status, result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (url.pathname === '/api/chat-stream') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée.' });
      return;
    }

    try {
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as ChatPayload) : undefined;

      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      if (!apiKey) {
        sendJson(res, 500, { error: 'OPENAI_API_KEY manquante côté serveur.' });
        return;
      }

      // Prepare SSE headers
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      // Open stream to OpenAI
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: payload?.messages ?? [],
        }),
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify(text)}\n\n`);
        res.end();
        return;
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      for await (const chunk of upstream.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          for (const l of line.split('\n')) {
            const trimmed = l.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.replace(/^data:\s*/, '');
            if (payload === '[DONE]') {
              res.write(`event: done\n`);
              res.write(`data: {}\n\n`);
              res.end();
              return;
            }
            try {
              const json = JSON.parse(payload) as any;
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                res.write(`event: delta\n`);
                res.write(`data: ${JSON.stringify({ delta })}\n\n`);
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }
      }

      // Safety end
      res.write(`event: done\n`);
      res.write(`data: {}\n\n`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
      res.end();
    }
    return;
  }

  if (url.pathname === '/api/resume') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée.' });
      return;
    }

    try {
      const startedAt = Date.now();
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as ResumeRequestPayload) : undefined;
      const logId = Math.random().toString(36).slice(2, 8);
      const urlForLog = payload?.url ?? '<absent>';
      const hasDom = Boolean(payload?.domSnapshot?.html);
      const titleLen = (payload?.title ?? '').length;
      console.log(`[resume ${logId}] POST /api/resume url=${urlForLog} titleLen=${titleLen} dom=${hasDom} rawBytes=${rawBody.length}`);

      const summary = await processResumeRequest(payload, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      });

      const duration = Date.now() - startedAt;
      console.log(
        `[resume ${logId}] OK url=${summary.url} tldr=${summary.tldr.length} titleLen=${summary.title.length} in ${duration}ms`
      );
      sendJson(res, 200, summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      console.error('[resume] ERROR', message);
      sendJson(res, 500, { error: message });
    }
    return;
  }

  if (url.pathname === '/api/resume-stream') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée.' });
      return;
    }

    const startedAt = Date.now();
    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as ResumeRequestPayload) : undefined;

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      if (!payload || typeof payload.url !== 'string' || !isHttpProtocol(payload.url)) {
        sendEvent('error', { error: 'URL invalide pour /resume-stream.' });
        res.end();
        return;
      }

      const normalized = normalizeUrl(payload.url);
      const fallbackDom = payload.domSnapshot;
      let derivedTitle = payload.title ?? '';

      sendEvent('progress', { stage: 'fetch', url: normalized });
      const remote = await fetchPageContent(normalized, 12000);

      let contentType: 'text/html' | 'application/pdf' | 'unknown' = 'unknown';
      let raw: string | ArrayBuffer | undefined;

      if (remote.success) {
        contentType = remote.contentType;
        raw = remote.body;
        if (remote.title) derivedTitle = remote.title;
        sendEvent('progress', { stage: 'fetched', type: contentType });

        if (
          contentType === 'text/html' &&
          typeof remote.body === 'string' &&
          remote.body.length < 800 &&
          fallbackDom?.html
        ) {
          contentType = 'text/html';
          raw = fallbackDom.html;
          derivedTitle = fallbackDom.title ?? derivedTitle;
        }
      } else if (fallbackDom?.html) {
        contentType = 'text/html';
        raw = fallbackDom.html;
        derivedTitle = fallbackDom.title ?? derivedTitle;
        sendEvent('progress', { stage: 'fallback-dom' });
      } else {
        sendEvent('error', { error: `Impossible de récupérer le contenu distant : ${remote.error}` });
        res.end();
        return;
      }

      if (!raw) {
        sendEvent('error', { error: 'Aucun contenu exploitable.' });
        res.end();
        return;
      }

      sendEvent('progress', { stage: 'extract' });
      const extraction = await extractMainText({ contentType, raw });
      let paragraphs = extraction.paragraphs;
      const title = extraction.title?.trim() || derivedTitle || normalized;
      sendEvent('progress', { stage: 'extracted', paragraphs: paragraphs.length });

      if (paragraphs.length === 0 && fallbackDom?.html && fallbackDom.html !== raw) {
        const fallbackExtraction = await extractMainText({ contentType: 'text/html', raw: fallbackDom.html });
        if (fallbackExtraction.paragraphs.length > 0) {
          paragraphs = fallbackExtraction.paragraphs;
          if (fallbackExtraction.title) derivedTitle = fallbackExtraction.title;
        }
      }

      if (paragraphs.length === 0) {
        sendEvent('error', { error: "Impossible d'extraire le contenu principal de la page." });
        res.end();
        return;
      }

      const joined = paragraphs.join('\n');
      const supplementalSources: string[] = [];
      if (joined.length < 800) {
        sendEvent('progress', { stage: 'microsearch' });
        const results = await microSearch(title || paragraphs.slice(0, 2).join(' ').slice(0, 120), 4);
        sendEvent('progress', { stage: 'microsearch:done', results: results.length });
        if (results.length > 0) {
          paragraphs = [
            ...paragraphs,
            ...results.map((r) => `Contexte externe : ${r.title}. ${r.snippet} (source : ${r.url})`),
          ];
          supplementalSources.push(...results.map((r) => r.url));
        }
      }

      const language = detectLanguage(paragraphs.join('\n'));
      sendEvent('progress', { stage: 'language', language });

      if (process.env.DB_EMBEDDING) {
        sendEvent('progress', { stage: 'retrieval:start' });
        paragraphs = await indexAndSelectTopChunks(normalized, title, paragraphs, {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
        });
        sendEvent('progress', { stage: 'retrieval:done', kept: paragraphs.length });
      }

      const synthesisSource = paragraphs.join('\n\n');
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      if (!apiKey) {
        sendEvent('error', { error: 'OPENAI_API_KEY manquante.' });
        res.end();
        return;
      }

      sendEvent('progress', { stage: 'summary:start' });
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, stream: true, messages: buildFinalSummaryPrompt(synthesisSource, language, normalized) }),
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        sendEvent('error', { error: `OpenAI a renvoyé ${upstream.status}: ${text}` });
        res.end();
        return;
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acc = '';
      for await (const chunk of upstream.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          for (const l of line.split('\n')) {
            const trimmed = l.trim();
            if (!trimmed.startsWith('data:')) continue;
            const p = trimmed.replace(/^data:\s*/, '');
            if (p === '[DONE]') {
              sendEvent('done', {});
              break;
            }
            try {
              const json = JSON.parse(p) as any;
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                acc += delta;
                sendEvent('delta', { delta });
              }
            } catch {
              // ignore
            }
          }
        }
      }

      let finalSummary: any;
      try {
        const parsed = sanitizeJsonPayload(acc) as any;
        finalSummary = parsed;
      } catch (e) {
        sendEvent('progress', { stage: 'summary:parse_error' });
        finalSummary = { tldr: [], summary: acc };
      }

      const result = {
        url: normalized,
        title,
        tldr: Array.isArray(finalSummary.tldr) ? finalSummary.tldr : [],
        summary: typeof finalSummary.summary === 'string' ? finalSummary.summary : acc,
        usedSources: [normalized, ...supplementalSources],
      };
      sendEvent('final', result);
      const duration = Date.now() - startedAt;
      sendEvent('progress', { stage: 'complete', ms: duration });
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify(message)}\n\n`);
      res.end();
    }
    return;
  }

  sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cometi backend dev server prêt sur http://localhost:${PORT}/api/chat`);
  // eslint-disable-next-line no-console
  console.log(`[env] OPENAI_API_KEY présent: ${Boolean(process.env.OPENAI_API_KEY)} | OPENAI_MODEL: ${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'} | ORIGIN: ${ORIGIN}`);
});
