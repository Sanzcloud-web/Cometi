import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { processChatRequest, type ChatPayload } from './chat-service';

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

  if (url.pathname !== '/api/chat') {
    sendJson(res, 404, { error: 'Not Found' });
    return;
  }

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
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Cometi backend dev server prêt sur http://localhost:${PORT}/api/chat`);
});
