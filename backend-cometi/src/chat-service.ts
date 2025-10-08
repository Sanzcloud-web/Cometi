export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatPayload = {
  messages: ChatMessage[];
  chatId?: string;
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

  const totalLen = payload.messages.reduce((n, m) => n + (m.content?.length ?? 0), 0);
  console.log(`[chat] model=${model} messages=${payload.messages.length} totalLen=${totalLen} chatId=${payload.chatId ?? '<none>'}`);

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

  // Persist to history when chatId is provided
  if (payload.chatId) {
    try {
      const { appendAssistantMessage, appendUserMessage } = await import('./history');
      // Persist last user message if present
      const lastUser = [...payload.messages].reverse().find((m) => m.role === 'user');
      if (lastUser?.content) {
        await appendUserMessage(payload.chatId, lastUser.content);
      }
      await appendAssistantMessage(payload.chatId, content);
    } catch (e) {
      console.warn('[chat] persist failed:', e);
    }
  }

  return {
    status: 200,
    body: { message: content },
  };
}
