import type { ConversationMessage } from '../types/chat';
import { SparkleGroupIcon } from './icons';

function AssistantBadge(): JSX.Element {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <SparkleGroupIcon className="h-4 w-4" />
      </div>
      Assistant Cometi
    </div>
  );
}

type MessageItemProps = {
  message: ConversationMessage;
};

export function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isAssistant = message.role === 'assistant';

  if (isAssistant) {
    return (
      <article className="space-y-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <AssistantBadge />
        <p
          className={`whitespace-pre-line text-sm leading-relaxed ${
            message.isError ? 'text-rose-600' : 'text-slate-700'
          }`}
        >
          {message.text}
        </p>
      </article>
    );
  }

  return (
    <div className="flex justify-end">
      <article className="max-w-xl space-y-3 rounded-3xl bg-gradient-to-r from-emerald-500 to-emerald-400 p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-50/80">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/40 text-white">
            Tu
          </div>
          Ton message
        </div>
        <p className="whitespace-pre-line text-sm leading-relaxed text-emerald-50">{message.text}</p>
      </article>
    </div>
  );
}
