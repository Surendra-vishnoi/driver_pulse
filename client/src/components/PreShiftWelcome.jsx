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

  const isHighTarget = targetValue >= 2000
  const greetingText = useMemo(() => greetingByHour(), [])

  const handleLaunch = () => {
    const safeValue = Math.max(1, Number(targetValue) || DEFAULT_TARGET)
    const trimmedDriverId = driverId.trim()
    window.localStorage.setItem('last_target', String(safeValue))
    window.localStorage.setItem('last_driver_id', trimmedDriverId)
    onLaunch(safeValue, trimmedDriverId)
  }

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
        <p className="mt-2 text-sm text-slate-300">Enter your Driver ID and set your daily target before launching telemetry.</p>

        <label className="mt-8 block">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Driver ID</span>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3">
            <input
              type="text"
              placeholder="e.g. DRV-1001"
              value={driverId}
              onChange={(event) => setDriverId(event.target.value)}
              className="w-full bg-transparent text-xl font-semibold text-slate-100 placeholder-slate-600 outline-none"
              aria-label="Driver ID"
            />
          </div>
        </label>

        <label className="mt-5 block">
          <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Daily Target</span>
          <div className="mt-2 flex items-center rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3">
            <span className="text-xl font-semibold text-sky-400">$</span>
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

        <button
          type="button"
          onClick={handleLaunch}
          disabled={!driverId.trim()}
          className="mt-7 w-full rounded-2xl bg-sky-400 px-5 py-3 text-base font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Launch Dashboard
        </button>

        <p className="mt-5 text-center text-xs text-emerald-400">
          Tip: Drivers who set a goal earn 15% more on average.
        </p>
      </section>
    </div>
  )
}

export default PreShiftWelcome
