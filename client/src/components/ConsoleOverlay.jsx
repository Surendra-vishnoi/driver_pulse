import { useEffect, useState } from 'react'
import { fetchSensorData } from '../services/stressApi'
import { runFlaggingPipeline } from '../utils/flagEngine'

function formatTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function ConsoleOverlay({ isOpen, onClose, driverId }) {
  const [isLoading, setIsLoading] = useState(false)
  const [trips, setTrips] = useState([])
  const [flagsByTrip, setFlagsByTrip] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    setIsLoading(true)
    setError('')
    fetchSensorData()
      .then((data) => {
        if (cancelled) return
        if (!data || !data.trips) {
          setError('Could not load trip data.')
          setTrips([])
          setFlagsByTrip({})
          return
        }
        let filteredTrips = data.trips
        if (driverId) {
          const normId = driverId.trim().toUpperCase()
          filteredTrips = filteredTrips.filter(t => (t.driver_id || '').toUpperCase() === normId)
        }
        setTrips(filteredTrips)
        const flagged = runFlaggingPipeline(data).flagged
        const byTrip = {}
        for (const f of flagged) {
          if (driverId && (f.driver_id || '').toUpperCase() !== driverId.trim().toUpperCase()) continue
          if (!byTrip[f.trip_id]) byTrip[f.trip_id] = []
          byTrip[f.trip_id].push(f)
        }
        setFlagsByTrip(byTrip)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load trip data.')
        setTrips([])
        setFlagsByTrip({})
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [isOpen, driverId])

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return

    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = original
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          aria-label="Close console overlay"
        >
          X
        </button>

        <div className="mb-4 pr-10">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Console</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-100">Trip-wise Data</h3>
          <p className="mt-1 text-xs text-slate-400">Live summary of all trips and detected flags</p>
        </div>

        {isLoading ? <p className="text-sm text-slate-300">Loading trip data...</p> : null}
        {!isLoading && error ? <p className="text-sm text-rose-300">{error}</p> : null}

        {!isLoading && !error ? (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {trips.length ? (
              trips.map((trip) => {
                const flags = flagsByTrip[trip.trip_id] || []
                return (
                  <article key={trip.trip_id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-slate-100">
                        Trip {trip.trip_id} | Driver {trip.driver_id}
                      </h4>
                      <span className="text-xs text-slate-400">{trip.date} {trip.start_time} - {trip.end_time}</span>
                    </div>
                    <div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                      <p>Distance: {Number(trip.distance_km || 0).toFixed(1)} km</p>
                      <p>Fare: Rs {Math.round(Number(trip.fare) || 0).toLocaleString()}</p>
                      <p>Duration: {trip.duration_min} min</p>
                      <p>Status: {trip.trip_status}</p>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Flags</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {flags.length ? (
                          flags.map((flag, idx) => (
                            <span key={flag.flag_id} className={`rounded-md border px-2 py-1 text-xs font-semibold ${
                              flag.severity === 'high'
                                ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                                : flag.severity === 'medium'
                                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            }`}>
                              {flag.flag_type.replace(/_/g, ' ')} ({flag.severity})
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                            No flags
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">
                No trips found.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ConsoleOverlay
