export function ResponseTabs(): JSX.Element {
  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded-full border border-white/70 bg-white/70 px-2 py-1 text-sm font-medium text-slate-500 shadow-[0_15px_45px_-40px_rgba(15,23,42,0.6)] backdrop-blur">
      <button
        type="button"
        className="rounded-full bg-slate-900 px-5 py-2 text-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.8)]"
      >
        Réponse
      </button>
      <button type="button" className="rounded-full px-5 py-2 transition hover:text-slate-700">
        Sources · 0
      </button>
      <button type="button" className="rounded-full px-5 py-2 transition hover:text-slate-700">
        Actions
      </button>
    </div>
  );
}
