import { AnimatePresence, motion } from 'framer-motion'

function TacticalAlertBanner({ shouldShow, noiseLevel, accelSpike, onClose }) {

  const alertText =
    noiseLevel > 85 && accelSpike > 0.5
      ? `Critical: High cabin noise (${noiseLevel.toFixed(1)} dB) and acceleration spike (${accelSpike.toFixed(2)}g).`
      : noiseLevel > 85
        ? `Critical: High cabin noise detected at ${noiseLevel.toFixed(1)} dB.`
        : `Warning: Acceleration spike detected at ${accelSpike.toFixed(2)}g.`

  return (
    <AnimatePresence initial={false}>
      {shouldShow ? (
        <motion.div
          className="relative z-20 overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="relative bg-rose-700 px-5 py-3 text-sm font-bold tracking-wide text-white sm:text-base">
            <p className="text-center">{alertText}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close alert"
              className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border border-white/30 text-white transition hover:bg-white/10"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path d="M5 5l10 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default TacticalAlertBanner
