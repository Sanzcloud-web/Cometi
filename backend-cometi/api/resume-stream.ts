import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPageContent } from '../src/resume/network/fetchPageContent';
import { extractMainText } from '../src/resume/extractMainText';
// import { microSearch } from '../src/resume/network/microSearch';
import { detectLanguage } from '../src/resume/utils/language';
import { normalizeUrl, isHttpProtocol } from '../src/resume/utils/url';
import { indexAndSelectTopChunks } from '../src/resume/retrieval';
import { buildSimpleSummaryTextPromptFromChunks } from '../src/resume/summarize';

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

  const sendTextEvent = (event: string, text: string) => {
    res.write(`event: ${event}\n`);
    for (const line of text.split('\n')) {
      res.write(`data: ${line}\n`);
    }
    res.write(`\n`);
  };
  const sendErrorText = (text: string) => {
    res.write(`event: error\n`);
    res.write(`data: ${text}\n\n`);
  };

  try {
    const startedAt = Date.now();
    const logId = Math.random().toString(36).slice(2, 8);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const url: string | undefined = body?.url;
    const hasDom = Boolean(body?.domSnapshot?.html);
    const titleLen = (body?.title ?? '').length;
    console.log(`[resume-stream ${logId}] Vercel POST /api/resume-stream url=${url ?? '<absent>'} titleLen=${titleLen} dom=${hasDom}`);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (!url || !isHttpProtocol(url)) {
      sendErrorText('URL invalide');
      console.error(`[resume-stream ${logId}] invalid url`);
      res.end();
      return;
    }

    const normalized = normalizeUrl(url);
    const fallbackDom = body?.domSnapshot;
    let derivedTitle: string = body?.title ?? '';

    // no progress events
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

    // no progress events
    console.log(`[resume-stream ${logId}] extract start contentType=${contentType}`);
    const extraction = await extractMainText({ contentType, raw });
    let paragraphs = extraction.paragraphs;
    const title = extraction.title?.trim() || derivedTitle || normalized;
    // no progress events
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

    const joined = paragraphs.join('\n');
    const supplementalSources: string[] = [];
    if (false && joined.length < 800) {
      // microsearch disabled
      console.log(`[resume-stream ${logId}] microsearch start reason=low_content len=${joined.length}`);
      const results: any[] = [];
      // progress disabled
      console.log(`[resume-stream ${logId}] microsearch results=${results.length}`);
      if (results.length > 0) {
        paragraphs = [
          ...paragraphs,
          ...results.map((r) => `Contexte externe : ${r.title}. ${r.snippet} (source : ${r.url})`),
        ];
        supplementalSources.push(...results.map((r) => r.url));
      }
    }

    const language = detectLanguage(paragraphs.join('\n'));
    // progress disabled
    console.log(`[resume-stream ${logId}] language=${language}`);

    if (process.env.DB_EMBEDDING) {
      // progress disabled
      console.log(`[resume-stream ${logId}] retrieval start paragraphs=${paragraphs.length}`);
      paragraphs = await indexAndSelectTopChunks(normalized, title, paragraphs, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      });
      // progress disabled
      console.log(`[resume-stream ${logId}] retrieval done kept=${paragraphs.length}`);
    }

    // Using selected top chunks rather than a single joined source
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    if (!apiKey) {
      sendErrorText('OPENAI_API_KEY manquante.');
      console.error(`[resume-stream ${logId}] missing OPENAI_API_KEY`);
      res.end();
      return;
    }
    // no progress event for summary start
    console.log(`[resume-stream ${logId}] summary start chunks=${Math.min(paragraphs.length, 6)} model=${model}`);
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, stream: true, messages: buildSimpleSummaryTextPromptFromChunks(paragraphs.slice(0, 6), language, normalized) }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      sendErrorText(`OpenAI a renvoyé ${upstream.status}: ${text}`);
      console.error(`[resume-stream ${logId}] openai error status=${upstream.status} body=${text}`);
      res.end();
      return;
    }

    const reader = (upstream.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let acc = '';
    let chunksCount = 0;
    let seenDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part) continue;
        for (const l of part.split('\n')) {
          if (!l.startsWith('data:')) continue;
          const p = l.replace(/^data:\s*/, '');
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
    const fullText = acc; // no trimming
    sendTextEvent('final', fullText);
    const duration = Date.now() - startedAt;
    console.log(`[resume-stream ${logId}] final sent accLen=${acc.length} seenDone=${seenDone} durationMs=${duration}`);
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
    console.error(`[resume-stream] ERROR`, message);
    res.write(`event: error\n`);
    res.write(`data: ${message}\n\n`);
    res.end();
  }
}
