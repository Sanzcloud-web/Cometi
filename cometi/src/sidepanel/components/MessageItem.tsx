import type { ConversationMessage } from '../types/chat';
import { Card } from './ui/card';

type MessageItemProps = {
  message: ConversationMessage;
};

export function MessageItem({ message }: MessageItemProps): JSX.Element {
  const isAssistant = message.role === 'assistant';

  if (isAssistant) {
    return (
      <Card className="space-y-2 border-slate-200 bg-white/95">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-400">Cometi</p>
        <p className={`whitespace-pre-line text-sm leading-relaxed ${message.isError ? 'text-rose-600' : 'text-slate-700'}`}>
          {message.text}
        </p>
      </Card>
    );
  }

  return (
    <div className="flex justify-end">
      <Card className="max-w-xl space-y-2 border-slate-900/10 bg-slate-900 text-slate-50">
        <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-slate-200">Toi</p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-50/95">{message.text}</p>
      </Card>
    </div>
  );
}
