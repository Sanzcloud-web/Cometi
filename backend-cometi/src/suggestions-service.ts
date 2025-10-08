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

const SUMMARY_KEYWORDS = [
  'résum',
  'synth',
  'analyse',
  'avis',
  'opinion',
  'argument',
  'points clés',
  'tendance',
];

const QUESTION_PREFIXES = ['comment', 'pourquoi', 'quel', 'quelle', 'quels', 'quelles', 'que ', 'quoi', 'qui'];

const DEFAULT_SUMMARY_SUGGESTIONS: Suggestion[] = [
  { id: 1, label: 'Résumé des points clés' },
  { id: 2, label: 'Analyse du ton général' },
  { id: 3, label: 'Avis principaux exprimés' },
  { id: 4, label: 'Arguments récurrents' },
  { id: 5, label: 'Questions ouvertes à explorer ?' },
];

function isSummaryOrQuestion(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('?')) {
    return true;
  }
  for (const keyword of SUMMARY_KEYWORDS) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }
  for (const prefix of QUESTION_PREFIXES) {
    if (normalized.startsWith(prefix)) {
      return true;
    }
  }
  return false;
}

function normalizeSummaryLabels(items: Suggestion[]): Suggestion[] {
  const filtered = items.filter((item) => isSummaryOrQuestion(item.label));
  if (filtered.length === 0) {
    return DEFAULT_SUMMARY_SUGGESTIONS.map((suggestion, index) => ({
      id: index + 1,
      label: suggestion.label,
    }));
  }

  return filtered.slice(0, 5).map((suggestion, index) => ({
    id: index + 1,
    label: suggestion.label,
  }));
}

function buildPrompt(payload: SuggestionPayload): { role: 'system' | 'user'; content: string }[] {
  const language = payload.language ?? 'fr';
  const intro =
    language === 'fr'
      ?
        "Tu es un générateur de suggestions de résumés pour une extension de navigateur. " +
        'Tu dois toujours renvoyer un JSON strict conforme au schéma {"suggestions": [{"id": number, "label": string}]}. '
      :
        'You generate summary suggestions for a browser extension. ' +
        'Always respond with strict JSON using the schema {"suggestions": [{"id": number, "label": string}]}. ';

  const tone =
    language === 'fr'
      ?
        "Les labels doivent proposer soit un résumé, soit une question d'analyse (max 70 caractères). " +
        "N'indique jamais une action à réaliser (pas de suivre, cliquer, liker, etc.). "
      :
        'Labels must offer either a summary or an analytical question (max 70 characters). ' +
        'Never suggest a direct action (no follow, click, like, etc.). ';

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

      const normalized = normalizeSummaryLabels(suggestions);
      if (normalized.length > 0) {
        return normalized;
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
