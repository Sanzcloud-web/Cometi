import type { ConversationMessage, MessageAction } from '../types/chat';
import { Card } from './ui/card';

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
    return (
      <Card className="space-y-2 border-slate-200 bg-white/95">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">Cometi</p>
        <p className={`whitespace-pre-line text-sm leading-relaxed ${message.isError ? 'text-rose-600' : 'text-slate-700'}`}>
          {message.text}
        </p>
        {message.actions && message.actions.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {message.actions.map((action, index) => (
              <button
                key={`${action.label}-${index}`}
                type="button"
                onClick={() => handleAction(action)}
                className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <Card className="max-w-xl space-y-2 border-slate-200 bg-white text-slate-900">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-500">Toi</p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{message.text}</p>
      </Card>
    </div>
  );
}
