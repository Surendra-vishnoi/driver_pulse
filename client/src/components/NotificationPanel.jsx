function NotificationPanel({ notifications = [] }) {
  const visibleNotifications = notifications.slice(0, 4)

  const toneClasses = (severity) => {
    if (severity === 'warning') {
      return {
        badge: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
        icon: 'bg-amber-500/20 text-amber-300',
      }
    }

    if (severity === 'success') {
      return {
        badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
        icon: 'bg-emerald-500/20 text-emerald-300',
      }
    }

    return {
      badge: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
      icon: 'bg-sky-500/20 text-sky-300',
    }
  }

  return (
    <aside className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-100">Recent Notifications</h3>
        <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-400">Latest 4</span>
      </div>

      <div className="space-y-3">
        {visibleNotifications.length === 0 && (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
            No recent notifications available.
          </div>
        )}

        {visibleNotifications.map((notification) => {
          const tones = toneClasses(notification.severity)
          return (
            <article
              key={notification.id}
              className={`rounded-xl border p-3 ${tones.badge}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full ${tones.icon}`}>
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 22a2.5 2.5 0 0 0 2.2-1.3" />
                    <path d="M5.5 17h13c-.8-1-1.5-2.5-1.5-4.5v-2a5 5 0 1 0-10 0v2c0 2-.7 3.5-1.5 4.5Z" />
                  </svg>
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{notification.title || 'Driver Alert'}</p>
                    <span className="shrink-0 text-xs text-slate-400">{notification.timestampLabel || '--:--'}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-200">{notification.message}</p>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </aside>
  )
}

export default NotificationPanel
