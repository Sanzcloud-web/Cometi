import type { ChatCompletionMessage } from './types';
import { createChatCompletion } from './network/chatCompletion';
import { handleResumeCommand } from './orchestration/resumeCommand';

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

  return undefined;
});

async function handleChatCompletion(message: { payload: { messages: ChatCompletionMessage[] } }): Promise<string> {
  return createChatCompletion(message.payload.messages);
}
