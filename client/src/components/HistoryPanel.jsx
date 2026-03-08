import { useEffect, useMemo, useRef, useState } from 'react'
import { sensorLogs } from '../mockData/sensorLogs'

const MAX_VISIBLE_NOTIFICATIONS = 4
const LOGS_PER_PAGE = 5

function severityClasses(severity) {
  if (severity === 'alert') return 'border-rose-500/40 bg-rose-500/10 text-rose-300'
  if (severity === 'warning') return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
  return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
}

function playNotificationPop() {
  if (typeof window === 'undefined' || !window.AudioContext) return

  const context = new window.AudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const now = context.currentTime

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(740, now)
  oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.08)

  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.11, now + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + 0.14)
  oscillator.onended = () => {
    void context.close()
  }
}

const toFallbackLog = (log, index) => ({
  id: `fallback-${index}-${log.timestamp}`,
  title: log.title,
  message: log.description,
  timestampLabel: log.timestamp,
  severity: log.severity,
  tags: log.tags,
})

function HistoryPanel({
  notifications = [],
  isOverlayOpen: controlledOverlayOpen,
  onOpenOverlay,
  onCloseOverlay,
}) {
  const previousTopIdRef = useRef('')
  const [internalOverlayOpen, setInternalOverlayOpen] = useState(false)
  const [page, setPage] = useState(1)

  const isOverlayControlled = typeof controlledOverlayOpen === 'boolean'
  const isOverlayOpen = isOverlayControlled ? controlledOverlayOpen : internalOverlayOpen

  const openOverlay = () => {
    if (isOverlayControlled) {
      onOpenOverlay?.()
      return
    }
    setInternalOverlayOpen(true)
  }

  const closeOverlay = () => {
    if (isOverlayControlled) {
      onCloseOverlay?.()
      return
    }
    setInternalOverlayOpen(false)
  }

  useEffect(() => {
    if (!notifications.length) return

    const nextTopId = notifications[0].id
    if (!nextTopId || previousTopIdRef.current === nextTopId) return

    if (previousTopIdRef.current) {
      playNotificationPop()
    }

    previousTopIdRef.current = nextTopId
  }, [notifications])

  const visibleLogs = notifications.length
    ? notifications.slice(0, MAX_VISIBLE_NOTIFICATIONS)
    : sensorLogs.slice(0, MAX_VISIBLE_NOTIFICATIONS).map(toFallbackLog)

  const allLogs = useMemo(() => {
    return notifications.length
      ? notifications
      : sensorLogs.map(toFallbackLog)
  }, [notifications])

  const totalPages = Math.max(1, Math.ceil(allLogs.length / LOGS_PER_PAGE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * LOGS_PER_PAGE
  const pageLogs = allLogs.slice(pageStart, pageStart + LOGS_PER_PAGE)

  useEffect(() => {
    if (!isOverlayOpen) return
    setPage(1)
  }, [isOverlayOpen])

  useEffect(() => {
    if (!isOverlayOpen || typeof document === 'undefined') return

    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [isOverlayOpen])

  return (
    <aside className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Driver Signals</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-100">NOTIFICATIONS</h2>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1">
        {visibleLogs.map((log) => (
          <article key={log.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{log.title}</h3>
              <span className="text-xs text-slate-400">{log.timestampLabel}</span>
            </div>

            <p className="mt-2 text-sm leading-relaxed text-slate-300">{log.message}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {log.tags.map((tag) => (
                <span key={`${log.id}-${tag}`} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${severityClasses(log.severity)}`}>
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <button
        type="button"
        onClick={openOverlay}
        className="mt-4 rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-400 transition hover:bg-sky-400/20"
      >
        View Full Logs
      </button>

      {isOverlayOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm px-4">
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <button
              type="button"
              onClick={closeOverlay}
              className="absolute right-4 top-4 rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              aria-label="Close logs overlay"
            >
              X
            </button>

            <div className="mb-4 pr-10">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Driver Signals</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-100">All Notifications</h3>
              <p className="mt-1 text-xs text-slate-400">Recent to old | {allLogs.length} total</p>
            </div>

            <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
              {pageLogs.map((log) => (
                <article key={`overlay-${log.id}`} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-100">{log.title}</h3>
                    <span className="text-xs text-slate-400">{log.timestampLabel}</span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{log.message}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {log.tags.map((tag) => (
                      <span key={`overlay-${log.id}-${tag}`} className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${severityClasses(log.severity)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">Page {currentPage} of {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition enabled:hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )
}

export default HistoryPanel
