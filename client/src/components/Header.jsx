function Header({ dailyTarget, isRideActive, onToggleRide, rideId, smoothedStressScore }) {
  const formattedTarget = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(dailyTarget ?? 1000)

  const normalizedStress = Math.min(Math.max(smoothedStressScore ?? 0, 0), 100)
  const pulseDuration = `${(2.4 - normalizedStress * 0.014).toFixed(2)}s`
  const pulseScale = (1.03 + normalizedStress * 0.0015).toFixed(2)
  const stressState = !isRideActive
    ? 'Stable'
    : normalizedStress < 35
      ? 'Low'
      : normalizedStress < 70
        ? 'Moderate'
        : 'High'
  const orbToneClass =
    stressState === 'High'
      ? 'bg-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.9)]'
      : stressState === 'Moderate'
        ? 'bg-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.9)]'
        : 'bg-emerald-400 shadow-[0_0_16px_rgba(74,222,128,0.85)]'
  const stressTextClass =
    stressState === 'High' ? 'text-rose-300' : stressState === 'Moderate' ? 'text-amber-300' : 'text-emerald-400'

  return (
    <header className="rounded-2xl border border-slate-800 bg-slate-900 px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-sky-400">Driver Core</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[0.08em] text-slate-100">
            DRIVER{' '}
            <span className="font-black tracking-[0.2em] text-sky-300 drop-shadow-[0_0_14px_rgba(56,189,248,0.55)]">
              PULSE
            </span>
          </h1>
          <p className="mt-1 text-sm font-medium text-emerald-400">
            • {isRideActive ? 'RIDE ACTIVE' : 'NOMINAL STATE'}
          </p>
          <p className="mt-3 inline-flex rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs font-semibold tracking-[0.12em] text-sky-300">
            DAILY TARGET: {formattedTarget}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Stress Resonance</p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`stress-orb h-3 w-3 rounded-full ${orbToneClass}`}
                style={{ '--pulse-duration': pulseDuration, '--pulse-scale': pulseScale }}
              />
              <span className={`text-sm font-semibold ${stressTextClass}`}>
                {stressState}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            {rideId ? (
              <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] font-semibold tracking-[0.08em] text-slate-300">
                {rideId}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onToggleRide}
              className={`rounded-lg border px-4 py-2 text-xs font-semibold tracking-[0.08em] text-white transition ${
                isRideActive
                  ? 'border-rose-500/50 bg-rose-600 hover:bg-rose-500'
                  : 'border-emerald-500/50 bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              {isRideActive ? 'END RIDE' : 'START RIDE'}
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
