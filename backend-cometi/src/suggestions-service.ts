const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-nano';

export type SuggestionPayload = {
  domain?: string;
  context?: string;
  language?: 'fr' | 'en';
};

export type Suggestion = {
  id: number;
  label: string;
};

export type SuggestionServiceEnv = {
  apiKey?: string;
  model?: string;
};

export type SuggestionServiceResult = {
  status: number;
  body: {
    suggestions?: Suggestion[];
    error?: string;
  };
};

function buildPrompt(payload: SuggestionPayload): { role: 'system' | 'user'; content: string }[] {
  const language = payload.language ?? 'fr';
  const intro =
    language === 'fr'
      ?
        "Tu es un générateur de suggestions d'actions pour une extension de navigateur. " +
        'Tu dois toujours renvoyer un JSON strict conforme au schéma {"suggestions": [{"id": number, "label": string}]}. '
      :
        'You generate action suggestions for a browser extension. ' +
        'Always respond with strict JSON using the schema {"suggestions": [{"id": number, "label": string}]}. ';

  const tone =
    language === 'fr'
      ?
        'Les labels doivent être de courtes commandes utiles (maximum 60 caractères), adaptées au site, et commencer par un verbe. '
      :
        'Labels must be short actionable commands (max 60 characters) tailored to the site and start with a verb. ';

  const systemMessage = `${intro}${tone}Numérote les suggestions de 1 à 5.`;

  const siteDescriptionParts = [] as string[];
  if (payload.domain) {
    siteDescriptionParts.push(
      language === 'fr'
        ? `Domaine: ${payload.domain}`
        : `Domain: ${payload.domain}`
    );
  }
  if (payload.context) {
    siteDescriptionParts.push(
      language === 'fr'
        ? `Contexte: ${payload.context}`
        : `Context: ${payload.context}`
    );
  }

  const userMessage =
    siteDescriptionParts.length > 0
      ? siteDescriptionParts.join('\n')
      : language === 'fr'
        ? "Génère des suggestions génériques pour une page web sans contexte."
        : 'Generate generic suggestions for a web page with no context.';

  return [
    { role: 'system', content: systemMessage },
    { role: 'user', content: userMessage },
  ];
}

function parseSuggestions(raw: string | undefined): Suggestion[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as any).suggestions)
    ) {
      const suggestions = (parsed as any).suggestions
        .filter((item: any) => typeof item === 'object' && item !== null)
        .map((item: any, index: number) => {
          const id = Number.isInteger(item.id) ? item.id : index + 1;
          const label = typeof item.label === 'string' ? item.label.trim() : '';
          const suggestion: Suggestion = { id, label };
          return suggestion;
        })
        .filter((item: Suggestion) => item.label.length > 0);

      if (suggestions.length > 0) {
        return suggestions;
      }
    }
  } catch (error) {
    console.error('[suggestions] JSON parse error', error);
  }
  return undefined;
}

export async function processSuggestionRequest(
  payload: SuggestionPayload | undefined,
  env: SuggestionServiceEnv
): Promise<SuggestionServiceResult> {
  if (!env.apiKey) {
    return {
      status: 500,
      body: { error: 'OPENAI_API_KEY manquante côté serveur.' },
    };
  }

  const messages = buildPrompt(payload ?? {});
  const model = env.model ?? DEFAULT_MODEL;

  console.log(
    `[suggestions] model=${model} domain=${payload?.domain ?? '<none>'} contextLen=${payload?.context?.length ?? 0}`
  );

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    return {
      status: response.status,
      body: { error: `OpenAI a renvoyé ${response.status}: ${text}` },
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data?.choices?.[0]?.message?.content;
  const suggestions = parseSuggestions(content);

  if (!suggestions) {
    return {
      status: 500,
      body: { error: "OpenAI n'a pas renvoyé de JSON exploitable." },
    };
  }

  return {
    status: 200,
    body: { suggestions },
  };
}
