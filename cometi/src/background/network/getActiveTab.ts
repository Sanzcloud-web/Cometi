import { logger } from '../utils/logger';
import { isHttpProtocol } from '../utils/url';

export async function getActiveHttpTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });

  if (!tab || typeof tab.id !== 'number' || !tab.url) {
    throw new Error("Impossible de déterminer l'onglet actif.");
  }

  if (!isHttpProtocol(tab.url)) {
    throw new Error("L'URL de l'onglet actif doit être accessible via HTTP ou HTTPS.");
  }

  logger.debug('Active tab selected', { url: tab.url, title: tab.title });
  return tab;
}
