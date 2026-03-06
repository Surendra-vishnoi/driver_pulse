export function StatusBadge({ level }) {
  const palette = {
    Low: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    Moderate: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
    High: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
  }

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${palette[level] ?? palette.Low}`}>
      {level} Stress
    </span>
  )
}
