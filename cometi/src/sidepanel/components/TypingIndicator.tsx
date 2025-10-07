import { LoaderDots } from './icons';
import { Card } from './ui/card';

export function TypingIndicator(): JSX.Element {
  return (
    <Card className="flex items-center justify-center gap-2 border-slate-200 bg-white/90 text-slate-500">
      <LoaderDots className="h-6 w-16 text-slate-400" />
      <span className="text-xs font-medium uppercase tracking-[0.2em]">Cometi rédige…</span>
    </Card>
  );
}
