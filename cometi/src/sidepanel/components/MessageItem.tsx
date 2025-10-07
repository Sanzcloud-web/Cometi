import type { ConversationMessage, MessageAction } from '../types/chat';
import { Card } from './ui/card';
import { renderMarkdownToHtml } from '../utils/markdown';

type MessageItemProps = {
  message: ConversationMessage;
};

function handleAction(action: MessageAction) {
  if (action.type === 'copy') {
    void navigator.clipboard
      .writeText(action.value)
      .catch((error) => console.error('[Cometi] Impossible de copier le texte', error));
    return;
  }

  if (action.type === 'open') {
    const url = action.url;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      chrome.tabs.create({ url }).catch((error) => {
        console.error('[Cometi] Impossible d\'ouvrir un nouvel onglet', error);
        window.open(url, '_blank', 'noopener');
      });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }
}

export function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isAssistant = message.role === 'assistant';

  if (isAssistant) {
    // Assistant style: no bubble, simple left-aligned text like OpenAI/Claude
    return (
      <div className="flex items-start gap-3 px-4 py-5">
        <div className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full bg-slate-100 text-[10px] font-medium text-slate-500">
          C
        </div>
        <div className="min-w-0 flex-1">
          <p className="sr-only">Cometi</p>
          {message.isLoading && message.text.trim().length === 0 ? (
            <div className="h-4 w-4 animate-spin rounded-[3px] border-2 border-slate-300"></div>
          ) : (
            message.isError ? (
              <p className={`whitespace-pre-wrap text-[15px] leading-relaxed ${message.isError ? 'text-rose-600' : 'text-slate-800'}`}>
                {message.text}
              </p>
            ) : (
              <div
                className="prose prose-slate max-w-none prose-p:my-2 prose-ul:my-2 prose-li:my-0 text-[15px]"
                dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.text) }}
              />
            )
          )}
          {message.actions && message.actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.actions.map((action, index) => (
                <button
                  key={`${action.label}-${index}`}
                  type="button"
                  onClick={() => handleAction(action)}
                  className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // User style: right-aligned subtle bubble
  return (
    <div className="flex justify-end px-4 py-4">
      <div className="max-w-[80%] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">{message.text}</p>
      </div>
    </div>
  );
}
