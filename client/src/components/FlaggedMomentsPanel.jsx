import { useEffect, useState } from 'react'
import { fetchSensorData } from '../services/stressApi'
import { runFlaggingPipeline } from '../utils/flagEngine'

const SEVERITY_COLORS = {
  high: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
}

const TYPE_LABELS = {
  conflict_moment: 'Conflict',
  harsh_braking: 'Harsh Brake',
  audio_spike: 'Audio Spike',
  sustained_stress: 'Sustained Stress',
  moderate_brake: 'Moderate Brake',
  audio_elevated: 'Audio Elevated',
}

const PAGE_SIZE = 15

function StatCard({ label, value, accent = 'text-sky-400' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  )
}

function SeverityBadge({ severity }) {
  return (
    <span className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_COLORS[severity] || ''}`}>
      {severity?.toUpperCase()}
    </span>
  )
}

function FlaggedMomentsPanel() {
  const [flagged, setFlagged] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filterSeverity, setFilterSeverity] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [searchTrip, setSearchTrip] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
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
  }, [])

  // Filtering
  const filtered = flagged.filter((f) => {
    if (filterSeverity !== 'all' && f.severity !== filterSeverity) return false
    if (filterType !== 'all' && f.flag_type !== filterType) return false
    if (searchTrip && !f.trip_id.toLowerCase().includes(searchTrip.toLowerCase()) && !f.driver_id.toLowerCase().includes(searchTrip.toLowerCase())) return false
    return true
  })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  useEffect(() => { setPage(0) }, [filterSeverity, filterType, searchTrip])

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          <p className="text-sm text-slate-400">Running flagging engine on sensor data</p>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-500/40 bg-slate-900 p-6">
        <p className="text-sm text-rose-400">{error}</p>
        <p className="mt-1 text-xs text-slate-500">Make sure the server is running on port 5000.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Total Flags" value={stats.total} />
          <StatCard label="High" value={stats.bySeverity.high || 0} accent="text-rose-400" />
          <StatCard label="Medium" value={stats.bySeverity.medium || 0} accent="text-amber-400" />
          <StatCard label="Low" value={stats.bySeverity.low || 0} accent="text-emerald-400" />
          <StatCard label="Conflict" value={stats.byType.conflict_moment || 0} accent="text-purple-400" />
          <StatCard label="Harsh Brake" value={stats.byType.harsh_braking || 0} accent="text-rose-400" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
        <input
          type="text"
          placeholder="Search trip or driver…"
          value={searchTrip}
          onChange={(e) => setSearchTrip(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
        />

        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
        >
          <option value="all">All Severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-sky-500"
        >
          <option value="all">All Types</option>
          <option value="conflict_moment">Conflict Moment</option>
          <option value="harsh_braking">Harsh Braking</option>
          <option value="audio_spike">Audio Spike</option>
          <option value="sustained_stress">Sustained Stress</option>
          <option value="moderate_brake">Moderate Brake</option>
          <option value="audio_elevated">Audio Elevated</option>
        </select>

        <span className="ml-auto text-xs text-slate-500">{filtered.length} results</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-xs text-slate-300">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Trip</th>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Motion</th>
              <th className="px-4 py-3">Audio</th>
              <th className="px-4 py-3">Combined</th>
              <th className="min-w-[260px] px-4 py-3">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((f) => (
              <tr key={f.flag_id} className="border-b border-slate-800/60 transition hover:bg-slate-800/40">
                <td className="px-4 py-2.5 font-mono text-slate-500">{f.flag_id}</td>
                <td className="px-4 py-2.5 font-mono text-sky-400">{f.trip_id}</td>
                <td className="px-4 py-2.5">{f.driver_id}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-slate-400">{f.timestamp}</td>
                <td className="whitespace-nowrap px-4 py-2.5">{TYPE_LABELS[f.flag_type] || f.flag_type}</td>
                <td className="px-4 py-2.5"><SeverityBadge severity={f.severity} /></td>
                <td className="px-4 py-2.5 font-mono">{f.motion_score ?? '–'}</td>
                <td className="px-4 py-2.5 font-mono">{f.audio_score ?? '–'}</td>
                <td className="px-4 py-2.5 font-mono font-semibold text-slate-100">{f.combined_score}</td>
                <td className="px-4 py-2.5 text-slate-400">{f.explanation}</td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-500">No flagged moments match your filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-400">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 transition hover:border-sky-500 disabled:opacity-30"
          >
            ← Previous
          </button>
          <span>Page {page + 1} of {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 transition hover:border-sky-500 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Top Flagged Trips</p>
            <div className="mt-3 space-y-1.5">
              {stats.topTrips.slice(0, 5).map((t) => (
                <div key={t.trip_id} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2">
                  <span className="font-mono text-xs text-sky-400">{t.trip_id}</span>
                  <span className="text-xs font-semibold text-slate-200">{t.count} flags</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Top Flagged Drivers</p>
            <div className="mt-3 space-y-1.5">
              {stats.topDrivers.slice(0, 5).map((d) => (
                <div key={d.driver_id} className="flex items-center justify-between rounded-lg bg-slate-950 px-3 py-2">
                  <span className="font-mono text-xs text-amber-400">{d.driver_id}</span>
                  <span className="text-xs font-semibold text-slate-200">{d.count} flags</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FlaggedMomentsPanel
