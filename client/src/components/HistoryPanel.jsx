import { sensorLogs } from '../mockData/sensorLogs'

function severityClasses(severity) {
  if (severity === 'alert') return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  if (severity === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
}

function HistoryPanel() {
  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Telemetry Vault</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-100">SENSOR LOGIC HISTORY</h2>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1">
        {sensorLogs.map((log) => (
          <article key={`${log.title}-${log.timestamp}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{log.title}</h3>
              <span className="text-xs text-slate-400">{log.timestamp}</span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-300">{log.description}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {log.tags.map((tag) => (
                <span key={tag} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${severityClasses(log.severity)}`}>
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        className="mt-4 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-400 transition hover:bg-sky-400/20"
      >
        View Full Telemetry Log
      </button>
    </aside>
  )
}

export default HistoryPanel
