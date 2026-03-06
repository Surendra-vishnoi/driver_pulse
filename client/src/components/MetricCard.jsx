export function MetricCard({ title, value, unit, tone = 'neutral' }) {
  const toneStyles = {
    neutral: 'border-slate-800 bg-slate-900/70',
    info: 'border-cyan-700/60 bg-cyan-950/30',
    warning: 'border-amber-700/60 bg-amber-950/30',
    danger: 'border-rose-700/60 bg-rose-950/30',
  }

  return (
    <article className={`rounded-2xl border p-5 ${toneStyles[tone] ?? toneStyles.neutral}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-3 text-3xl font-bold text-white">
        {value}
        {unit ? <span className="ml-2 text-base font-medium text-slate-300">{unit}</span> : null}
      </p>
    </article>
  )
}
