import { LoaderDots } from './icons';

export function TypingIndicator(): JSX.Element {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="flex items-center justify-center gap-2 text-emerald-500">
        <LoaderDots className="h-6 w-20 text-emerald-400" />
        <span className="text-xs font-medium uppercase tracking-wide text-emerald-500">Cometi rédige…</span>
      </div>
    </div>
  );
}
