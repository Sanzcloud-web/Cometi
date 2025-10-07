type ChatCompletionMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type ChatCompletionRequest = {
  type: 'chat:complete';
  payload: {
    messages: ChatCompletionMessage[];
  };
};

type ChatCompletionResponse =
  | {
      message: string;
    }
  | {
      error: string;
    };

const API_URL = import.meta.env.VITE_COMETI_API_URL;

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
    });
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Erreur lors de la configuration du panneau latéral :', error);
  }
});

chrome.runtime.onMessage.addListener((message: ChatCompletionRequest, _sender, sendResponse) => {
  if (message?.type !== 'chat:complete') {
    return undefined;
  }

  void createChatCompletion(message.payload.messages)
    .then((assistantMessage) => {
      const response: ChatCompletionResponse = { message: assistantMessage };
      sendResponse(response);
    })
    .catch((error: unknown) => {
      const response: ChatCompletionResponse = {
        error: error instanceof Error ? error.message : 'Erreur inattendue lors de la requête serveur.',
      };
      sendResponse(response);
    });

  return true;
});

async function createChatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  if (!API_URL) {
    throw new Error('URL API absente. Ajoute VITE_COMETI_API_URL dans ton fichier .env.');
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
