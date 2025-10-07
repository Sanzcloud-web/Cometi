import type { ChatCompletionMessage } from './types';
import { createChatCompletion } from './network/chatCompletion';
import { handleResumeCommand, buildResumeContext } from './orchestration/resumeCommand';
import { isHttpProtocol, normalizeUrl } from './utils/url';

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setOptions({
      path: 'sidepanel.html',
    });
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true,
    });
  } catch (error) {
    console.error('Erreur lors de la configuration du panneau latéral :', error);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'chat:complete') {
    void handleChatCompletion(message)
      .then((assistantMessage) => {
        sendResponse({ message: assistantMessage });
      })
      .catch((error: unknown) => {
        sendResponse({
          error: error instanceof Error ? error.message : 'Erreur inattendue lors de la requête serveur.',
        });
      });
    return true;
  }

  if (message?.type === 'commands:resume') {
    void handleResumeCommand()
      .then((result) => {
        sendResponse({ ok: true, result });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Échec inattendu de la commande /resume.',
        });
      });
    return true;
  }

  if (message?.type === 'commands:resume:context') {
    void buildResumeContext()
      .then((payload) => {
        sendResponse({ ok: true, payload });
      })
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Échec inattendu lors de la récupération du contexte /resume.',
        });
      });
    return true;
  }

  return undefined;
});

async function handleChatCompletion(message: { payload: { messages: ChatCompletionMessage[] } }): Promise<string> {
  return createChatCompletion(message.payload.messages);
}

type PageContextPayload = {
  url: string;
  title?: string;
};

let lastBroadcastKey: string | undefined;

function dispatchPageContextChange(payload: PageContextPayload) {
  const message = { type: 'page:context-changed' as const, payload };
  try {
    chrome.runtime.sendMessage(message, () => {
      // In MV3, sendMessage throws via runtime.lastError when no listeners are ready.
      if (chrome.runtime.lastError) {
        // Swallow errors silently; the sidepanel may not be active yet.
      }
    });
  } catch (error) {
    console.debug('Unable to broadcast page context change', error);
  }
}

function shouldBroadcastForTab(tab?: chrome.tabs.Tab): tab is chrome.tabs.Tab & { url: string } {
  if (!tab || typeof tab.url !== 'string') {
    return false;
  }
  return isHttpProtocol(tab.url);
}

function notifyActiveContext(tab?: chrome.tabs.Tab) {
  if (!shouldBroadcastForTab(tab)) {
    return;
  }

  const normalizedUrl = normalizeUrl(tab.url);
  const title = tab.title ?? undefined;
  const nextKey = `${normalizedUrl}::${title ?? ''}`;

  if (lastBroadcastKey === nextKey) {
    return;
  }

  lastBroadcastKey = nextKey;
  dispatchPageContextChange({ url: normalizedUrl, title });
}

async function emitCurrentActiveContext() {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    notifyActiveContext(activeTab);
  } catch (error) {
    console.debug('Unable to resolve active tab context', error);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  void chrome.tabs
    .get(activeInfo.tabId)
    .then((tab) => {
      if (tab.active) {
        notifyActiveContext(tab);
      }
    })
    .catch(() => {
      // Ignore failures when the tab is no longer available.
    });
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (!tab || !tab.active) {
    return;
  }

  const navigated = typeof changeInfo.url === 'string' || changeInfo.status === 'complete';
  if (!navigated) {
    return;
  }

  notifyActiveContext(tab);
});

void emitCurrentActiveContext();
