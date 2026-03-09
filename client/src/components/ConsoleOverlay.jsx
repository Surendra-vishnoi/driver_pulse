import { useEffect, useState } from 'react'
import { fetchRideEndMetadata } from '../services/stressApi'

function formatTime(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function ConsoleOverlay({ isOpen, onClose }) {
  const [isLoading, setIsLoading] = useState(false)
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isOpen) return

    let isMounted = true
    setIsLoading(true)
    setError('')

    void fetchRideEndMetadata()
      .then((result) => {
        if (!isMounted) return

        if (result?.success) {
          setEvents(Array.isArray(result.data) ? result.data : [])
          return
        }

        setEvents([])
        setError(result?.error || 'Failed to load console events.')
      })
      .catch((err) => {
        if (!isMounted) return
        setEvents([])
        setError(err instanceof Error ? err.message : 'Failed to load console events.')
      })
      .finally(() => {
        if (!isMounted) return
        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen])

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
          <h3 className="mt-1 text-xl font-semibold text-slate-100">Ride End Events</h3>
          <p className="mt-1 text-xs text-slate-400">Server receiver stream for ride-end metadata and alerts</p>
        </div>

        {isLoading ? <p className="text-sm text-slate-300">Loading events...</p> : null}
        {!isLoading && error ? <p className="text-sm text-rose-300">{error}</p> : null}

        {!isLoading && !error ? (
          <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
            {events.length ? (
              events.map((event, index) => (
                <article key={`${event.rideId || 'ride'}-${event.receivedAt || index}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-slate-100">
                      Ride {event.rideId || 'Unknown'} | Driver {event.driverId || 'Unknown'}
                    </h4>
                    <span className="text-xs text-slate-400">{formatTime(event.receivedAt)}</span>
                  </div>

                  <div className="mt-2 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
                    <p>Target Pay: Rs {Math.round(Number(event.targetPay) || 0).toLocaleString()}</p>
                    <p>Current Earning: Rs {Math.round(Number(event.summaryStats?.currentEarning) || 0).toLocaleString()}</p>
                    <p>Duration: {event.timeElapsed || '00:00'}</p>
                    <p>Distance: {Number(event.distanceKm || 0).toFixed(1)} km</p>
                    <p>Avg Stress: {Number(event.summaryStats?.avgStress || 0).toFixed(1)}</p>
                    <p>Total Events: {Number(event.summaryStats?.totalEvents || 0)}</p>
                  </div>

                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Alerts</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.isArray(event.alertMessages) && event.alertMessages.length ? (
                        event.alertMessages.map((message, msgIndex) => (
                          <span key={`${event.rideId || 'ride'}-alert-${msgIndex}`} className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-300">
                            {message}
                          </span>
                        ))
                      ) : (
                        <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300">
                          No alert messages
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">
                No ride-end events received yet.
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default ConsoleOverlay
