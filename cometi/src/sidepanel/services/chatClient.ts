import type { ChromeChatMessage } from '../types/chat';

class ChromeRuntimeTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChromeRuntimeTransportError';
  }
}

type BackgroundChatRequest = {
  type: 'chat:complete';
  payload: {
    messages: ChromeChatMessage[];
    chatId?: string;
  };
};

type BackgroundChatResponse = {
  message?: string;
  error?: string;
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const API_URL = import.meta.env.VITE_COMETI_API_URL || (API_BASE ? `${API_BASE}/chat` : undefined);
const STREAM_URL = API_BASE ? `${API_BASE}/chat-stream` : undefined;

function isChromeRuntimeAvailable(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
}

async function sendViaChromeRuntime(messages: ChromeChatMessage[], opts?: { chatId?: string }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request: BackgroundChatRequest = {
      type: 'chat:complete',
      payload: { messages, chatId: opts?.chatId },
    };

    chrome.runtime.sendMessage(request, (response?: BackgroundChatResponse) => {
      if (chrome.runtime.lastError) {
        reject(new ChromeRuntimeTransportError(chrome.runtime.lastError.message ?? 'Runtime error'));
        return;
      }

      if (!response) {
        reject(new ChromeRuntimeTransportError('Réponse vide du service d’arrière-plan.'));
        return;
      }

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      if (typeof response.message !== 'string' || response.message.trim().length === 0) {
        reject(new ChromeRuntimeTransportError('Réponse invalide du service d’arrière-plan.'));
        return;
      }

      resolve(response.message.trim());
    });
  });
}

async function sendViaHttp(messages: ChromeChatMessage[], opts?: { chatId?: string }): Promise<string> {
  if (!API_URL) {
    throw new Error(
      "URL API absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) ou VITE_COMETI_API_URL dans ton fichier .env."
    );
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages, chatId: opts?.chatId }),
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
}

export async function requestChatCompletion(messages: ChromeChatMessage[], opts?: { chatId?: string }): Promise<string> {
  if (isChromeRuntimeAvailable()) {
    try {
      return await sendViaChromeRuntime(messages, opts);
    } catch (error) {
      if (!API_URL || !(error instanceof ChromeRuntimeTransportError)) {
        throw error;
      }
      console.warn('[Cometi] Échec via chrome.runtime, bascule sur HTTP direct :', error);
    }
  }

  return sendViaHttp(messages, opts);
}

export async function requestChatCompletionStream(
  messages: ChromeChatMessage[],
  onDelta: (chunk: string) => void
  , opts?: { chatId?: string }
): Promise<string> {
  // Prefer streaming over HTTP when base URL available
  if (!STREAM_URL) {
    // Fall back to non-stream HTTP
    const full = await sendViaHttp(messages, opts);
    onDelta(full);
    return full;
  }

  const response = await fetch(STREAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, chatId: opts?.chatId }),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`Stream HTTP ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
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
      const lines = part.split('\n');
      let event: string | undefined;
      let data: string | undefined;
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.replace(/^event:\s*/, '').trim();
        if (line.startsWith('data:')) data = line.replace(/^data:\s?/, '');
      }
      if (event === 'delta' && data) {
        try {
          const payload = JSON.parse(data) as { delta?: string };
          if (payload.delta) {
            acc += payload.delta;
            onDelta(payload.delta);
          }
        } catch {
          // ignore
        }
      } else if (event === 'done') {
        return acc;
      }
    }
  }

  return acc;
}
