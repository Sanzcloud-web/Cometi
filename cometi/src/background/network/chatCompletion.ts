import type { ChatCompletionMessage } from '../types';

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const API_URL = import.meta.env.VITE_COMETI_API_URL || (API_BASE ? `${API_BASE}/chat` : undefined);

export async function createChatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  if (!API_URL) {
    throw new Error(
      "URL API absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) ou VITE_COMETI_API_URL dans ton fichier .env."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Le serveur a renvoyé ${response.status} : ${errorText}`);
    }

    const data = (await response.json()) as { message?: unknown; error?: string };

    if (typeof data?.message !== 'string' || data.message.trim().length === 0) {
      const backendError = data?.error ? ` (${data.error})` : '';
      throw new Error(`Réponse invalide du serveur${backendError}.`);
    }

    return data.message.trim();
  } finally {
    clearTimeout(timeout);
  }
}
