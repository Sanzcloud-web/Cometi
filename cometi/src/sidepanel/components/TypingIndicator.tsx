import { LoaderDots } from './icons';

export function TypingIndicator(): JSX.Element {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_20px_50px_-45px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className="flex items-center justify-center gap-2 text-emerald-500">
        <LoaderDots className="h-6 w-16 text-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-500">Cometi rédige…</span>
      </div>
    </div>
  );
}
