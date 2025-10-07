import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { processChatRequest, type ChatPayload } from './chat-service';
import { processResumeRequest, type ResumeRequestPayload } from './resume';
import { fetchPageContent } from './resume/network/fetchPageContent';
import { extractMainText } from './resume/extractMainText';
// import { microSearch } from './resume/network/microSearch';
import { detectLanguage } from './resume/utils/language';
import { normalizeUrl, isHttpProtocol } from './resume/utils/url';
import { indexAndSelectTopChunks } from './resume/retrieval';
import { buildSimpleSummaryTextPromptFromChunks, buildPageAnswerTextPromptFromChunks } from './resume/summarize';
import { chunkText } from './resume/utils/text';
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
          if (!part) continue;
          const lines = part.split('\n');
          for (const l of lines) {
            if (!l.startsWith('data:')) continue;
            const payload = l.replace(/^data:\s?/, '');
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
    const logId = Math.random().toString(36).slice(2, 8);
    const sendTextEvent = (event: string, text: string) => {
      res.write(`event: ${event}\n`);
      // SSE multi-line payload: prefix each line with data:
      const lines = text.split('\n');
      for (const line of lines) {
        res.write(`data: ${line}\n`);
      }
      res.write(`\n`);
    };
    const sendErrorText = (text: string) => {
      res.write(`event: error\n`);
      res.write(`data: ${text}\n\n`);
    };

    try {
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as ResumeRequestPayload) : undefined;
      const urlForLog = payload?.url ?? '<absent>';
      const hasDom = Boolean(payload?.domSnapshot?.html);
      const titleLen = (payload?.title ?? '').length;
      console.log(`[resume-stream ${logId}] POST /api/resume-stream url=${urlForLog} titleLen=${titleLen} dom=${hasDom} rawBytes=${rawBody.length}`);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      if (!payload || typeof payload.url !== 'string' || !isHttpProtocol(payload.url)) {
        sendErrorText('URL invalide pour /resume-stream.');
        res.end();
        return;
      }

      const normalized = normalizeUrl(payload.url);
      const fallbackDom = payload.domSnapshot;
      let derivedTitle = payload.title ?? '';

      console.log(`[resume-stream ${logId}] fetch start url=${normalized}`);
      const remote = await fetchPageContent(normalized, 12000);

      let contentType: 'text/html' | 'application/pdf' | 'unknown' = 'unknown';
      let raw: string | ArrayBuffer | undefined;

      if (remote.success) {
        contentType = remote.contentType;
        raw = remote.body;
        if (remote.title) derivedTitle = remote.title;
        const bodyLen = typeof remote.body === 'string' ? remote.body.length : remote.body?.byteLength ?? 0;
        console.log(`[resume-stream ${logId}] fetched ok type=${contentType} bodyLen=${bodyLen} titleLen=${remote.title?.length ?? 0}`);

        if (
          contentType === 'text/html' &&
          typeof remote.body === 'string' &&
          remote.body.length < 800 &&
          fallbackDom?.html
        ) {
          contentType = 'text/html';
          raw = fallbackDom.html;
          derivedTitle = fallbackDom.title ?? derivedTitle;
          console.log(`[resume-stream ${logId}] using fallback DOM due to short remote html domLen=${fallbackDom.html.length}`);
      }
      } else if (fallbackDom?.html) {
        contentType = 'text/html';
        raw = fallbackDom.html;
        derivedTitle = fallbackDom.title ?? derivedTitle;
        console.log(`[resume-stream ${logId}] remote fetch failed: ${remote.error}. Using fallback DOM len=${fallbackDom.html.length}`);
      } else {
        sendErrorText(`Impossible de récupérer le contenu distant : ${remote.error}`);
        console.error(`[resume-stream ${logId}] fetch error: ${remote.error}`);
        res.end();
        return;
      }

      if (!raw) {
        sendErrorText('Aucun contenu exploitable.');
        res.end();
        return;
      }

      console.log(`[resume-stream ${logId}] extract start contentType=${contentType}`);
      const extraction = await extractMainText({ contentType, raw });
      let paragraphs = extraction.paragraphs;
      const title = extraction.title?.trim() || derivedTitle || normalized;
      console.log(`[resume-stream ${logId}] extract done paragraphs=${paragraphs.length} titleLen=${title.length}`);

      if (paragraphs.length === 0 && fallbackDom?.html && fallbackDom.html !== raw) {
        const fallbackExtraction = await extractMainText({ contentType: 'text/html', raw: fallbackDom.html });
        if (fallbackExtraction.paragraphs.length > 0) {
          paragraphs = fallbackExtraction.paragraphs;
          if (fallbackExtraction.title) derivedTitle = fallbackExtraction.title;
        }
      }

      if (paragraphs.length === 0) {
        sendErrorText("Impossible d'extraire le contenu principal de la page.");
        console.error(`[resume-stream ${logId}] extraction returned 0 paragraphs`);
        res.end();
        return;
      }

      const language = detectLanguage(paragraphs.join('\n'));
      console.log(`[resume-stream ${logId}] language=${language}`);
      // Simplified RAG: select top 6 chunks
      let topChunks: string[] = [];
      if (process.env.DB_EMBEDDING) {
        console.log(`[resume-stream ${logId}] retrieval start paragraphs=${paragraphs.length}`);
        const selected = await indexAndSelectTopChunks(normalized, title, paragraphs, {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
        });
        topChunks = selected.slice(0, 6);
        console.log(`[resume-stream ${logId}] retrieval done kept=${topChunks.length}`);
      } else {
        // Local chunking fallback
        const localChunks = chunkText(paragraphs, 1200);
        topChunks = localChunks.slice(0, 6);
        console.log(`[resume-stream ${logId}] local chunking used kept=${topChunks.length}`);
      }
      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      if (!apiKey) {
        sendErrorText('OPENAI_API_KEY manquante.');
        console.error(`[resume-stream ${logId}] missing OPENAI_API_KEY`);
        res.end();
        return;
      }

      console.log(`[resume-stream ${logId}] summary start chunks=${topChunks.length} model=${model}`);
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, stream: true, messages: buildSimpleSummaryTextPromptFromChunks(topChunks, language, normalized) }),
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        // error as plain text
        sendErrorText(`OpenAI a renvoyé ${upstream.status}: ${text}`);
        console.error(`[resume-stream ${logId}] openai error status=${upstream.status} body=${text}`);
        res.end();
        return;
      }

      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let acc = '';
      let chunksCount = 0;
      let seenDone = false;
      for await (const chunk of upstream.body as any) {
        buffer += decoder.decode(chunk, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part) continue;
          const lines = part.split('\n');
          for (const l of lines) {
            if (!l.startsWith('data:')) continue;
            const p = l.replace(/^data:\s?/, '');
            if (p === '[DONE]') {
              seenDone = true;
              console.log(`[resume-stream ${logId}] upstream DONE marker received`);
              break;
            }
            try {
              const json = JSON.parse(p) as any;
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                acc += delta;
                sendTextEvent('delta', delta);
                chunksCount += 1;
                if ((chunksCount % 10) === 0) {
                  console.log(`[resume-stream ${logId}] streamed chunks=${chunksCount} accLen=${acc.length}`);
                }
              }
            } catch {
              // ignore
            }
          }
        }
      }
      // Send the full plain text as the final payload (no JSON)
      const fullText = acc; // avoid trimming to preserve spacing
      sendTextEvent('final', fullText);
      const duration = Date.now() - startedAt;
      console.log(`[resume-stream ${logId}] final sent accLen=${acc.length} seenDone=${seenDone} durationMs=${duration}`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      console.error(`[resume-stream ${logId}] ERROR`, message);
      res.write(`event: error\n`);
      res.write(`data: ${message}\n\n`);
      res.end();
    }
    return;
  }

  if (url.pathname === '/api/page-answer-stream') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Méthode non autorisée.' });
      return;
    }

    const startedAt = Date.now();
    const logId = Math.random().toString(36).slice(2, 8);
    const sendTextEvent = (event: string, text: string) => {
      res.write(`event: ${event}\n`);
      const lines = text.split('\n');
      for (const line of lines) res.write(`data: ${line}\n`);
      res.write(`\n`);
    };
    const sendErrorText = (text: string) => {
      res.write(`event: error\n`);
      res.write(`data: ${text}\n\n`);
    };

    try {
      const rawBody = await readBody(req);
      const payload = rawBody.length > 0 ? (JSON.parse(rawBody) as any) : undefined;
      const urlForLog = payload?.url ?? '<absent>';
      const question = typeof payload?.question === 'string' ? payload.question : '';
      const hasDom = Boolean(payload?.domSnapshot?.html);
      const titleLen = (payload?.title ?? '').length;
      console.log(`[qa-stream ${logId}] POST /api/page-answer-stream url=${urlForLog} qLen=${question.length} titleLen=${titleLen} dom=${hasDom} rawBytes=${rawBody.length}`);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');

      if (!payload || typeof payload.url !== 'string' || !isHttpProtocol(payload.url) || question.trim().length === 0) {
        sendErrorText("Requête invalide pour /page-answer-stream (URL ou question manquantes). ");
        res.end();
        return;
      }

      const normalized = normalizeUrl(payload.url);
      const fallbackDom = payload.domSnapshot;
      let derivedTitle = payload.title ?? '';

      console.log(`[qa-stream ${logId}] fetch start url=${normalized}`);
      const remote = await fetchPageContent(normalized, 12000);

      let contentType: 'text/html' | 'application/pdf' | 'unknown' = 'unknown';
      let raw: string | ArrayBuffer | undefined;
      if (remote.success) {
        contentType = remote.contentType;
        raw = remote.body;
        if (remote.title) derivedTitle = remote.title;
        const bodyLen = typeof remote.body === 'string' ? remote.body.length : remote.body?.byteLength ?? 0;
        console.log(`[qa-stream ${logId}] fetched ok type=${contentType} bodyLen=${bodyLen} titleLen=${remote.title?.length ?? 0}`);
        if (contentType === 'text/html' && typeof remote.body === 'string' && remote.body.length < 800 && fallbackDom?.html) {
          contentType = 'text/html';
          raw = fallbackDom.html;
          derivedTitle = fallbackDom.title ?? derivedTitle;
          console.log(`[qa-stream ${logId}] using fallback DOM`);
        }
      } else if (fallbackDom?.html) {
        contentType = 'text/html';
        raw = fallbackDom.html;
        derivedTitle = fallbackDom.title ?? derivedTitle;
        console.log(`[qa-stream ${logId}] remote fetch failed: ${remote.error}. Using fallback DOM`);
      } else {
        sendErrorText(`Impossible de récupérer le contenu distant : ${remote.error}`);
        res.end();
        return;
      }

      if (!raw) {
        sendErrorText('Aucun contenu exploitable.');
        res.end();
        return;
      }

      console.log(`[qa-stream ${logId}] extract start contentType=${contentType}`);
      const extraction = await extractMainText({ contentType, raw });
      let paragraphs = extraction.paragraphs;
      const title = extraction.title?.trim() || derivedTitle || normalized;
      console.log(`[qa-stream ${logId}] extract done paragraphs=${paragraphs.length} titleLen=${title.length}`);

      if (paragraphs.length === 0 && fallbackDom?.html && fallbackDom.html !== raw) {
        const fallbackExtraction = await extractMainText({ contentType: 'text/html', raw: fallbackDom.html });
        if (fallbackExtraction.paragraphs.length > 0) {
          paragraphs = fallbackExtraction.paragraphs;
          if (fallbackExtraction.title) derivedTitle = fallbackExtraction.title;
        }
      }
      if (paragraphs.length === 0) {
        sendErrorText("Impossible d'extraire le contenu principal de la page.");
        res.end();
        return;
      }

      const language = detectLanguage(paragraphs.join('\n'));
      console.log(`[qa-stream ${logId}] language=${language}`);

      // Retrieval using the question as query
      let topChunks: string[] = [];
      if (process.env.DB_EMBEDDING) {
        console.log(`[qa-stream ${logId}] retrieval start paragraphs=${paragraphs.length}`);
        const selected = await indexAndSelectTopChunks(normalized, title, paragraphs, {
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL,
        }, question);
        topChunks = selected.slice(0, 6);
        console.log(`[qa-stream ${logId}] retrieval done kept=${topChunks.length}`);
      } else {
        // fallback simple chunking then keep first 6
        const localChunks = chunkText(paragraphs, 1200);
        topChunks = localChunks.slice(0, 6);
        console.log(`[qa-stream ${logId}] local chunking used kept=${topChunks.length}`);
      }

      const apiKey = process.env.OPENAI_API_KEY;
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      if (!apiKey) {
        sendErrorText('OPENAI_API_KEY manquante.');
        res.end();
        return;
      }

      console.log(`[qa-stream ${logId}] answer start chunks=${topChunks.length} model=${model}`);
      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, stream: true, messages: buildPageAnswerTextPromptFromChunks(topChunks, language, normalized, question) }),
      });
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text();
        sendErrorText(`OpenAI a renvoyé ${upstream.status}: ${text}`);
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
          if (!part) continue;
          for (const l of part.split('\n')) {
            if (!l.startsWith('data:')) continue;
            const p = l.replace(/^data:\s?/, '');
            if (p === '[DONE]') {
              break;
            }
            try {
              const json = JSON.parse(p) as any;
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                acc += delta;
                sendTextEvent('delta', delta);
              }
            } catch { /* ignore */ }
          }
        }
      }
      sendTextEvent('final', acc);
      const duration = Date.now() - startedAt;
      console.log(`[qa-stream ${logId}] final sent accLen=${acc.length} durationMs=${duration}`);
      res.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
      console.error(`[qa-stream ${logId}] ERROR`, message);
      res.write(`event: error\n`);
      res.write(`data: ${message}\n\n`);
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
