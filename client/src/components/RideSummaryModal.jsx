import { AnimatePresence, motion } from 'framer-motion'

const getStressTone = (avgStressScore) => {
  if (avgStressScore <= 40) {
    return {
      aura: 'bg-gradient-to-br from-emerald-400/14 via-emerald-300/8 to-transparent',
      encouragement: 'Great Job!',
    }
  }

  if (avgStressScore <= 70) {
    return {
      aura: 'bg-gradient-to-br from-amber-400/14 via-amber-300/8 to-transparent',
      encouragement: 'Great Job!',
    }
  }

  return {
    aura: 'bg-gradient-to-br from-rose-400/14 via-rose-300/8 to-transparent',
    encouragement: 'Stay Safe',
  }
}

const getIncidentBadgeClass = (type) => {
  if (type === 'HARSH_DRIVING') {
    return 'border-amber-300/30 bg-amber-500/8 text-amber-100 ring-1 ring-amber-300/20'
  }

  if (type === 'EXTREME_NOISE') {
    return 'border-rose-300/30 bg-rose-500/8 text-rose-100 ring-1 ring-rose-300/20'
  }

  return 'border-white/20 bg-slate-800/70 text-slate-100 ring-1 ring-white/10'
}

const formatIncidentType = (type) => {
  if (type === 'HARSH_DRIVING') return 'Harsh Braking'
  if (type === 'EXTREME_NOISE') return 'High Noise'
  return type
}

function IncidentIcon({ type }) {
  if (type === 'HARSH_DRIVING') {
    return (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M8 10l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 8h4v6h-4z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 12h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-4 shadow-inner shadow-black/20">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function RideSummaryModal({
  isOpen,
  rideId,
  avgStressScore,
  currentEarning,
  timeElapsed,
  distance,
  safetyScore,
  incidents,
  onDone,
}) {
  const tone = getStressTone(avgStressScore)

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-2xl ${tone.aura}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Ride summary"
            className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/15 bg-slate-900/85 p-6 shadow-2xl shadow-black/60 ring-1 ring-white/10 backdrop-blur-xl sm:p-8"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="space-y-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Ride ID: {rideId}</p>
              <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">Ride Complete</h2>
              <p className="text-lg text-slate-200">{tone.encouragement}</p>
            </header>

            <section className="mt-6 grid gap-3 sm:grid-cols-2">
              <StatCard label="Current Earning" value={`$${currentEarning.toFixed(2)}`} />
              <StatCard label="Time Elapsed" value={timeElapsed} />
              <StatCard label="Distance" value={`${distance.toFixed(1)} km`} />
              <StatCard label="Safety Score" value={`${Math.round(safetyScore)}/100`} />
            </section>

            <section className="mt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Incident Events</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {incidents.length ? (
                  incidents.map((incident, index) => (
                    <span
                      key={`${incident.type}-${incident.timestamp}-${index}`}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium shadow-md shadow-black/25 ${getIncidentBadgeClass(incident.type)}`}
                    >
                      <IncidentIcon type={incident.type} />
                      {formatIncidentType(incident.type)}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-200">
                    No incidents recorded
                  </span>
                )}
              </div>
            </section>

            <div className="mt-8">
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-lg font-semibold text-slate-900 transition hover:bg-white"
              >
                Done
              </button>
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default RideSummaryModal
