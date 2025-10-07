import { captureRenderedDom } from '../network/captureDom';
import { getActiveHttpTab } from '../network/getActiveTab';
import { logger } from '../utils/logger';
import { normalizeUrl } from '../utils/url';
import type { ResumeCommandResult } from '../types';

export type ResumeCommandPayload = {
  url: string;
  title?: string;
  domSnapshot?: {
    html: string;
    title?: string;
  };
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const RESUME_API_URL =
  import.meta.env.VITE_COMETI_RESUME_URL || (API_BASE ? `${API_BASE}/resume` : undefined);

function ensureResumeApiUrl(): string {
  if (!RESUME_API_URL) {
    throw new Error(
      "URL API /resume absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) ou VITE_COMETI_RESUME_URL dans ton fichier .env."
    );
  }
  return RESUME_API_URL;
}

function isValidResumeResult(payload: unknown): payload is ResumeCommandResult {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<ResumeCommandResult>;
  return (
    typeof candidate.url === 'string' &&
    typeof candidate.title === 'string' &&
    Array.isArray(candidate.tldr) &&
    typeof candidate.summary === 'string' &&
    Array.isArray(candidate.usedSources)
  );
}

export async function buildResumeContext(): Promise<ResumeCommandPayload> {
  const tab = await getActiveHttpTab();
  const normalizedUrl = normalizeUrl(tab.url ?? '');

  const payload: ResumeCommandPayload = {
    url: normalizedUrl,
    title: tab.title ?? undefined,
  };

  if (typeof tab.id === 'number') {
    const dom = await captureRenderedDom(tab.id);
    if (dom.success && dom.html.trim().length > 0) {
      payload.domSnapshot = { html: dom.html, title: dom.title || undefined };
    } else if (!dom.success) {
      logger.debug('Capture DOM indisponible', { reason: dom.error });
    }
  }
  return payload;
}

export async function handleResumeCommand(): Promise<ResumeCommandResult> {
  const payload = await buildResumeContext();

  const response = await fetch(ensureResumeApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => undefined);

  if (!response.ok) {
    const errorMessage =
      data && typeof data.error === 'string'
        ? data.error
        : `Le serveur résumé a renvoyé ${response.status}.`;
    throw new Error(errorMessage);
  }

  if (!isValidResumeResult(data)) {
    throw new Error('Réponse invalide du service de résumé.');
  }

  return data;
}
