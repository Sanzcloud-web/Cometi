import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

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

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    if (!apiKey) {
      res.status(500).json({ error: 'OPENAI_API_KEY manquante.' });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const upstream = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, stream: true, messages }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify(text)}\n\n`);
      res.end();
      return;
    }

    const reader = (upstream.body as any).getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
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
          const payload = line.replace(/^data:\s*/, '');
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

    res.write(`event: done\n`);
    res.write(`data: {}\n\n`);
    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify(message)}\n\n`);
    res.end();
  }
}

