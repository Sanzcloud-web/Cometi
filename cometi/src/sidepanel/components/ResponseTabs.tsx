export function ResponseTabs(): JSX.Element {
  return (
    <div className="mb-6 flex items-center gap-4 overflow-x-auto rounded-3xl border border-slate-200 bg-white p-1 text-sm font-medium text-slate-500 shadow-sm">
      <button
        type="button"
        className="rounded-3xl bg-emerald-500/10 px-4 py-2 text-emerald-600 shadow-sm ring-1 ring-emerald-200"
      >
        Réponse
      </button>
      <button type="button" className="rounded-3xl px-4 py-2 transition hover:text-slate-700">
        Sources · 0
      </button>
      <button type="button" className="rounded-3xl px-4 py-2 transition hover:text-slate-700">
        Actions suggérées
      </button>
    </div>
  );
}
