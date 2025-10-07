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

function sanitizeJsonPayload(raw: string): unknown {
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

function buildFinalSummaryPrompt(text: string, language: string, url: string): ChatMessage[] {
  const systemPrompt =
    'Tu es un assistant de résumé méticuleux. Retourne toujours un objet JSON avec les champs "tldr" (tableau de 3 à 5 puces concises) et "summary" (un paragraphe de 150 à 220 mots). Sois fidèle au texte fourni.';
  const userPrompt =
    `Langue attendue : ${language}. Résume le contenu provenant de ${url}. Fournis des faits vérifiables, aucune spéculation.\n\nCONTENU :\n${text}`;

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
