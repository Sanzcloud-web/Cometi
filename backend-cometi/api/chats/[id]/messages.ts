import type { VercelRequest, VercelResponse } from '@vercel/node';
import { appendAssistantMessage, appendUserMessage } from '../../../../src/history';

const ALLOWED_ORIGIN = process.env.ORIGIN ?? '*';

function applyCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const shouldPersistAssistant = (text: string | null | undefined) => {
  const trimmed = text?.trim() ?? '';
  if (!trimmed) return false;
  if (/^<\s*ROUTE\b/i.test(trimmed)) return false;
  return true;
};

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

  const chatId = req.query.id;
  const chatIdValue = Array.isArray(chatId) ? chatId[0] : chatId;
  if (!chatIdValue) {
    res.status(400).json({ error: "Identifiant de chat manquant." });
    return;
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const role = payload?.role;
    const content = payload?.content;
    if (role !== 'assistant' && role !== 'user') {
      res.status(400).json({ error: 'Rôle de message invalide.' });
      return;
    }
    if (typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ error: 'Contenu vide.' });
      return;
    }

    if (role === 'user') {
      await appendUserMessage(chatIdValue, content);
    } else if (shouldPersistAssistant(content)) {
      await appendAssistantMessage(chatIdValue, content);
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur lors de la sauvegarde du message.';
    res.status(500).json({ error: message });
  }
}
