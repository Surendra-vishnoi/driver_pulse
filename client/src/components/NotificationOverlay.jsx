import React from 'react'

function NotificationOverlay({ isOpen, onClose, notifications }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md border border-slate-700 px-2 py-1 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
          aria-label="Close notification overlay"
        >
          X
        </button>
        <div className="mb-4 pr-10">
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Notifications</p>
          <h3 className="mt-1 text-xl font-semibold text-slate-100">Driver Alerts & Guidance</h3>
        </div>
        <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
          {notifications.length ? notifications.map((notif) => (
            <article key={notif.id} className={`rounded-xl border bg-slate-950 p-4 ${
              notif.severity === 'alert'
                ? 'border-rose-500/40'
                : notif.severity === 'warning'
                ? 'border-amber-500/40'
                : 'border-emerald-500/40'
            }`}>
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-100">{notif.title}</h4>
                <span className="text-xs text-slate-400">{notif.timestampLabel}</span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{notif.message}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {notif.tags && notif.tags.map((tag, i) => (
                  <span key={i} className="rounded bg-slate-800 px-2 py-0.5 text-xs text-sky-400">{tag}</span>
                ))}
              </div>
            </article>
          )) : (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">
              No notifications yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default NotificationOverlay
