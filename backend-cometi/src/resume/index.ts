import { fetchPageContent } from './network/fetchPageContent';
import { microSearch } from './network/microSearch';
import { extractMainText } from './extractMainText';
import { detectLanguage } from './utils/language';
import { normalizeUrl, isHttpProtocol } from './utils/url';
import type { ResumeRequestPayload, ResumeServiceEnv, ResumeSummary } from './types';
import { generateSummary, generateSummarySinglePass } from './summarize';
import { indexAndSelectTopChunks } from './retrieval';

const NETWORK_TIMEOUT_MS = 12000;
const MIN_CONTENT_LENGTH = 800;

export async function processResumeRequest(
  payload: ResumeRequestPayload | undefined,
  env: ResumeServiceEnv
): Promise<ResumeSummary> {
  const reqId = Math.random().toString(36).slice(2, 8);
  if (!payload || typeof payload.url !== 'string') {
    throw new Error('Corps de requête invalide : URL manquante.');
  }

  if (!isHttpProtocol(payload.url)) {
    throw new Error("L'URL fournie doit être accessible via HTTP ou HTTPS.");
  }

  const normalizedUrl = normalizeUrl(payload.url);
  const fallbackDom = payload.domSnapshot;
  let derivedTitle = payload.title ?? '';
  console.log(`[resume ${reqId}] start url=${normalizedUrl} titleLen=${derivedTitle.length} hasDom=${Boolean(fallbackDom?.html)} domLen=${fallbackDom?.html?.length ?? 0}`);

  const remote = await fetchPageContent(normalizedUrl, NETWORK_TIMEOUT_MS);
  if (remote.success) {
    const bodyLen = typeof remote.body === 'string' ? remote.body.length : remote.body.byteLength;
    console.log(
      `[resume ${reqId}] fetched remote ok type=${remote.contentType} bodyLen=${bodyLen} titleLen=${remote.title?.length ?? 0}`
    );
  } else {
    console.warn(`[resume ${reqId}] fetch remote failed: ${remote.error}`);
  }

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
    console.log(`[resume ${reqId}] using fallback DOM only (no remote). domLen=${fallbackDom.html.length}`);
  } else {
    throw new Error(`Impossible de récupérer le contenu distant : ${remote.error}`);
  }

  if (!raw) {
    throw new Error("Aucun contenu exploitable pour générer le résumé.");
  }

  const extraction = await extractMainText({ contentType, raw });
  let paragraphs = extraction.paragraphs;
  const title = extraction.title?.trim() || derivedTitle || normalizedUrl;
  console.log(
    `[resume ${reqId}] extracted paragraphs=${paragraphs.length} titleLen=${(extraction.title ?? derivedTitle).length}`
  );

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
    console.log(`[resume ${reqId}] microSearch results=${searchResults.length}`);
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
  console.log(`[resume ${reqId}] language=${language}`);

  // If embeddings DB is configured, index and select top-K chunks for summarization
  if (process.env.DB_EMBEDDING) {
    console.log(`[resume ${reqId}] embeddings DB detected, selecting top chunks`);
    paragraphs = await indexAndSelectTopChunks(normalizedUrl, title, paragraphs, env);
    console.log(`[resume ${reqId}] selected top paragraphs=${paragraphs.length}`);
  }

  const summary = process.env.DB_EMBEDDING
    ? await generateSummarySinglePass(paragraphs, language, normalizedUrl, title, env)
    : await generateSummary(paragraphs, language, normalizedUrl, title, env);
  console.log(`[resume ${reqId}] summary ready tldr=${summary.tldr.length} summaryLen=${summary.summary.length}`);

  const usedSources = [normalizedUrl, ...supplementalSources];

  return {
    ...summary,
    usedSources,
  };
}

export type { ResumeRequestPayload, ResumeSummary, ResumeServiceEnv } from './types';
