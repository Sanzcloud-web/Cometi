import type { ChatMessage } from '../chat-service';
import { processChatRequest } from '../chat-service';
import type { ResumeServiceEnv, ResumeSummary } from './types';
import { chunkText } from './utils/text';

const MAX_DIRECT_INPUT_LENGTH = 12000;

async function requestCompletion(messages: ChatMessage[], env: ResumeServiceEnv): Promise<string> {
  const result = await processChatRequest({ messages }, env);

  if (result.status !== 200 || typeof result.body.message !== 'string') {
    const backendError = typeof result.body.error === 'string' ? ` (${result.body.error})` : '';
    throw new Error(`La requête de résumé a échoué${backendError}.`);
  }

  return result.body.message.trim();
}

type FinalSummaryPayload = {
  tldr: string[];
  summary: string;
};

export function sanitizeJsonPayload(raw: string): unknown {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    throw new Error("Le modèle a renvoyé un format de résumé invalide.");
  }
}

async function summarizeChunk(text: string, language: string, env: ResumeServiceEnv): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'Tu es un assistant qui résume du texte pour un pipeline de synthèse. Réponds dans la même langue que le texte source.',
    },
    {
      role: 'user',
      content: `Langue attendue : ${language}. Fournis un résumé concis (5 phrases maximum) du passage suivant pour préparer un résumé global.\n\n${text}`,
    },
  ];

  return requestCompletion(messages, env);
}

export function buildFinalSummaryPrompt(text: string, language: string, url: string): ChatMessage[] {
  const systemPrompt =
    'Tu es un assistant de résumé méticuleux. Retourne toujours un objet JSON avec les champs "tldr" (tableau de 3 à 5 puces concises) et "summary" (un paragraphe de 150 à 220 mots). Sois fidèle au texte fourni.';
  const userPrompt =
    `Langue attendue : ${language}. Résume le contenu provenant de ${url}. Fournis des faits vérifiables, aucune spéculation.\n\nCONTENU :\n${text}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// Version texte (non-JSON) pour le streaming
export function buildFinalSummaryTextPrompt(text: string, language: string, url: string): ChatMessage[] {
  const systemPrompt =
    "Tu es un assistant qui rédige un résumé clair, bien aéré et lisible en Markdown. Interdictions absolues: pas de JSON, pas de balises HTML, pas de blocs de code. Respecte strictement l'espacement normal entre les mots. Commence directement par le contenu demandé, sans préambule.";
  const userPrompt = `Langue attendue : ${language}. À partir du contenu suivant provenant de ${url}, produis un résumé en Markdown avec la structure EXACTE suivante :\n\n` +
    [
      '## TL;DR',
      '- 3 à 5 puces concises, une par ligne, chaque puce commence par "- " (tiret + espace).',
      '',
      '## Résumé',
      'Un ou deux paragraphes (150 à 220 mots au total). Reste factuel et évite toute spéculation.',
      '',
      '(Ne mentionne pas de sources si elles ne sont pas fournies explicitement dans le contenu ci-dessous.)',
      '',
      'CONTENU :',
      text,
    ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// Extremely simple text prompt: feed top chunks and ask for a concise summary in the target language.
export function buildSimpleSummaryTextPromptFromChunks(
  topChunks: string[],
  language: string,
  url: string
): ChatMessage[] {
  const systemPrompt =
    [
      `Tu es un assistant qui rédige des résumés clairs et lisibles en ${language}.`,
      "Interdictions absolues: pas de JSON, pas de balises HTML, pas de blocs de code.",
      "Respecte STRICTEMENT les espaces entre les mots et la ponctuation.",
      "Insère des retours à la ligne (\n) pour séparer titres, puces et paragraphes.",
      "Structure exactement comme suit et commence immédiatement par le contenu demandé:",
      "## TL;DR",
      "- 3 à 5 puces, chaque ligne commence par '- ' (tiret + espace).",
      "",
      "## Résumé",
      "Un ou deux paragraphes concis (150 à 220 mots au total). Reste factuel, sans spéculation.",
    ].join('\n');

  const joined = topChunks.join('\n\n');
  const userPrompt =
    [
      `Langue attendue : ${language}. À partir des extraits ci-dessous provenant de ${url}, rédige le résumé demandé avec la structure ci-dessus.`,
      "N'invente pas d'informations. N'inclus pas de sources si elles ne sont pas explicitement présentes.",
      '',
      'EXTRAITS SÉLECTIONNÉS (max 6):',
      joined,
    ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export async function generateSummary(
  paragraphs: string[],
  language: string,
  url: string,
  title: string,
  env: ResumeServiceEnv
): Promise<Omit<ResumeSummary, 'usedSources'>> {
  const combined = paragraphs.join('\n\n');
  let synthesisSource = combined;

  if (combined.length > MAX_DIRECT_INPUT_LENGTH) {
    const chunks = chunkText(paragraphs, 4000);
    console.log(`[resume] chunking: combinedLen=${combined.length} chunks=${chunks.length}`);
    const miniSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[resume] summarizing chunk ${i + 1}/${chunks.length} len=${chunk.length}`);
      const chunkSummary = await summarizeChunk(chunk, language, env);
      console.log(`[resume] chunk ${i + 1}/${chunks.length} summarized len=${chunkSummary.length}`);
      miniSummaries.push(chunkSummary);
    }
    synthesisSource = miniSummaries.join('\n\n');
  }

  const messages = buildFinalSummaryPrompt(synthesisSource, language, url);
  console.log(`[resume] requesting final summary sourceLen=${synthesisSource.length}`);
  const rawSummary = await requestCompletion(messages, env);
  console.log(`[resume] final summary received len=${rawSummary.length}`);
  const parsed = sanitizeJsonPayload(rawSummary) as Partial<FinalSummaryPayload>;

  if (!parsed || !Array.isArray(parsed.tldr) || typeof parsed.summary !== 'string') {
    throw new Error('Le modèle a fourni une réponse JSON incomplète.');
  }

  const tldr = parsed.tldr
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 5);

  if (tldr.length < 3) {
    throw new Error('Le modèle a fourni trop peu de puces pour le TL;DR.');
  }

  const summary = parsed.summary.trim();
  if (summary.length === 0) {
    throw new Error('Le résumé long est vide.');
  }

  return {
    url,
    title,
    tldr,
    summary,
  };
}

export async function generateSummarySinglePass(
  paragraphs: string[],
  language: string,
  url: string,
  title: string,
  env: ResumeServiceEnv
): Promise<Omit<ResumeSummary, 'usedSources'>> {
  const combined = paragraphs.join('\n\n');
  console.log(`[resume] single-pass contextLen=${combined.length}`);

  const messages = buildFinalSummaryPrompt(combined, language, url);
  const raw = await requestCompletion(messages, env);
  console.log(`[resume] single-pass response len=${raw.length}`);
  const parsed = sanitizeJsonPayload(raw) as Partial<FinalSummaryPayload>;

  if (!parsed || !Array.isArray(parsed.tldr) || typeof parsed.summary !== 'string') {
    throw new Error('Le modèle a fourni une réponse JSON incomplète.');
  }

  const tldr = parsed.tldr
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
    .slice(0, 5);

  if (tldr.length < 3) {
    throw new Error('Le modèle a fourni trop peu de puces pour le TL;DR.');
  }

  const summary = parsed.summary.trim();
  if (summary.length === 0) {
    throw new Error('Le résumé long est vide.');
  }

  return {
    url,
    title,
    tldr,
    summary,
  };
}
