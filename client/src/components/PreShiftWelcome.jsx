import { useMemo, useState } from 'react'

const DEFAULT_TARGET = 1000

function getInitialTarget() {
  const storedValue = window.localStorage.getItem('last_target')
  const numericValue = Number(storedValue)

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue
  }

  return DEFAULT_TARGET
}

function getInitialDriverId() {
  return window.localStorage.getItem('last_driver_id') || ''
}

function greetingByHour() {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) return 'Good Morning!'
  if (hour >= 12 && hour < 17) return 'Good Afternoon!'
  if (hour >= 17 && hour < 22) return 'Good Evening!'
  return 'Ready for the Night Shift?'
}

function PreShiftWelcome({ onLaunch }) {
  const [targetValue, setTargetValue] = useState(getInitialTarget)
  const [driverId, setDriverId] = useState(getInitialDriverId)
  const [role, setRole] = useState('driver')

  const isAdmin = role === 'admin'
  const isHighTarget = targetValue >= 2000
  const greetingText = useMemo(() => greetingByHour(), [])

  const normalizedInput = driverId.trim().toUpperCase()

  const handleLaunch = () => {
    const safeValue = Math.max(1, Number(targetValue) || DEFAULT_TARGET)
    const trimmedDriverId = isAdmin ? '' : normalizedInput
    window.localStorage.setItem('last_target', String(safeValue))
    window.localStorage.setItem('last_driver_id', trimmedDriverId)
    onLaunch(safeValue, trimmedDriverId, role)
  }

  const canLaunch = isAdmin || Boolean(driverId.trim())

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-6 backdrop-blur-xl">
      <section
        className={`w-full max-w-xl rounded-3xl border bg-slate-900/90 p-8 shadow-2xl transition ${
          isHighTarget
            ? 'border-sky-400/70 shadow-[0_0_30px_rgba(56,189,248,0.35)]'
            : 'border-slate-700'
        }`}
      >
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-400">Pre-Shift Check</p>
        <h2 className="mt-3 text-3xl font-semibold text-slate-100">{greetingText}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {isAdmin
            ? 'Admin view — full flag stats and analytics across all drivers.'
            : 'Enter your Driver ID and set your daily target before launching telemetry.'}
        </p>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRole('driver')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              role === 'driver'
                ? 'bg-sky-400 text-slate-950'
                : 'border border-slate-700 bg-slate-950 text-slate-400 hover:border-sky-500'
            }`}
          >
            Driver
          </button>
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              role === 'admin'
                ? 'bg-amber-400 text-slate-950'
                : 'border border-slate-700 bg-slate-950 text-slate-400 hover:border-amber-500'
            }`}
          >
            Admin
          </button>
        </div>

        {!isAdmin && (
          <label className="mt-5 block">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Driver ID</span>
            <div className={`mt-2 flex items-center rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3`}>
              <input
                type="text"
                placeholder="e.g. DRV001"
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
                className="w-full bg-transparent text-xl font-semibold text-slate-100 placeholder-slate-600 outline-none"
                aria-label="Driver ID"
              />
            </div>
          </label>
        )}

        {!isAdmin && (
          <label className="mt-5 block">
            <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Daily Target</span>
            <div className="mt-2 flex items-center rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3">
              <span className="text-xl font-semibold text-sky-400">₹</span>
              <input
                type="number"
                min="1"
                step="10"
                value={targetValue}
                onChange={(event) => setTargetValue(event.target.value)}
                className="ml-3 w-full bg-transparent text-3xl font-semibold text-slate-100 outline-none"
                aria-label="Daily earnings target"
              />
            </div>
          </label>
        )}

        <button
          type="button"
          onClick={handleLaunch}
          disabled={!canLaunch}
          className={`mt-7 w-full rounded-2xl px-5 py-3 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
            isAdmin
              ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
              : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
          }`}
        >
          {isAdmin ? 'Open Admin Dashboard' : 'Launch Dashboard'}
        </button>

        {!isAdmin && (
          <p className="mt-5 text-center text-xs text-emerald-400">
            Tip: Drivers who set a goal earn 15% more on average.
          </p>
        )}
      </section>
    </div>
  )
}

export default PreShiftWelcome
