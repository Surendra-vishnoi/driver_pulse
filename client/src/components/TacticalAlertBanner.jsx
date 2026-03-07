import { AnimatePresence, motion } from 'framer-motion'

function TacticalAlertBanner({ shouldShow, noiseLevel, accelSpike, onClose }) {

  const alertText =
    noiseLevel > 85 && accelSpike > 0.5
      ? `Critical: High noise (${noiseLevel.toFixed(1)} dB) and acceleration spike (${accelSpike.toFixed(2)}g).`
      : noiseLevel > 85
        ? `Critical: Cabin noise is elevated at ${noiseLevel.toFixed(1)} dB.`
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
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-white/30 px-2 py-1 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              X
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export default TacticalAlertBanner
