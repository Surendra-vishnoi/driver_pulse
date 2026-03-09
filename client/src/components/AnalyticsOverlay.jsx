import { useEffect, useMemo, useState } from 'react'
import { fetchSensorData } from '../services/stressApi'
import { runFlaggingPipeline } from '../utils/flagEngine'

const SEVERITY_COLORS = {
  high: { bg: 'bg-rose-500', text: 'text-rose-400' },
  medium: { bg: 'bg-amber-500', text: 'text-amber-400' },
  low: { bg: 'bg-emerald-500', text: 'text-emerald-400' },
}

const TYPE_LABELS = {
  conflict_moment: 'Conflict Moment',
  harsh_braking: 'Harsh Braking',
  audio_spike: 'Audio Spike',
  sustained_stress: 'Sustained Stress',
  moderate_brake: 'Moderate Brake',
  audio_elevated: 'Audio Elevated',
}

const TYPE_COLORS = {
  conflict_moment: 'bg-purple-500',
  harsh_braking: 'bg-rose-500',
  audio_spike: 'bg-amber-500',
  sustained_stress: 'bg-orange-500',
  moderate_brake: 'bg-sky-500',
  audio_elevated: 'bg-teal-500',
}

function computeSafetyScore(flags) {
  if (!flags.length) return 100
  const highCount = flags.filter((f) => f.severity === 'high').length
  const mediumCount = flags.filter((f) => f.severity === 'medium').length
  const lowCount = flags.filter((f) => f.severity === 'low').length
  const penalty = highCount * 8 + mediumCount * 3 + lowCount * 1
  return Math.max(0, Math.min(100, 100 - penalty))
}

function generateInsights(flags, stats) {
  const insights = []

  if (!flags.length) {
    insights.push({ type: 'success', text: 'No flagged moments detected. Excellent driving performance.' })
    return insights
  }

  const highCount = stats.bySeverity.high || 0
  const totalFlags = stats.total

  if (highCount > 0) {
    const highPct = Math.round((highCount / totalFlags) * 100)
    insights.push({
      type: 'alert',
      text: `${highCount} high-severity event${highCount > 1 ? 's' : ''} detected (${highPct}% of all flags). Review harsh braking patterns and conflict moments.`,
    })
  }

  const topType = Object.entries(stats.byType).sort(([, a], [, b]) => b - a)[0]
  if (topType) {
    insights.push({
      type: 'info',
      text: `Most frequent flag type: ${TYPE_LABELS[topType[0]] || topType[0]} (${topType[1]} occurrences). Focus on reducing this pattern.`,
    })
  }

  const conflicts = flags.filter((f) => f.flag_type === 'conflict_moment')
  if (conflicts.length > 0) {
    insights.push({
      type: 'warning',
      text: `${conflicts.length} conflict moment${conflicts.length > 1 ? 's' : ''} found where both motion and audio spiked simultaneously. Consider de-escalation strategies.`,
    })
  }

  const sustained = flags.filter((f) => f.flag_type === 'sustained_stress')
  if (sustained.length > 0) {
    insights.push({
      type: 'warning',
      text: `${sustained.length} sustained stress cluster${sustained.length > 1 ? 's' : ''} detected. Multiple moderate events occurring close together suggest cumulative fatigue.`,
    })
  }

  const avgCombined = flags.reduce((sum, f) => sum + f.combined_score, 0) / flags.length
  if (avgCombined < 0.55) {
    insights.push({
      type: 'success',
      text: `Average combined score is ${avgCombined.toFixed(2)} (below medium threshold). Most events are low severity.`,
    })
  }

  return insights
}

const INSIGHT_STYLES = {
  alert: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
}

function AnalyticsOverlay({ isOpen, onClose, driverId }) {
  const [flagged, setFlagged] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const rawData = await fetchSensorData()
        if (cancelled) return
        if (!rawData) {
          setError('Could not load sensor data from server.')
          return
        }
        const result = runFlaggingPipeline(rawData)
        setFlagged(result.flagged)
        setStats(result.stats)
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isOpen])

  const driverFlags = useMemo(() => {
    if (!driverId) return flagged
    return flagged.filter((f) => f.driver_id.toLowerCase() === driverId.toLowerCase())
  }, [flagged, driverId])

  const driverStats = useMemo(() => {
    if (!driverFlags.length) return null
    const byType = {}
    const bySeverity = {}
    const byTrip = {}
    for (const f of driverFlags) {
      byType[f.flag_type] = (byType[f.flag_type] || 0) + 1
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
      byTrip[f.trip_id] = (byTrip[f.trip_id] || 0) + 1
    }
    const topTrips = Object.entries(byTrip)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([trip_id, count]) => ({ trip_id, count }))
    return { total: driverFlags.length, byType, bySeverity, topTrips }
  }, [driverFlags])

  const safetyScore = useMemo(() => computeSafetyScore(driverFlags), [driverFlags])
  const insights = useMemo(() => {
    if (!driverStats) return []
    return generateInsights(driverFlags, driverStats)
  }, [driverFlags, driverStats])

  const highFlags = useMemo(() => {
    return driverFlags
      .filter((f) => f.severity === 'high' || f.severity === 'medium')
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, 5)
  }, [driverFlags])

  const avgCombined = useMemo(() => {
    if (!driverFlags.length) return 0
    return driverFlags.reduce((sum, f) => sum + f.combined_score, 0) / driverFlags.length
  }, [driverFlags])

  const maxCombined = useMemo(() => {
    if (!driverFlags.length) return 0
    return Math.max(...driverFlags.map((f) => f.combined_score))
  }, [driverFlags])

  if (!isOpen) return null

  const safetyColor = safetyScore >= 80 ? 'text-emerald-400' : safetyScore >= 50 ? 'text-amber-400' : 'text-rose-400'
  const safetyRingColor = safetyScore >= 80 ? 'rgb(52 211 153)' : safetyScore >= 50 ? 'rgb(251 191 36)' : 'rgb(244 63 94)'

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          aria-label="Close analytics overlay"
        >
          X
        </button>

        <div className="mb-6 pr-10">
          <p className="text-xs uppercase tracking-[0.24em] text-sky-400">Analytics</p>
          <h3 className="mt-1 text-2xl font-semibold text-slate-100">Shift Safety Analysis</h3>
          <p className="mt-1 text-sm text-slate-400">
            {driverId
              ? <>Performance summary for driver <span className="font-semibold text-sky-400">{driverId}</span></>
              : 'Aggregated safety analysis from sensor data'}
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-3 py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <p className="text-sm text-slate-400">Analyzing sensor data...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-rose-500/40 bg-slate-950 p-6">
            <p className="text-sm text-rose-400">{error}</p>
            <p className="mt-1 text-xs text-slate-500">Make sure the server is running on port 5000.</p>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-5">

            <div className="grid gap-4 md:grid-cols-4">
              <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <div
                  className="grid h-20 w-20 flex-shrink-0 place-items-center rounded-full"
                  style={{ background: `conic-gradient(${safetyRingColor} ${safetyScore * 3.6}deg, rgb(51 65 85) 0deg)` }}
                >
                  <div className={`grid h-14 w-14 place-items-center rounded-full bg-slate-950 text-lg font-bold ${safetyColor}`}>
                    {safetyScore}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Safety Score</p>
                  <p className={`mt-1 text-lg font-semibold ${safetyColor}`}>
                    {safetyScore >= 80 ? 'Good' : safetyScore >= 50 ? 'Needs Attention' : 'Critical'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Total Flags</p>
                <p className="mt-2 text-3xl font-bold text-sky-400">{driverFlags.length}</p>
                {flagged.length !== driverFlags.length && (
                  <p className="mt-1 text-[10px] text-slate-500">of {flagged.length} total</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Avg Severity</p>
                <p className="mt-2 text-3xl font-bold text-slate-100">{avgCombined.toFixed(2)}</p>
                <p className="mt-1 text-[10px] text-slate-500">combined score</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-center">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Peak Severity</p>
                <p className={`mt-2 text-3xl font-bold ${maxCombined >= 0.8 ? 'text-rose-400' : maxCombined >= 0.55 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {maxCombined.toFixed(2)}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">worst moment</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Severity Breakdown</p>
                <div className="mt-4 space-y-3">
                  {['high', 'medium', 'low'].map((sev) => {
                    const count = driverStats?.bySeverity[sev] || 0
                    const pct = driverFlags.length ? (count / driverFlags.length) * 100 : 0
                    return (
                      <div key={sev} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`font-semibold uppercase ${SEVERITY_COLORS[sev].text}`}>{sev}</span>
                          <span className="text-slate-400">{count} ({Math.round(pct)}%)</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${SEVERITY_COLORS[sev].bg} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Flag Type Distribution</p>
                <div className="mt-4 space-y-2.5">
                  {Object.entries(driverStats?.byType || {})
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => {
                      const pct = driverFlags.length ? (count / driverFlags.length) * 100 : 0
                      return (
                        <div key={type} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-300">{TYPE_LABELS[type] || type}</span>
                            <span className="text-slate-400">{count}</span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${TYPE_COLORS[type] || 'bg-slate-500'} transition-all`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>

            {insights.length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Actionable Insights</p>
                <div className="mt-3 space-y-2">
                  {insights.map((insight, idx) => (
                    <div key={idx} className={`rounded-xl border px-4 py-3 text-sm ${INSIGHT_STYLES[insight.type]}`}>
                      {insight.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {driverStats?.topTrips?.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Most Flagged Trips</p>
                  <div className="mt-3 space-y-1.5">
                    {driverStats.topTrips.map((t, idx) => (
                      <div key={t.trip_id} className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2">
                        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-400">
                          {idx + 1}
                        </span>
                        <span className="font-mono text-xs text-sky-400">{t.trip_id}</span>
                        <span className="ml-auto text-xs font-semibold text-slate-300">{t.count} flags</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {highFlags.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Worst Moments</p>
                  <div className="mt-3 space-y-1.5">
                    {highFlags.map((f) => (
                      <div key={f.flag_id} className="rounded-lg bg-slate-900 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
                              f.severity === 'high'
                                ? 'border-rose-500/40 bg-rose-500/20 text-rose-400'
                                : 'border-amber-500/40 bg-amber-500/20 text-amber-400'
                            }`}>
                              {f.severity.toUpperCase()}
                            </span>
                            <span className="text-xs text-slate-300">{TYPE_LABELS[f.flag_type] || f.flag_type}</span>
                          </div>
                          <span className="font-mono text-xs font-semibold text-slate-100">{f.combined_score}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{f.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {driverFlags.length === 0 && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
                <p className="text-lg font-semibold text-emerald-400">All Clear</p>
                <p className="mt-1 text-sm text-emerald-300">No flagged moments detected for this driver. Keep it up!</p>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

export default AnalyticsOverlay
