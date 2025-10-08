import type { Suggestion } from '../types/suggestions';

type SuggestionResponse = {
  suggestions?: Array<{ id?: unknown; label?: unknown }>;
  error?: unknown;
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const SUGGESTIONS_URL =
  import.meta.env.VITE_COMETI_SUGGESTIONS_URL || (API_BASE ? `${API_BASE}/suggestions` : undefined);

function ensureSuggestionsUrl(): string {
  if (!SUGGESTIONS_URL) {
    throw new Error(
      "URL API /suggestions absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) ou VITE_COMETI_SUGGESTIONS_URL dans ton fichier .env."
    );
  }
  return SUGGESTIONS_URL;
}

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
function normalizeSuggestions(payload: SuggestionResponse): Suggestion[] {
  if (!payload || !Array.isArray(payload.suggestions)) {
    throw new Error('Réponse invalide du service de suggestions.');
  }

  const mapped = payload.suggestions
    .map((raw, index): Suggestion | null => {
      if (!raw || typeof raw !== 'object') return null;
      const label = typeof raw.label === 'string' ? raw.label.trim() : '';
      if (!label) return null;
      const idValue = raw.id;
      const id = typeof idValue === 'number' && Number.isInteger(idValue) ? idValue : index + 1;
      return { id, label };
    })
    .filter((item): item is Suggestion => item !== null)
    .filter((item) => isSummaryOrQuestion(item.label));

  if (mapped.length === 0) {
    return DEFAULT_SUMMARY_SUGGESTIONS.map((suggestion, index) => ({
      id: index + 1,
      label: suggestion.label,
    }));
  }

  return mapped;
}

export async function requestSuggestions(payload: {
  domain?: string;
  context?: string;
  snippet?: string;
  language?: 'fr' | 'en';
}): Promise<Suggestion[]> {
  const response = await fetch(ensureSuggestionsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Le service de suggestions a renvoyé ${response.status}. ${text}`.trim());
  }

  const data = (await response.json().catch(() => undefined)) as SuggestionResponse | undefined;
  if (!data) {
    throw new Error('Réponse vide du service de suggestions.');
  }

  if (typeof data.error === 'string' && data.error.trim().length > 0) {
    throw new Error(data.error.trim());
  }

  return normalizeSuggestions(data);
}
