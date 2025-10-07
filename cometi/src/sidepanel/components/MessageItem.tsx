import type { ConversationMessage } from '../types/chat';
import { SparkleGroupIcon } from './icons';

type MessageItemProps = {
  message: ConversationMessage;
};

export function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isAssistant = message.role === 'assistant';

  if (isAssistant) {
    return (
      <article className="space-y-4 rounded-[26px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_60px_-45px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
          <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500 shadow-inner">
            <SparkleGroupIcon className="h-4 w-4" />
          </span>
          Réponse Cometi
        </div>
        <p
          className={`whitespace-pre-line text-[15px] leading-relaxed ${
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
      <article className="max-w-xl space-y-3 rounded-[26px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-500 p-6 text-white shadow-[0_30px_60px_-35px_rgba(16,185,129,0.8)]">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-100/90">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15 text-white">
            Toi
          </div>
          Message
        </div>
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-emerald-50/95">{message.text}</p>
      </article>
    </div>
  );
}
