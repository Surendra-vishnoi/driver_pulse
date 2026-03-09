import { useEffect, useMemo, useRef, useState } from 'react'
import PreShiftWelcome from './components/PreShiftWelcome'
import RideSummaryModal from './components/RideSummaryModal'
import TacticalAlertBanner from './components/TacticalAlertBanner'
import AdminFlaggedPanel from './components/AdminFlaggedPanel'
import Dashboard from './pages/Dashboard'
import { SIMULATION_STATE } from './utils/mockData'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

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
    return 'Alert: high cabin noise and acceleration spike detected.'
  }

  if (noiseLevel > 85) {
    return 'Alert: high cabin noise detected.'
  }

  return 'Alert: acceleration spike detected.'
}

function App() {
  const [isShiftStarted, setIsShiftStarted] = useState(false)
  const [dailyTarget, setDailyTarget] = useState(null)
  const [driverId, setDriverId] = useState('')
  const [role, setRole] = useState('driver')
  const [isRideActive, setIsRideActive] = useState(SIMULATION_STATE.isRideActive)
  const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false)
  const [isAlertDismissed, setIsAlertDismissed] = useState(false)
  const previousMockRideStateRef = useRef(SIMULATION_STATE.isRideActive)
  const hasAnnouncedAlertRef = useRef(false)

  const hasAlertCondition = SIMULATION_STATE.noiseLevel > 85 || SIMULATION_STATE.accelSpike > 0.5
  const shouldShowAlertBanner = isRideActive && hasAlertCondition && !isAlertDismissed
  const simulationSummary = useMemo(() => getSimulationSummary(), [SIMULATION_STATE.stressScore, SIMULATION_STATE.earnings, SIMULATION_STATE.noiseLevel, SIMULATION_STATE.accelSpike])

  const handleShiftStart = (target, driver, selectedRole) => {
    setDailyTarget(target)
    setDriverId(driver || '')
    setRole(selectedRole || 'driver')
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
      {!isShiftStarted ? <PreShiftWelcome onLaunch={handleShiftStart} /> : null}

      {isShiftStarted && role === 'admin' && (
        <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1800px] space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-400">Admin Dashboard</p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-100">Flagged Moments Overview</h1>
              </div>
              <button
                type="button"
                onClick={() => { setIsShiftStarted(false); setRole('driver') }}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-amber-500 hover:text-amber-400"
              >
                Sign Out
              </button>
            </div>
            <AdminFlaggedPanel />
          </div>
        </main>
      )}

      {isShiftStarted && role !== 'admin' && (
        <>
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
            driverId={driverId}
          />

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
        </>
      )}
    </div>
  )
}

export default App
