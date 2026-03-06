function Sidebar() {
  const goal = 75

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <nav className="space-y-2">
        {['Console', 'Analytics', 'Logs'].map((item) => (
          <button
            key={item}
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-sky-400/40 hover:text-sky-400"
          >
            <span>{item}</span>
            <span className="h-2 w-2 rounded-full bg-sky-400/80" />
          </button>
        ))}
      </nav>

      <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Driver Stats</p>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="grid h-20 w-20 place-items-center rounded-full"
            style={{
              background: `conic-gradient(rgb(56 189 248) ${goal * 3.6}deg, rgb(51 65 85) 0deg)`,
            }}
          >
            <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-sm font-semibold text-slate-100">
              {goal}%
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Daily Goal</p>
            <p className="mt-1 text-lg font-semibold text-sky-400">On Track</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Earned Revenue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">$842.50</p>
        </div>
      </section>

      <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Operator</p>
        <p className="mt-1 text-base font-semibold text-slate-100">Alex Vane</p>
        <p className="text-xs text-slate-400">ID: 4882-QX</p>
        <button
          type="button"
          className="mt-4 w-full rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-400 transition hover:bg-sky-400/20"
        >
          System Config
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
