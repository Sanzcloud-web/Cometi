import { normalizeWhitespace } from '../utils/text';

export type PageFetchResult =
  | {
      success: true;
      contentType: 'text/html' | 'application/pdf' | 'unknown';
      body: string | ArrayBuffer;
      title?: string;
    }
  | {
      success: false;
      error: string;
    };

function detectContentType(headerValue: string | null): 'text/html' | 'application/pdf' | 'unknown' {
  if (!headerValue) {
    return 'unknown';
  }

  const [mime] = headerValue.split(';').map((part) => part.trim().toLowerCase());
  if (mime === 'text/html' || mime === 'application/xhtml+xml') {
    return 'text/html';
  }
  if (mime === 'application/pdf') {
    return 'application/pdf';
  }
  return 'unknown';
}

function extractTitleFromHtml(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (!match) {
    return undefined;
  }
  return normalizeWhitespace(match[1] ?? '').slice(0, 180);
}

const MAX_CONTENT_LENGTH = 15 * 1024 * 1024;

export async function fetchPageContent(url: string, timeoutMs: number): Promise<PageFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { success: false, error: `Le serveur a répondu ${response.status}.` };
    }

    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (Number.isFinite(contentLength) && contentLength > MAX_CONTENT_LENGTH) {
        return { success: false, error: 'Le contenu distant dépasse la limite autorisée de 15 MB.' };
      }
    }

    const contentType = detectContentType(response.headers.get('content-type'));

    if (contentType === 'application/pdf') {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_CONTENT_LENGTH) {
        return { success: false, error: 'Le PDF récupéré dépasse la limite autorisée de 15 MB.' };
      }
      return { success: true, contentType, body: buffer };
    }

    const text = await response.text();
    if (text.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: 'Le document HTML récupéré dépasse la limite autorisée.' };
    }

    return {
      success: true,
      contentType,
      body: text,
      title: extractTitleFromHtml(text),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'La récupération distante a expiré.'
        : error instanceof Error
          ? error.message
          : 'Échec inattendu lors de la récupération distante.';
    return { success: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
