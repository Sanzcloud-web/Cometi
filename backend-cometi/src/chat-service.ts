export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatPayload = {
  messages: ChatMessage[];
};

export type ChatServiceEnv = {
  apiKey?: string;
  model?: string;
};

export type ChatServiceResult = {
  status: number;
  body: {
    message?: string;
    error?: string;
  };
};

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

function isValidMessage(message: ChatMessage): boolean {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
}

export async function processChatRequest(
  payload: ChatPayload | undefined,
  env: ChatServiceEnv
): Promise<ChatServiceResult> {
  const apiKey = env.apiKey;
  const model = env.model ?? DEFAULT_MODEL;

  if (!apiKey) {
    return {
      status: 500,
      body: { error: 'OPENAI_API_KEY manquante côté serveur.' },
    };
  }

  if (!payload || !Array.isArray(payload.messages)) {
    return {
      status: 400,
      body: { error: 'Corps de requête invalide: messages manquants.' },
    };
  }

  if (!payload.messages.every(isValidMessage)) {
    return {
      status: 400,
      body: { error: 'Format de message invalide.' },
    };
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: payload.messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      status: response.status,
      body: { error: `OpenAI a renvoyé ${response.status}: ${errorText}` },
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content?.trim();

  if (!content) {
    return {
      status: 500,
      body: { error: 'OpenAI a renvoyé une réponse vide.' },
    };
  }

  return {
    status: 200,
    body: { message: content },
  };
}
