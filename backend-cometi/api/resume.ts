import type { VercelRequest, VercelResponse } from '@vercel/node';
import { processResumeRequest, type ResumeRequestPayload } from '../src/resume';

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

  try {
    const payload = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as
      | ResumeRequestPayload
      | undefined;

    const summary = await processResumeRequest(payload, {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });

    res.status(200).json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur inattendue.';
    res.status(500).json({ error: message });
  }
}
