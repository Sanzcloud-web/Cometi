import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { processChatRequest, type ChatPayload } from './chat-service';
import { processResumeRequest, type ResumeRequestPayload } from './resume';

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

  sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cometi backend dev server prêt sur http://localhost:${PORT}/api/chat`);
  // eslint-disable-next-line no-console
  console.log(`[env] OPENAI_API_KEY présent: ${Boolean(process.env.OPENAI_API_KEY)} | OPENAI_MODEL: ${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'} | ORIGIN: ${ORIGIN}`);
});
