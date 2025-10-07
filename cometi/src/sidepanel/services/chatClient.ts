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
  };
};

type BackgroundChatResponse = {
  message?: string;
  error?: string;
};

const API_URL = import.meta.env.VITE_COMETI_API_URL;

function isChromeRuntimeAvailable(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime?.sendMessage === 'function';
}

async function sendViaChromeRuntime(messages: ChromeChatMessage[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const request: BackgroundChatRequest = {
      type: 'chat:complete',
      payload: { messages },
    };

    chrome.runtime.sendMessage(request, (response?: BackgroundChatResponse) => {
      if (chrome.runtime.lastError) {
        reject(new ChromeRuntimeTransportError(chrome.runtime.lastError.message));
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

async function sendViaHttp(messages: ChromeChatMessage[]): Promise<string> {
  if (!API_URL) {
    throw new Error("URL API absente. Ajoute VITE_COMETI_API_URL dans ton fichier .env.");
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
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

export async function requestChatCompletion(messages: ChromeChatMessage[]): Promise<string> {
  if (isChromeRuntimeAvailable()) {
    try {
      return await sendViaChromeRuntime(messages);
    } catch (error) {
      if (!API_URL || !(error instanceof ChromeRuntimeTransportError)) {
        throw error;
      }
      console.warn('[Cometi] Échec via chrome.runtime, bascule sur HTTP direct :', error);
    }
  }

  return sendViaHttp(messages);
}
