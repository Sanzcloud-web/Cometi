import { fetchPageContent } from './network/fetchPageContent';
import { microSearch } from './network/microSearch';
import { extractMainText } from './extractMainText';
import { detectLanguage } from './utils/language';
import { normalizeUrl, isHttpProtocol } from './utils/url';
import type { ResumeRequestPayload, ResumeServiceEnv, ResumeSummary } from './types';
import { generateSummary } from './summarize';

const NETWORK_TIMEOUT_MS = 12000;
const MIN_CONTENT_LENGTH = 800;

export async function processResumeRequest(
  payload: ResumeRequestPayload | undefined,
  env: ResumeServiceEnv
): Promise<ResumeSummary> {
  if (!payload || typeof payload.url !== 'string') {
    throw new Error('Corps de requête invalide : URL manquante.');
  }

  if (!isHttpProtocol(payload.url)) {
    throw new Error("L'URL fournie doit être accessible via HTTP ou HTTPS.");
  }

  const normalizedUrl = normalizeUrl(payload.url);
  const fallbackDom = payload.domSnapshot;
  let derivedTitle = payload.title ?? '';

  const remote = await fetchPageContent(normalizedUrl, NETWORK_TIMEOUT_MS);

  let contentType: 'text/html' | 'application/pdf' | 'unknown' = 'unknown';
  let raw: string | ArrayBuffer | undefined;

  if (remote.success) {
    contentType = remote.contentType;
    raw = remote.body;
    if (remote.title) {
      derivedTitle = remote.title;
    }

    if (
      contentType === 'text/html' &&
      typeof remote.body === 'string' &&
      remote.body.length < MIN_CONTENT_LENGTH &&
      fallbackDom?.html
    ) {
      contentType = 'text/html';
      raw = fallbackDom.html;
      derivedTitle = fallbackDom.title ?? derivedTitle;
    }
  } else if (fallbackDom?.html) {
    contentType = 'text/html';
    raw = fallbackDom.html;
    derivedTitle = fallbackDom.title ?? derivedTitle;
  } else {
    throw new Error(`Impossible de récupérer le contenu distant : ${remote.error}`);
  }

  if (!raw) {
    throw new Error("Aucun contenu exploitable pour générer le résumé.");
  }

  const extraction = await extractMainText({ contentType, raw });
  let paragraphs = extraction.paragraphs;
  const title = extraction.title?.trim() || derivedTitle || normalizedUrl;

  if (paragraphs.length === 0 && fallbackDom?.html && fallbackDom.html !== raw) {
    const fallbackExtraction = await extractMainText({ contentType: 'text/html', raw: fallbackDom.html });
    if (fallbackExtraction.paragraphs.length > 0) {
      paragraphs = fallbackExtraction.paragraphs;
      if (fallbackExtraction.title) {
        derivedTitle = fallbackExtraction.title;
      }
    }
  }

  if (paragraphs.length === 0) {
    throw new Error("Impossible d'extraire le contenu principal de la page.");
  }

  const joined = paragraphs.join('\n');
  const supplementalSources: string[] = [];

  if (joined.length < MIN_CONTENT_LENGTH) {
    const querySeed = title || paragraphs.slice(0, 2).join(' ').slice(0, 120);
    const searchResults = await microSearch(querySeed, 4);
    if (searchResults.length > 0) {
      paragraphs = [
        ...paragraphs,
        ...searchResults.map(
          (result) => `Contexte externe : ${result.title}. ${result.snippet} (source : ${result.url})`
        ),
      ];
      supplementalSources.push(...searchResults.map((result) => result.url));
    }
  }

  const language = detectLanguage(paragraphs.join('\n'));

  const summary = await generateSummary(paragraphs, language, normalizedUrl, title, env);

  const usedSources = [normalizedUrl, ...supplementalSources];

  return {
    ...summary,
    usedSources,
  };
}

export type { ResumeRequestPayload, ResumeSummary, ResumeServiceEnv } from './types';
