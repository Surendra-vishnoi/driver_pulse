const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function Sidebar({ stats, onOpenConsole, onOpenLogs, onOpenAnalytics, onOpenNotifications }) {
  const currentEarnings = Number(stats?.effective_current_earnings ?? stats?.current_earnings) || 0
  const targetEarnings = Math.max(1, Number(stats?.target_earnings) || 1500)
  const rawPercent = (currentEarnings / targetEarnings) * 100
  const goal = clamp(rawPercent, 0, 100)

  const paceBand = String(stats?.pace_band || '').toLowerCase()
  const statusLabel =
    paceBand === 'ahead' ? 'Ahead' :
    paceBand === 'on_track' ? 'On Track' :
    paceBand === 'slightly_behind' ? 'Slightly Behind' :
    paceBand === 'at_risk' ? 'At Risk' :
    paceBand === 'off_track' ? 'Off Track' :
    'Tracking'

  const statusColor =
    paceBand === 'at_risk' || paceBand === 'off_track'
      ? 'text-rose-400'
      : paceBand === 'slightly_behind' || paceBand === 'too_early'
        ? 'text-amber-400'
        : 'text-sky-400'

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <nav className="space-y-2">
        {['Console', 'Analytics', 'Notifications'].map((item) => (
          <button
            key={item}
            type="button"
            onClick={
              item === 'Console'
                ? onOpenConsole
                : item === 'Analytics'
                  ? onOpenAnalytics
                  : item === 'Notifications'
                    ? onOpenNotifications
                  : undefined
            }
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
              {Math.round(rawPercent)}%
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Daily Goal</p>
            <p className={`mt-1 text-lg font-semibold ${statusColor}`}>{statusLabel}</p>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Earned Revenue</p>
          <p className="mt-2 text-2xl font-semibold text-slate-100">Rs {Math.round(currentEarnings).toLocaleString()}</p>
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
