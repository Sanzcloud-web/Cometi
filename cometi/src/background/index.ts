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

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini';

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
        error: error instanceof Error ? error.message : 'Erreur inattendue lors de la requête OpenAI.',
      };
      sendResponse(response);
    });

  return true;
});

async function createChatCompletion(messages: ChatCompletionMessage[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('Clé API absente. Ajoute VITE_OPENAI_API_KEY dans ton fichier .env.');
  }

  const requestBody = JSON.stringify({
    model: OPENAI_MODEL,
    messages,
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI a renvoyé ${response.status} : ${errorText}`);
  }

  const data = await response.json();
  const content: unknown = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI a renvoyé une réponse vide.');
  }

  return content.trim();
}
