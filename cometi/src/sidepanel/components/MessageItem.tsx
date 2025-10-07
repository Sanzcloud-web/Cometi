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
          {message.isLoading ? (
            <div className="flex items-center gap-2 text-[15px] leading-relaxed">
              <span className="shimmer-text">Réflexion</span>
              {message.text ? (
                <span className="text-slate-500">— {message.text}</span>
              ) : null}
            </div>
          ) : message.isError ? (
            <p className={`whitespace-pre-wrap text-[15px] leading-relaxed ${message.isError ? 'text-rose-600' : 'text-slate-800'}`}>
              {message.text}
            </p>
          ) : (
            <div
              className="prose prose-slate max-w-none text-[15px]
              prose-h1:mt-0 prose-h1:mb-2 prose-h1:text-2xl
              prose-h2:mt-3 prose-h2:mb-2 prose-h2:text-xl
              prose-h3:mt-3 prose-h3:mb-2 prose-h3:text-lg
              prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0
              prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
              prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
              prose-pre:bg-slate-50 prose-pre:border prose-pre:border-slate-200 prose-pre:rounded
              prose-img:rounded-md prose-table:my-3 prose-th:border prose-td:border prose-th:border-slate-200 prose-td:border-slate-200 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1"
              dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(message.text) }}
            />
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
