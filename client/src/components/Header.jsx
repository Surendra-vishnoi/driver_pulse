function Header({ dailyTarget }) {
  const formattedTarget = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(dailyTarget ?? 1000)

  return (
    <header className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-400">Driver Core</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[0.08em] text-slate-100">
            DRIVER{' '}
            <span className="font-black tracking-[0.2em] text-sky-300 drop-shadow-[0_0_14px_rgba(56,189,248,0.55)]">
              PULSE
            </span>
          </h1>
          <p className="mt-1 text-sm font-medium text-emerald-400">• NOMINAL STATE</p>
          <p className="mt-3 inline-flex rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-sky-300">
            DAILY TARGET: {formattedTarget}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Stress Resonance</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]" />
              <span className="text-sm font-semibold text-emerald-400">Stable</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {['SYNC', 'BELL', 'USER'].map((label) => (
              <button
                key={label}
                type="button"
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold tracking-wide text-sky-400 transition hover:border-sky-400/50"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
