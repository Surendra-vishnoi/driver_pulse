import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import HistoryPanel from '../components/HistoryPanel'
import MainContentArea from '../components/MainContentArea'
import RideSummaryModal from '../components/RideSummaryModal'
import Sidebar from '../components/Sidebar'
import { completeRideSummary } from '../services/stressApi'
import { useDriverSensors } from '../hooks/useDriverSensors'

const NOISE_INCIDENT_THRESHOLD_DB = 85
const ACCEL_SPIKE_THRESHOLD = 18
const INCIDENT_COOLDOWN_MS = 1800
const USE_DUMMY_SUMMARY_MODAL = true
const DUMMY_AVG_STRESS_SCORE = 91
const DUMMY_SAFETY_SCORE = 81

const createRideId = () => `RIDE-${Date.now()}-${Math.floor(Math.random() * 1000)}`

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const formatElapsedTime = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const buildDummySummary = (currentRideId) => ({
  rideId: currentRideId || createRideId(),
  avgStressScore: DUMMY_AVG_STRESS_SCORE,
  currentEarning: 864.5,
  timeElapsed: '01:18:42',
  distance: 34.7,
  safetyScore: DUMMY_SAFETY_SCORE,
  incidents: [
    {
      timestamp: new Date().toISOString(),
      type: 'HARSH_DRIVING',
      value: 22.5,
    },
    {
      timestamp: new Date().toISOString(),
      type: 'EXTREME_NOISE',
      value: 91.3,
    },
  ],
})

function Dashboard({ dailyTarget, isShiftStarted, isRideActive, setIsRideActive, forceHideRideSummaryModal = false }) {
  const { noiseDb, motionMagnitude, stressScore, error, startMonitoring, stopMonitoring } = useDriverSensors()
  const [rideId, setRideId] = useState('')
  const [incidents, setIncidents] = useState([])
  const [rideSummary, setRideSummary] = useState(null)
  const stressSamplesRef = useRef([])
  const distanceKmRef = useRef(0)
  const rideStartedAtRef = useRef(null)
  const incidentCooldownRef = useRef({
    EXTREME_NOISE: 0,
    HARSH_DRIVING: 0,
  })

  useEffect(() => {
    if (!isShiftStarted) {
      setIsRideActive(false)
      setRideId('')
      setIncidents([])
      setRideSummary(null)
      stressSamplesRef.current = []
      distanceKmRef.current = 0
      rideStartedAtRef.current = null
    }
  }, [isShiftStarted, setIsRideActive])

  useEffect(() => {
    if (!isShiftStarted || !isRideActive) {
      stopMonitoring()
      return
    }

    startMonitoring()

    return () => {
      stopMonitoring()
    }
    // startMonitoring/stopMonitoring come from the hook and are safe to capture for this mount cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShiftStarted, isRideActive])

  useEffect(() => {
    if (!isRideActive) return
    stressSamplesRef.current.push(stressScore)
  }, [isRideActive, stressScore])

  useEffect(() => {
    if (!isRideActive) return
    distanceKmRef.current += clamp(motionMagnitude, 0, 40) * 0.0012
  }, [isRideActive, motionMagnitude])

  useEffect(() => {
    if (!isRideActive) return

    const now = Date.now()
    const nextIncidents = []

    if (noiseDb > NOISE_INCIDENT_THRESHOLD_DB && now - incidentCooldownRef.current.EXTREME_NOISE >= INCIDENT_COOLDOWN_MS) {
      nextIncidents.push({
        timestamp: new Date().toISOString(),
        type: 'EXTREME_NOISE',
        value: Number(noiseDb.toFixed(1)),
      })
      incidentCooldownRef.current.EXTREME_NOISE = now
    }

    if (motionMagnitude > ACCEL_SPIKE_THRESHOLD && now - incidentCooldownRef.current.HARSH_DRIVING >= INCIDENT_COOLDOWN_MS) {
      nextIncidents.push({
        timestamp: new Date().toISOString(),
        type: 'HARSH_DRIVING',
        value: Number(motionMagnitude.toFixed(2)),
      })
      incidentCooldownRef.current.HARSH_DRIVING = now
    }

    if (nextIncidents.length) {
      setIncidents((prev) => [...prev, ...nextIncidents])
    }
  }, [isRideActive, motionMagnitude, noiseDb])

  const handleToggleRide = async () => {
    if (!isRideActive) {
      setRideId(createRideId())
      setIncidents([])
      setRideSummary(null)
      stressSamplesRef.current = []
      distanceKmRef.current = 0
      rideStartedAtRef.current = Date.now()
      incidentCooldownRef.current = {
        EXTREME_NOISE: 0,
        HARSH_DRIVING: 0,
      }
      setIsRideActive(true)
      return
    }

    setIsRideActive(false)

    if (USE_DUMMY_SUMMARY_MODAL) {
      setRideSummary(buildDummySummary(rideId))
      return
    }

    const capturedStress = stressSamplesRef.current
    const averageStress = capturedStress.length
      ? capturedStress.reduce((total, value) => total + value, 0) / capturedStress.length
      : 0
    const clampedStress = clamp(averageStress, 0, 100)
    const elapsedMs = rideStartedAtRef.current ? Date.now() - rideStartedAtRef.current : 0
    const distanceKm = Number(distanceKmRef.current.toFixed(1))
    const safetyScore = clamp(100 - clampedStress - incidents.length * 4, 0, 100)
    const currentEarning = Number((Number(dailyTarget ?? 0) * (0.65 + safetyScore / 250)).toFixed(2))

    const payload = {
      rideId,
      driverId: '4882-QX',
      targetPay: Number(dailyTarget ?? 0),
      summaryStats: {
        avgStress: Number(clampedStress.toFixed(1)),
        totalEvents: incidents.length,
      },
      incidents,
    }

    setRideSummary({
      rideId,
      avgStressScore: Number(clampedStress.toFixed(1)),
      currentEarning,
      timeElapsed: formatElapsedTime(elapsedMs),
      distance: distanceKm,
      safetyScore,
      incidents,
    })

    // Persist summary in the background so UI feedback is instant on ride end.
    void completeRideSummary(payload)
  }

  const handleSummaryDone = () => {
    setRideSummary(null)
    setRideId('')
    setIncidents([])
    stressSamplesRef.current = []
    distanceKmRef.current = 0
    rideStartedAtRef.current = null
    setIsRideActive(false)
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <h1 className="sr-only">Driver Pulse Dashboard</h1>
      <div className="mx-auto max-w-[1800px] space-y-5">
        <Header
          dailyTarget={dailyTarget}
          isRideActive={isRideActive}
          onToggleRide={handleToggleRide}
          rideId={rideId}
          smoothedStressScore={stressScore}
        />

        <section className="grid gap-5 xl:grid-cols-[20%_55%_25%]">
          <Sidebar />
          <MainContentArea
            liveNoiseDb={noiseDb}
            isRideActive={isRideActive}
            sensorError={error}
          />
          <HistoryPanel />
        </section>
      </div>

      <RideSummaryModal
        isOpen={Boolean(rideSummary) && !forceHideRideSummaryModal}
        rideId={rideSummary?.rideId ?? ''}
        avgStressScore={rideSummary?.avgStressScore ?? 0}
        currentEarning={rideSummary?.currentEarning ?? 0}
        timeElapsed={rideSummary?.timeElapsed ?? '00:00'}
        distance={rideSummary?.distance ?? 0}
        safetyScore={rideSummary?.safetyScore ?? 0}
        incidents={rideSummary?.incidents ?? []}
        onDone={handleSummaryDone}
      />
    </main>
  )
}

export default Dashboard
