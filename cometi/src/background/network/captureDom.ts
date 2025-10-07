import { logger } from '../utils/logger';

export type DomCaptureResult = {
  success: true;
  html: string;
  title: string;
};

export type DomCaptureFailure = {
  success: false;
  error: string;
};

export async function captureRenderedDom(tabId: number): Promise<DomCaptureResult | DomCaptureFailure> {
  try {
    const [result] = await chrome.scripting.executeScript<{ html: string; title: string } | undefined>({
      target: { tabId },
      func: () => {
        try {
          const doc = document;
          const html = doc.documentElement?.outerHTML ?? '';
          const title = doc.title ?? '';
          return { html, title };
        } catch (error) {
          console.error('captureRenderedDom: script error', error);
          return undefined;
        }
      },
    });

    if (!result?.result || typeof result.result.html !== 'string') {
      return { success: false, error: 'Extraction DOM impossible.' };
    }

    logger.debug('DOM captured from active tab', { tabId });
    return { success: true, html: result.result.html, title: result.result.title ?? '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue lors de la capture DOM.';
    logger.warn('captureRenderedDom failed', { tabId, message });
    return { success: false, error: message };
  }
}
