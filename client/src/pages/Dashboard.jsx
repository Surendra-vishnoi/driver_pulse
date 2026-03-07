import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import HistoryPanel from '../components/HistoryPanel'
import MainContentArea from '../components/MainContentArea'
import Sidebar from '../components/Sidebar'
import { completeRideSummary } from '../services/stressApi'
import { useDriverSensors } from '../hooks/useDriverSensors'

const NOISE_INCIDENT_THRESHOLD_DB = 85
const ACCEL_SPIKE_THRESHOLD = 18
const INCIDENT_COOLDOWN_MS = 1800

const createRideId = () => `RIDE-${Date.now()}-${Math.floor(Math.random() * 1000)}`

function Dashboard({ dailyTarget, isShiftStarted }) {
  const { noiseDb, motionMagnitude, stressScore, error, startMonitoring, stopMonitoring } = useDriverSensors()
  const [isRideActive, setIsRideActive] = useState(false)
  const [rideId, setRideId] = useState('')
  const [incidents, setIncidents] = useState([])
  const stressSamplesRef = useRef([])
  const incidentCooldownRef = useRef({
    EXTREME_NOISE: 0,
    HARSH_DRIVING: 0,
  })

  useEffect(() => {
    if (!isShiftStarted) {
      setIsRideActive(false)
      setRideId('')
      setIncidents([])
      stressSamplesRef.current = []
    }
  }, [isShiftStarted])

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
      stressSamplesRef.current = []
      incidentCooldownRef.current = {
        EXTREME_NOISE: 0,
        HARSH_DRIVING: 0,
      }
      setIsRideActive(true)
      return
    }

    setIsRideActive(false)

    const capturedStress = stressSamplesRef.current
    const averageStress = capturedStress.length
      ? capturedStress.reduce((total, value) => total + value, 0) / capturedStress.length
      : 0

    const payload = {
      rideId,
      driverId: '4882-QX',
      targetPay: Number(dailyTarget ?? 0),
      summaryStats: {
        avgStress: Number(averageStress.toFixed(1)),
        totalEvents: incidents.length,
      },
      incidents,
    }

    await completeRideSummary(payload)
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
    </main>
  )
}

export default Dashboard
