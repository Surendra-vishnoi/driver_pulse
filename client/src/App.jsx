import { useEffect, useMemo, useRef, useState } from 'react'
import PreShiftWelcome from './components/PreShiftWelcome'
import RideSummaryModal from './components/RideSummaryModal'
import TacticalAlertBanner from './components/TacticalAlertBanner'
import Dashboard from './pages/Dashboard'
import { SIMULATION_STATE } from './utils/mockData'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const getStressAuraClass = (stressScore, isAlertVisible) => {
  if (stressScore <= 40) {
    return 'bg-[radial-gradient(circle_at_12%_10%,rgba(52,211,153,0.14)_0%,rgba(15,23,42,0.12)_42%,transparent_70%)]'
  }

  if (stressScore <= 70) {
    return 'bg-[radial-gradient(circle_at_12%_10%,rgba(251,191,36,0.14)_0%,rgba(15,23,42,0.12)_42%,transparent_70%)]'
  }

  if (isAlertVisible) {
    return 'bg-[radial-gradient(circle_at_12%_10%,rgba(251,113,133,0.12)_0%,rgba(15,23,42,0.1)_42%,transparent_70%)]'
  }

  return 'bg-[radial-gradient(circle_at_12%_10%,rgba(148,163,184,0.12)_0%,rgba(15,23,42,0.1)_42%,transparent_70%)]'
}

const getSimulationSummary = () => {
  const clampedStress = clamp(SIMULATION_STATE.stressScore, 0, 100)

  return {
    rideId: 'SIM-RIDE-001',
    avgStressScore: clampedStress,
    currentEarning: Number(SIMULATION_STATE.earnings ?? 0),
    timeElapsed: '00:42:16',
    distance: 23.8,
    safetyScore: clamp(100 - clampedStress * 0.55, 0, 100),
    incidents: [
      {
        timestamp: new Date().toISOString(),
        type: 'EXTREME_NOISE',
        value: Number(SIMULATION_STATE.noiseLevel ?? 0),
      },
      {
        timestamp: new Date().toISOString(),
        type: 'HARSH_DRIVING',
        value: Number(SIMULATION_STATE.accelSpike ?? 0),
      },
    ].filter((event) => (event.type === 'EXTREME_NOISE' ? event.value > 85 : event.value > 0.5)),
  }
}

const getAlertText = ({ noiseLevel, accelSpike }) => {
  if (noiseLevel > 85 && accelSpike > 0.5) {
    return 'Alert. High cabin noise and acceleration spike detected.'
  }

  if (noiseLevel > 85) {
    return 'Alert. High cabin noise detected.'
  }

  return 'Alert. Acceleration spike detected.'
}

function App() {
  const [isShiftStarted, setIsShiftStarted] = useState(true)
  const [dailyTarget, setDailyTarget] = useState(null)
  const [isRideActive, setIsRideActive] = useState(SIMULATION_STATE.isRideActive)
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [isAlertDismissed, setIsAlertDismissed] = useState(false)
  const previousMockRideStateRef = useRef(SIMULATION_STATE.isRideActive)
  const hasAnnouncedAlertRef = useRef(false)

  const hasAlertCondition = SIMULATION_STATE.noiseLevel > 85 || SIMULATION_STATE.accelSpike > 0.5
  const shouldShowAlertBanner = isRideActive && hasAlertCondition && !isAlertDismissed
  const stressAuraClass = useMemo(
    () => getStressAuraClass(SIMULATION_STATE.stressScore, shouldShowAlertBanner),
    [SIMULATION_STATE.stressScore, shouldShowAlertBanner]
  )
  const simulationSummary = useMemo(() => getSimulationSummary(), [SIMULATION_STATE.stressScore, SIMULATION_STATE.earnings, SIMULATION_STATE.noiseLevel, SIMULATION_STATE.accelSpike])

  const handleShiftStart = (target) => {
    setDailyTarget(target)
    setIsShiftStarted(true)
  }

  useEffect(() => {
    setIsRideActive(SIMULATION_STATE.isRideActive)
  }, [SIMULATION_STATE.isRideActive])

  useEffect(() => {
    if (!isRideActive || !hasAlertCondition) {
      setIsAlertDismissed(false)
    }
  }, [isRideActive, hasAlertCondition])

  useEffect(() => {
    const previous = previousMockRideStateRef.current
    const current = SIMULATION_STATE.isRideActive

    if (previous && !current) {
      setIsSummaryModalOpen(true)
    }

    previousMockRideStateRef.current = current
  }, [SIMULATION_STATE.isRideActive])

  useEffect(() => {
    if (!shouldShowAlertBanner) {
      hasAnnouncedAlertRef.current = false
      return
    }

    if (hasAnnouncedAlertRef.current || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return
    }

    const utterance = new SpeechSynthesisUtterance(
      getAlertText({
        noiseLevel: SIMULATION_STATE.noiseLevel,
        accelSpike: SIMULATION_STATE.accelSpike,
      })
    )

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
    hasAnnouncedAlertRef.current = true
  }, [shouldShowAlertBanner, SIMULATION_STATE.noiseLevel, SIMULATION_STATE.accelSpike])

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className={`pointer-events-none absolute inset-x-0 bottom-0 top-16 ${stressAuraClass}`} aria-hidden="true" />

      <TacticalAlertBanner
        shouldShow={shouldShowAlertBanner}
        noiseLevel={SIMULATION_STATE.noiseLevel}
        accelSpike={SIMULATION_STATE.accelSpike}
        onClose={() => setIsAlertDismissed(true)}
      />

      <Dashboard
        dailyTarget={dailyTarget}
        isShiftStarted={isShiftStarted}
        isRideActive={isRideActive}
        setIsRideActive={setIsRideActive}
        forceHideRideSummaryModal
      />

      {!isShiftStarted ? <PreShiftWelcome onLaunch={handleShiftStart} /> : null}

      <RideSummaryModal
        isOpen={isSummaryModalOpen}
        rideId={simulationSummary.rideId}
        avgStressScore={simulationSummary.avgStressScore}
        currentEarning={simulationSummary.currentEarning}
        timeElapsed={simulationSummary.timeElapsed}
        distance={simulationSummary.distance}
        safetyScore={simulationSummary.safetyScore}
        incidents={simulationSummary.incidents}
        onDone={() => setIsSummaryModalOpen(false)}
      />
    </div>
  )
}

export default App
