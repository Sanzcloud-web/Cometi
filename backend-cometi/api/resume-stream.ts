import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPageContent } from '../src/resume/network/fetchPageContent';
import { extractMainText } from '../src/resume/extractMainText';
import { microSearch } from '../src/resume/network/microSearch';
import { detectLanguage } from '../src/resume/utils/language';
import { normalizeUrl, isHttpProtocol } from '../src/resume/utils/url';
import { indexAndSelectTopChunks } from '../src/resume/retrieval';
import { buildFinalSummaryPrompt, sanitizeJsonPayload } from '../src/resume/summarize';

function applyCorsHeaders(res: VercelResponse) {
  const ALLOWED_ORIGIN = process.env.ORIGIN ?? '*';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applyCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' });
    return;
  }

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const url: string | undefined = body?.url;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (!url || !isHttpProtocol(url)) {
      sendEvent('error', { error: 'URL invalide' });
      res.end();
      return;
    }

    const normalized = normalizeUrl(url);
    const fallbackDom = body?.domSnapshot;
    let derivedTitle: string = body?.title ?? '';

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

    const reader = (upstream.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        for (const l of trimmed.split('\n')) {
          const line = l.trim();
          if (!line.startsWith('data:')) continue;
          const p = line.replace(/^data:\s*/, '');
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
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
    res.end();
  }
}

