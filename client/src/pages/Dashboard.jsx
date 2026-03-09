import { useEffect, useRef, useState } from 'react'
import Header from '../components/Header'
import MainContentArea from '../components/MainContentArea'
import RideSummaryModal from '../components/RideSummaryModal'
import Sidebar from '../components/Sidebar'
import ConsoleOverlay from '../components/ConsoleOverlay'
import AnalyticsOverlay from '../components/AnalyticsOverlay'
import LogsOverlay from '../components/LogsOverlay'
import NotificationOverlay from '../components/NotificationOverlay'
import { completeRideSummary, ensureEarningsDriver, postEarningsTrip, sendRideEndMetadata } from '../services/stressApi'
import { useDriverSensors } from '../hooks/useDriverSensors'

const NOISE_INCIDENT_THRESHOLD_DB = 85
const ACCEL_SPIKE_THRESHOLD = 18
const INCIDENT_COOLDOWN_MS = 1800
const USE_DUMMY_SUMMARY_MODAL = true
const DUMMY_AVG_STRESS_SCORE = 91
const DUMMY_SAFETY_SCORE = 81
const MAX_NOTIFICATION_HISTORY = 200

const DUMMY_NOTIFICATIONS = [
  {
    id: 'seed-1',
    title: 'Mid-Shift Snapshot',
    message: 'You are in the mid-shift window. Maintain current pickup cadence for stable pace.',
    timestampLabel: 'Just now',
    severity: 'nominal',
    tags: ['MID SHIFT', 'PACE STABLE'],
  },
  {
    id: 'seed-2',
    title: 'Demand Window',
    message: 'Demand is moderate in nearby zones. Favor short trips to keep hourly velocity high.',
    timestampLabel: '2m ago',
    severity: 'warning',
    tags: ['ZONE TIP', 'SHORT TRIPS'],
  },
  {
    id: 'seed-3',
    title: 'Harsh Braking Detected',
    message: 'Sharp deceleration pattern detected. Ease braking over the next few rides to stabilize stress and safety score.',
    timestampLabel: '6m ago',
    severity: 'alert',
    tags: ['HARSH BRAKE', 'SAFETY ALERT'],
  },
  {
    id: 'seed-4',
    title: 'Goal Watch',
    message: 'Projected finish is healthy. Keep acceptance steady through the next demand block.',
    timestampLabel: '11m ago',
    severity: 'nominal',
    tags: ['ON TRACK', 'CONSISTENCY'],
  },
]

const createRideId = () => `RIDE-${Date.now()}-${Math.floor(Math.random() * 1000)}`

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const formatElapsedTime = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const buildRideAlertMessages = (rideIncidents = []) => {
  const hasNoise = rideIncidents.some((incident) => incident?.type === 'EXTREME_NOISE')
  const hasHarsh = rideIncidents.some((incident) => incident?.type === 'HARSH_DRIVING')
  const alerts = []

  if (hasNoise) alerts.push('High cabin noise detected during ride.')
  if (hasHarsh) alerts.push('Harsh driving pattern detected during ride.')

  return alerts
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

function Dashboard({ dailyTarget, isShiftStarted, isRideActive, setIsRideActive, driverId, forceHideRideSummaryModal = false }) {
  const { noiseDb, motionMagnitude, stressScore, error, startMonitoring, stopMonitoring } = useDriverSensors()
  const [rideId, setRideId] = useState('')
  const [incidents, setIncidents] = useState([])
  const [rideSummary, setRideSummary] = useState(null)
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS)
  const [liveDriverStats, setLiveDriverStats] = useState(null)
  const [isLogsOverlayOpen, setIsLogsOverlayOpen] = useState(false)
  const [isConsoleOverlayOpen, setIsConsoleOverlayOpen] = useState(false)
  const [isAnalyticsOverlayOpen, setIsAnalyticsOverlayOpen] = useState(false)
  const [isNotificationOverlayOpen, setIsNotificationOverlayOpen] = useState(false)
  const stressSamplesRef = useRef([])
  const distanceKmRef = useRef(0)
  const rideStartedAtRef = useRef(null)
  const lastMessageSignatureRef = useRef('')
  const incidentCooldownRef = useRef({
    EXTREME_NOISE: 0,
    HARSH_DRIVING: 0,
  })

  const formatNotificationTime = (isoTs) => {
    const date = isoTs ? new Date(isoTs) : new Date()
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const mapPaceBandToSeverity = (paceBand) => {
    if (paceBand === 'behind' || paceBand === 'critical') return 'alert'
    if (paceBand === 'too_early' || paceBand === 'at_risk') return 'warning'
    return 'nominal'
  }

  const handleDashboardUpdate = (dashboard) => {
    if (!dashboard) return

    setLiveDriverStats(dashboard)

    const effectiveCurrent = Number(dashboard.effective_current_earnings ?? dashboard.current_earnings) || 0
    const effectiveProjected = Number(dashboard.effective_projected_earnings ?? dashboard.projected_earnings) || 0

    let message = String(dashboard.driver_message || '').trim()

    if (dashboard.pace_band === 'too_early' && Array.isArray(dashboard.projectionTimeline) && dashboard.projectionTimeline.length >= 2) {
      const timeline = dashboard.projectionTimeline
      const midPoint = timeline[Math.floor(timeline.length / 2)]
      const endPoint = timeline[timeline.length - 1]
      const current = Math.round(effectiveCurrent)
      const midProjected = Math.round(Number(midPoint?.projected) || current)
      const endProjected = Math.round(Number(endPoint?.projected) || effectiveProjected || current)
      message = `Current Rs ${current}. Mid-shift projection Rs ${midProjected}. End-shift projection Rs ${endProjected}.`
    }

    if (!message) return

    const signature = `${dashboard.pace_band}|${message}`
    if (signature === lastMessageSignatureRef.current) return
    lastMessageSignatureRef.current = signature

    const severity = mapPaceBandToSeverity(dashboard.pace_band)
    const nextNotification = {
      id: `notif-${Date.now()}`,
      title: 'Driver Guidance',
      message,
      timestampLabel: formatNotificationTime(dashboard.polledAt),
      severity,
      tags: [
        `PACE: ${(dashboard.pace_band || 'unknown').toUpperCase()}`,
        `EARN: Rs ${Math.round(effectiveCurrent)}`,
      ],
    }

    setNotifications((prev) => [nextNotification, ...prev].slice(0, MAX_NOTIFICATION_HISTORY))
  }

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

    const integrationDriverId = driverId || 'DRV001'
    const endedRideId = rideId || createRideId()
    const elapsedMs = rideStartedAtRef.current ? Date.now() - rideStartedAtRef.current : 0
    const distanceKm = Number(distanceKmRef.current.toFixed(1))
    const capturedStress = stressSamplesRef.current
    const averageStress = capturedStress.length
      ? capturedStress.reduce((total, value) => total + value, 0) / capturedStress.length
      : 0
    const clampedStress = clamp(averageStress, 0, 100)
    const safetyScore = clamp(100 - clampedStress - incidents.length * 4, 0, 100)
    const computedCurrentEarning = Number((Number(dailyTarget ?? 0) * (0.65 + safetyScore / 250)).toFixed(2))
    const alertMessages = buildRideAlertMessages(incidents)

    void sendRideEndMetadata({
      rideId: endedRideId,
      driverId: integrationDriverId,
      targetPay: Number(dailyTarget ?? 0),
      timeElapsed: formatElapsedTime(elapsedMs),
      distanceKm,
      summaryStats: {
        avgStress: Number(clampedStress.toFixed(1)),
        totalEvents: incidents.length,
        safetyScore: Number(safetyScore.toFixed(1)),
        currentEarning: computedCurrentEarning,
      },
      incidents,
      alertMessages,
    })

    if (USE_DUMMY_SUMMARY_MODAL) {
      setRideSummary(buildDummySummary(rideId))
      return
    }

    const currentEarning = computedCurrentEarning

    const payload = {
      rideId: endedRideId,
      driverId: '4882-QX',
      targetPay: Number(dailyTarget ?? 0),
      summaryStats: {
        avgStress: Number(clampedStress.toFixed(1)),
        totalEvents: incidents.length,
      },
      incidents,
    }

    setRideSummary({
      rideId: endedRideId,
      avgStressScore: Number(clampedStress.toFixed(1)),
      currentEarning,
      timeElapsed: formatElapsedTime(elapsedMs),
      distance: distanceKm,
      safetyScore,
      incidents,
    })

    // Persist summary in the background so UI feedback is instant on ride end.
    void completeRideSummary(payload)

    // Push one earnings event to Driver Pulse service so external charts can update.
    void ensureEarningsDriver(integrationDriverId).then(() =>
      postEarningsTrip(integrationDriverId, {
        trip_id: endedRideId,
        trip_earnings: currentEarning,
        trip_duration_min: Math.max(1, Math.round(elapsedMs / 60000)),
        fare: currentEarning,
        surge_multiplier: 1.0,
        timestamp: new Date().toISOString(),
      }),
    )
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
      <div className="mx-auto max-w-450 space-y-5">
        <Header
          dailyTarget={dailyTarget}
          isRideActive={isRideActive}
          onToggleRide={handleToggleRide}
          rideId={rideId}
          smoothedStressScore={stressScore}
        />

        <section className="grid gap-5 xl:grid-cols-[18%_55%_25%]">
          <Sidebar
            stats={liveDriverStats}
            onOpenConsole={() => setIsConsoleOverlayOpen(true)}
            onOpenLogs={() => setIsLogsOverlayOpen(true)}
            onOpenAnalytics={() => setIsAnalyticsOverlayOpen(true)}
            onOpenNotifications={() => setIsNotificationOverlayOpen(true)}
          />
          <MainContentArea
            driverId={driverId}
            onDashboardUpdate={handleDashboardUpdate}
          />
        </section>
      </div>

      <ConsoleOverlay
        isOpen={isConsoleOverlayOpen}
        onClose={() => setIsConsoleOverlayOpen(false)}
        driverId={driverId}
      />

      <AnalyticsOverlay
        isOpen={isAnalyticsOverlayOpen}
        onClose={() => setIsAnalyticsOverlayOpen(false)}
        driverId={driverId}
      />

      <LogsOverlay
        isOpen={isLogsOverlayOpen}
        onClose={() => setIsLogsOverlayOpen(false)}
        driverId={driverId}
      />

      <NotificationOverlay
        isOpen={isNotificationOverlayOpen}
        onClose={() => setIsNotificationOverlayOpen(false)}
        notifications={notifications}
      />

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
