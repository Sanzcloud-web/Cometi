import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchPageContent } from '../src/resume/network/fetchPageContent';
import { extractMainText } from '../src/resume/extractMainText';
import { detectLanguage } from '../src/resume/utils/language';
import { normalizeUrl, isHttpProtocol } from '../src/resume/utils/url';
import { indexAndSelectTopChunks } from '../src/resume/retrieval';
import { buildPageAnswerTextPromptFromChunks } from '../src/resume/summarize';
import { chunkText } from '../src/resume/utils/text';

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
    for (const line of text.split('\n')) res.write(`data: ${line}\n`);
    res.write(`\n`);
  };

  try {
    const startedAt = Date.now();
    const logId = Math.random().toString(36).slice(2, 8);
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const url: string | undefined = body?.url;
    const question: string | undefined = body?.question;
    const hasDom = Boolean(body?.domSnapshot?.html);
    const titleLen = (body?.title ?? '').length;
    console.log(`[qa-stream ${logId}] Vercel POST /api/page-answer-stream url=${url ?? '<absent>'} qLen=${question?.length ?? 0} titleLen=${titleLen} dom=${hasDom}`);

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (!url || !isHttpProtocol(url) || !question || question.trim().length === 0) {
      sendTextEvent('error', 'Requête invalide (URL ou question manquantes).');
      res.end();
      return;
    }

    const normalized = normalizeUrl(url);
    const fallbackDom = body?.domSnapshot;
    let derivedTitle: string = body?.title ?? '';

    console.log(`[qa-stream ${logId}] fetch start url=${normalized}`);
    sendTextEvent('progress', 'Analyse de la page');
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
      }
    } else if (fallbackDom?.html) {
      contentType = 'text/html';
      raw = fallbackDom.html;
      derivedTitle = fallbackDom.title ?? derivedTitle;
      console.log(`[qa-stream ${logId}] remote fetch failed: ${remote.error}. Using fallback DOM`);
    } else {
      sendTextEvent('error', `Impossible de récupérer le contenu distant : ${remote.error}`);
      res.end();
      return;
    }
    if (!raw) {
      sendTextEvent('error', 'Aucun contenu exploitable.');
      res.end();
      return;
    }

    console.log(`[qa-stream ${logId}] extract start contentType=${contentType}`);
    sendTextEvent('progress', 'Extraction du contenu pertinent');
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
      sendTextEvent('error', "Impossible d'extraire le contenu principal de la page.");
      res.end();
      return;
    }

    const language = detectLanguage(paragraphs.join('\n'));
    console.log(`[qa-stream ${logId}] language=${language}`);
    let topChunks: string[] = [];
    if (process.env.DB_EMBEDDING) {
      sendTextEvent('progress', 'Repérage des passages clés');
      console.log(`[qa-stream ${logId}] retrieval start paragraphs=${paragraphs.length}`);
      const selected = await indexAndSelectTopChunks(normalized, title, paragraphs, {
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL,
      }, question);
      topChunks = selected.slice(0, 6);
      console.log(`[qa-stream ${logId}] retrieval done kept=${topChunks.length}`);
    } else {
      const localChunks = chunkText(paragraphs, 1200);
      topChunks = localChunks.slice(0, 6);
      console.log(`[qa-stream ${logId}] local chunking used kept=${topChunks.length}`);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    if (!apiKey) {
      sendTextEvent('error', 'OPENAI_API_KEY manquante.');
      res.end();
      return;
    }

    console.log(`[qa-stream ${logId}] answer start chunks=${topChunks.length} model=${model}`);
    sendTextEvent('progress', 'Rédaction de la réponse');
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, stream: true, messages: buildPageAnswerTextPromptFromChunks(topChunks, language, normalized, question) }),
    });
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      sendTextEvent('error', `OpenAI a renvoyé ${upstream.status}: ${text}`);
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
        if (!part) continue;
        for (const l of part.split('\n')) {
          if (!l.startsWith('data:')) continue;
          const p = l.replace(/^data:\s?/, '');
          if (p === '[DONE]') break;
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
    console.error(`[qa-stream] ERROR`, message);
    res.write(`event: error\n`);
    res.write(`data: ${message}\n\n`);
    res.end();
  }
}
