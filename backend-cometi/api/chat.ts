import type { VercelRequest, VercelResponse } from '@vercel/node';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ChatPayload = {
  messages: ChatMessage[];
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const ALLOWED_ORIGIN = process.env.ORIGIN ?? '*';

function applyCorsHeaders(res: VercelResponse) {
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

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY manquante côté serveur.' });
    return;
  }

  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as ChatPayload | undefined;

    if (!body || !Array.isArray(body.messages)) {
      res.status(400).json({ error: 'Corps de requête invalide: messages manquants.' });
      return;
    }

    const messages = body.messages;

    const isValidMessage = (message: ChatMessage) => {
      return (
        typeof message === 'object' &&
        (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string'
      );
    };

    if (!messages.every(isValidMessage)) {
      res.status(400).json({ error: 'Format de message invalide.' });
      return;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `OpenAI a renvoyé ${response.status}: ${errorText}` });
      return;
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      res.status(500).json({ error: 'OpenAI a renvoyé une réponse vide.' });
      return;
    }

    res.status(200).json({ message: content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
    res.status(500).json({ error: message });
  }
}
