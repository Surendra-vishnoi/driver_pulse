import { useEffect, useMemo, useRef, useState } from 'react'
import { earningsFallback } from '../mockData/earningsFallback'
import FlaggedMomentsPanel from './FlaggedMomentsPanel'
import {
  fetchEarningsDashboardData,
  fetchEarningsProjection,
  fetchEarningsTrips,
  fetchSensorData,
} from '../services/stressApi'

const CHART_HEIGHT = 260
const CHART_WIDTH = 900
const PROJECTION_REFRESH_MS = 1 * 60 * 1000
const FALLBACK_TARGET = 1000
const NOW_ANCHOR_X = 0.8
const Y_AXIS_BASE = 50
const PLOT_BOTTOM_Y = CHART_HEIGHT * 0.9
const TARGET_Y = CHART_HEIGHT * 0.2
const PLOT_TOP_Y = 0
const REAL_HISTORY_LIMIT = 20
const DUMMY_HISTORY_POINTS = [90, 180, 250, 330, 390, 470]
const DUMMY_FORECAST_POINTS = [510, 560, 620, 680, 730]
const MIN_HISTORY_POINTS_FOR_LIVE = 2
const HISTORY_STORAGE_KEY_PREFIX = 'driver-pulse:earnings-history:'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const roundToBase = (value, base = Y_AXIS_BASE) => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value / base) * base
}

const formatMoney = (value) => `Rs ${Math.round(value).toLocaleString()}`

const mapEarningToY = (value, axisTarget) => {
  const safeTarget = Math.max(1, axisTarget)
  const safeValue = Math.max(0, Number(value) || 0)

  if (safeValue <= safeTarget) {
    const t = safeValue / safeTarget
    return PLOT_BOTTOM_Y - t * (PLOT_BOTTOM_Y - TARGET_Y)
  }

  const overTarget = safeValue - safeTarget
  const overWindow = safeTarget * (2 / 7)
  const t = overWindow > 0 ? clamp(overTarget / overWindow, 0, 1) : 1
  return TARGET_Y - t * (TARGET_Y - PLOT_TOP_Y)
}

const historyStorageKey = (driverId) => `${HISTORY_STORAGE_KEY_PREFIX}${driverId || 'DRV001'}`

const buildSeededLivePoints = (currentEarnings, targetEarnings) => {
  const current = Math.max(0, Number(currentEarnings) || 0)
  if (current <= 0) {
    return DUMMY_HISTORY_POINTS.map((value, idx) => ({
      x: (idx / (DUMMY_HISTORY_POINTS.length - 1)) * NOW_ANCHOR_X,
      y: value,
      series: 'real',
    }))
  }

  const floor = Math.max(current * 0.35, Math.min(260, (Number(targetEarnings) || FALLBACK_TARGET) * 0.18))
  const start = Math.max(0, Math.min(floor, current * 0.65))
  const values = [
    start,
    start + (current - start) * 0.2,
    start + (current - start) * 0.42,
    start + (current - start) * 0.64,
    start + (current - start) * 0.84,
    current,
  ]

  return values.map((value, idx) => ({
    x: (idx / (values.length - 1)) * NOW_ANCHOR_X,
    y: Number(value.toFixed(2)),
    series: 'real',
  }))
}

const buildSeededForecastPoints = (currentEarnings, projectedEarnings, targetEarnings) => {
  const current = Math.max(0, Number(currentEarnings) || 0)

  if (current <= 0) {
    return DUMMY_FORECAST_POINTS.map((value, idx) => ({
      x: NOW_ANCHOR_X + (idx / (DUMMY_FORECAST_POINTS.length - 1)) * (1 - NOW_ANCHOR_X),
      y: value,
      series: 'forecast',
    }))
  }

  const projected = Math.max(0, Number(projectedEarnings) || 0)
  const target = Math.max(1, Number(targetEarnings) || FALLBACK_TARGET)
  const blendedProjected = projected > current + 20
    ? projected
    : Math.max(current + target * 0.18, current + 120)

  const values = [
    current,
    current + (blendedProjected - current) * 0.32,
    current + (blendedProjected - current) * 0.61,
    blendedProjected,
  ]

  return values.map((value, idx) => ({
    x: NOW_ANCHOR_X + (idx / (values.length - 1)) * (1 - NOW_ANCHOR_X),
    y: Number(value.toFixed(2)),
    series: 'forecast',
  }))
}

const shouldUseConservativeFallback = ({ currentEarnings, targetEarnings, projectionTimeline, tripsCount }) => {
  if (!Array.isArray(projectionTimeline) || projectionTimeline.length < 2) return false

  const current = Math.max(0, Number(currentEarnings) || 0)
  const target = Math.max(1, Number(targetEarnings) || FALLBACK_TARGET)
  const projectedEnd = Math.max(0, Number(projectionTimeline[projectionTimeline.length - 1]?.projected) || 0)

  if (current <= 0) return false
  if (Number(tripsCount) > 3) return false

  const isTooHighVsCurrent = projectedEnd > current * earningsFallback.maxForecastToCurrentRatio
  const isTooHighVsTarget = projectedEnd > target * earningsFallback.maxForecastToTargetRatio
  return isTooHighVsCurrent || isTooHighVsTarget
}

const buildConservativeLivePoints = (currentEarnings) => {
  const current = Math.max(0, Number(currentEarnings) || 0)
  return earningsFallback.historyMultipliers.map((multiplier, idx) => ({
    x: (idx / (earningsFallback.historyMultipliers.length - 1)) * NOW_ANCHOR_X,
    y: Number((current * multiplier).toFixed(2)),
    series: 'real',
  }))
}

const buildConservativeForecastPoints = (currentEarnings, targetEarnings) => {
  const current = Math.max(0, Number(currentEarnings) || 0)
  const target = Math.max(1, Number(targetEarnings) || FALLBACK_TARGET)
  const minEnd = current + (earningsFallback.minForecastGain || 0)
  const maxEnd = target * earningsFallback.maxForecastToTargetRatio
  const multiplierEnd = current * earningsFallback.forecastMultipliers[earningsFallback.forecastMultipliers.length - 1]
  const desiredEnd = Math.max(minEnd, multiplierEnd)
  const effectiveEnd = Math.min(desiredEnd, maxEnd)

  return earningsFallback.forecastMultipliers.map((_, idx) => {
    const progress = idx / (earningsFallback.forecastMultipliers.length - 1)
    const raw = current + (effectiveEnd - current) * progress
    const capped = Math.min(raw, maxEnd)
    return {
      x: NOW_ANCHOR_X + (idx / (earningsFallback.forecastMultipliers.length - 1)) * (1 - NOW_ANCHOR_X),
      y: Number(capped.toFixed(2)),
      series: 'forecast',
    }
  })
}

const createPathFromPoints = (points, axisTarget) => {
  if (!points.length) return ''

  return points
    .map((point, index) => {
      const x = point.x * CHART_WIDTH
      const y = mapEarningToY(point.y, axisTarget)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function createPath(values, width, height, minValue = 0, maxValue = 100) {
  if (!values.length) return ''

  const stepX = width / (values.length - 1)
  return values
    .map((value, index) => {
      const x = index * stepX
      const normalized = (value - minValue) / (maxValue - minValue)
      const y = height - normalized * height
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

function MainChart({ driverId, onDashboardUpdate }) {
  const [chartState, setChartState] = useState({
    currentEarnings: 0,
    projectedEarnings: 0,
    targetEarnings: FALLBACK_TARGET,
    currentHours: 0,
    shiftDurationHours: 8,
    tripsCount: 0,
    currentVelocity: 0,
  })
  const [projectionTimeline, setProjectionTimeline] = useState([])
  const [realHistory, setRealHistory] = useState([])
  const [hoverPoint, setHoverPoint] = useState(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  const requestCountRef = useRef(0)
  const dashboardUpdateRef = useRef(onDashboardUpdate)

  useEffect(() => {
    dashboardUpdateRef.current = onDashboardUpdate
  }, [onDashboardUpdate])

  useEffect(() => {
    const activeDriverId = driverId || 'DRV001'
    if (typeof window === 'undefined') return

    try {
      const raw = window.sessionStorage.getItem(historyStorageKey(activeDriverId))
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const cleaned = parsed
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .slice(-REAL_HISTORY_LIMIT)
      if (cleaned.length >= 2) {
        setRealHistory(cleaned)
      }
    } catch {
      // Ignore corrupt local session cache.
    }
  }, [driverId])

  useEffect(() => {
    const activeDriverId = driverId || 'DRV001'

    const loadProjection = async () => {
      const [dashboard, projection, trips] = await Promise.all([
        fetchEarningsDashboardData(activeDriverId),
        fetchEarningsProjection(activeDriverId, 20),
        fetchEarningsTrips(activeDriverId),
      ])

      if (dashboard) {
        const projectedFromTimeline = projection?.timeline?.length
          ? Number(projection.timeline[projection.timeline.length - 1].projected)
          : Number(dashboard.projected_earnings)

        setChartState({
          currentEarnings: Number(dashboard.current_earnings) || 0,
          projectedEarnings: Number(projectedFromTimeline) || 0,
          targetEarnings: Number(dashboard.target_earnings) || FALLBACK_TARGET,
          currentHours: Number(dashboard.current_hours) || 0,
          shiftDurationHours: Number(dashboard.shift_duration_hours) || 8,
          tripsCount: Number(dashboard.trips_count) || 0,
          currentVelocity: Number(dashboard.current_velocity) || 0,
        })

        setProjectionTimeline(projection?.timeline || [])
        const cumulativeFromTrips = (trips?.trips || [])
          .map((trip) => Number(trip.trip_earnings) || 0)
          .reduce((acc, value) => {
            const previous = acc.length ? acc[acc.length - 1] : 0
            acc.push(previous + Math.max(0, value))
            return acc
          }, [])
          .slice(-REAL_HISTORY_LIMIT)

        setRealHistory((prev) => {
          const next = cumulativeFromTrips.length
            ? cumulativeFromTrips
            : [...prev, Number(dashboard.current_earnings) || 0]
          const trimmed = next.slice(-REAL_HISTORY_LIMIT)

          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem(historyStorageKey(activeDriverId), JSON.stringify(trimmed))
            } catch {
              // Ignore storage failures and continue rendering.
            }
          }

          return trimmed
        })

        const currentEarnings = Number(dashboard.current_earnings) || 0
        const tripsCount = Number(dashboard.trips_count) || 0
        const shouldUseDummyEarnings =
          tripsCount === 0 &&
          currentEarnings <= 0 &&
          (projection?.timeline?.length || 0) === 0

        const effectiveCurrentEarnings = shouldUseDummyEarnings
          ? DUMMY_HISTORY_POINTS[DUMMY_HISTORY_POINTS.length - 1]
          : currentEarnings

        const effectiveProjectedEarnings = shouldUseDummyEarnings
          ? DUMMY_FORECAST_POINTS[DUMMY_FORECAST_POINTS.length - 1]
          : Number(projectedFromTimeline) || 0

        requestCountRef.current += 1
        dashboardUpdateRef.current?.({
          ...dashboard,
          projectionTimeline: projection?.timeline || [],
          effective_current_earnings: effectiveCurrentEarnings,
          effective_projected_earnings: effectiveProjectedEarnings,
          is_dummy_earnings: shouldUseDummyEarnings,
          polledAt: new Date().toISOString(),
          pollCount: requestCountRef.current,
        })
        setLastUpdatedAt(new Date())
      } else {
        // Keep Sidebar stats in sync with chart fallback values when API is temporarily unavailable.
        const fallbackCurrent = DUMMY_HISTORY_POINTS[DUMMY_HISTORY_POINTS.length - 1]
        const fallbackProjected = DUMMY_FORECAST_POINTS[DUMMY_FORECAST_POINTS.length - 1]

        requestCountRef.current += 1
        dashboardUpdateRef.current?.({
          driver_id: activeDriverId,
          current_earnings: 0,
          projected_earnings: 0,
          target_earnings: FALLBACK_TARGET,
          trips_count: 0,
          pace_band: 'tracking',
          projectionTimeline: [],
          effective_current_earnings: fallbackCurrent,
          effective_projected_earnings: fallbackProjected,
          is_dummy_earnings: true,
          polledAt: new Date().toISOString(),
          pollCount: requestCountRef.current,
        })
        setLastUpdatedAt(new Date())
      }
    }

    void loadProjection()
    const interval = setInterval(() => {
      void loadProjection()
    }, PROJECTION_REFRESH_MS)

    return () => clearInterval(interval)
  }, [driverId])

  const shouldUseDummySeries =
    chartState.tripsCount === 0 &&
    chartState.currentEarnings <= 0 &&
    projectionTimeline.length === 0

  const shouldUseConservativeSeries = shouldUseConservativeFallback({
    currentEarnings: chartState.currentEarnings,
    targetEarnings: chartState.targetEarnings,
    projectionTimeline,
    tripsCount: chartState.tripsCount,
  })

  const hasRichRealHistory = realHistory.length >= MIN_HISTORY_POINTS_FOR_LIVE
  const hasUsableProjection = projectionTimeline.length >= 2 && !shouldUseConservativeSeries

  const livePoints = (() => {
    if (shouldUseDummySeries) {
      return buildSeededLivePoints(0, chartState.targetEarnings)
    }

    if (shouldUseConservativeSeries) {
      return buildConservativeLivePoints(chartState.currentEarnings)
    }

    if (hasRichRealHistory) {
      return realHistory.map((value, idx) => ({
        x: (idx / (realHistory.length - 1)) * NOW_ANCHOR_X,
        y: Math.max(0, value),
        series: 'real',
      }))
    }

    const current = Math.max(0, chartState.currentEarnings)
    const elapsedHours = Math.max(0, chartState.currentHours)
    const velocity = Math.max(0, chartState.currentVelocity)
    const estimatedStart = Math.max(0, current - velocity * elapsedHours)

    return [
      { x: 0, y: estimatedStart, series: 'real' },
      { x: NOW_ANCHOR_X, y: current, series: 'real' },
    ]
  })()

  const forecastPoints = (() => {
    if (shouldUseDummySeries) {
      return buildSeededForecastPoints(0, 0, chartState.targetEarnings)
    }

    if (shouldUseConservativeSeries) {
      return buildConservativeForecastPoints(chartState.currentEarnings, chartState.targetEarnings)
    }

    if (hasUsableProjection) {
      return projectionTimeline.map((item, idx) => ({
        x: NOW_ANCHOR_X + (idx / (projectionTimeline.length - 1)) * (1 - NOW_ANCHOR_X),
        y: Math.max(0, Number(item.projected) || 0),
        series: 'forecast',
      }))
    }

    return buildSeededForecastPoints(
      chartState.currentEarnings,
      chartState.projectedEarnings,
      chartState.targetEarnings,
    )
  })()

  const targetEarnings = Math.max(1, chartState.targetEarnings)
  const axisStep = Math.max(Y_AXIS_BASE, roundToBase(targetEarnings / 7, Y_AXIS_BASE))
  const axisTarget = axisStep * 7
  const axisTicks = Array.from({ length: 10 }, (_, index) => axisStep * index)

  const livePath = createPathFromPoints(livePoints, axisTarget)
  const forecastPath = createPathFromPoints(forecastPoints, axisTarget)
  const targetY = mapEarningToY(targetEarnings, axisTarget)
  const targetCapY = mapEarningToY(axisStep * 9, axisTarget)

  const allHoverCandidates = [...livePoints, ...forecastPoints].map((point) => ({
    ...point,
    xPx: point.x * CHART_WIDTH,
    yPx: mapEarningToY(point.y, axisTarget),
  }))

  const handleSvgMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH

    let best = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const point of allHoverCandidates) {
      const distance = Math.abs(point.xPx - x)
      if (distance < bestDistance) {
        bestDistance = distance
        best = point
      }
    }

    setHoverPoint(best)
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Primary Stream</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">Driver Pulse</h2>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 text-xs text-slate-300">Sampling: 240hz</span>
          <span className="rounded-lg border border-sky-400/40 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-400">92% Sync</span>
        </div>
      </div>

      <div className="relative mt-4 h-[280px] rounded-xl border border-slate-800 bg-slate-950/80 p-4">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-full w-full"
          preserveAspectRatio="none"
          onMouseMove={handleSvgMove}
          onMouseLeave={() => setHoverPoint(null)}
        >
          <defs>
            <linearGradient id="liveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {axisTicks.map((tick, idx) => {
            const y = mapEarningToY(tick, axisTarget)
            const label = idx === axisTicks.length - 1 ? `${formatMoney(tick)}+` : formatMoney(tick)
            return (
              <g key={`tick-${tick}`}>
                <line x1="0" y1={y} x2={CHART_WIDTH} y2={y} stroke="#1e293b" strokeWidth="1" />
                <text x="4" y={y - 4} fill="#94a3b8" fontSize="11">{label}</text>
              </g>
            )
          })}

          <line x1="0" y1={targetY} x2={CHART_WIDTH} y2={targetY} stroke="#22c55e" strokeWidth="2" strokeDasharray="6 6" />
          <line x1="0" y1={targetCapY} x2={CHART_WIDTH} y2={targetCapY} stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4 8" />
          <line x1={CHART_WIDTH * NOW_ANCHOR_X} y1="0" x2={CHART_WIDTH * NOW_ANCHOR_X} y2={CHART_HEIGHT} stroke="#64748b" strokeWidth="1" strokeDasharray="5 6" />

          <path d={livePath} fill="none" stroke="#38bdf8" strokeWidth="3" />
          <path d={forecastPath} fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="7 7" />

          <path
            d={`${livePath} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`}
            fill="url(#liveGradient)"
          />

          {hoverPoint ? (
            <circle
              cx={hoverPoint.xPx}
              cy={hoverPoint.yPx}
              r="5"
              fill={hoverPoint.series === 'real' ? '#22c55e' : '#facc15'}
              stroke="#0f172a"
              strokeWidth="2"
            />
          ) : null}

          <text x={CHART_WIDTH - 6} y={targetY - 6} textAnchor="end" fill="#86efac" fontSize="12">Target</text>
          <text x={CHART_WIDTH - 6} y={targetCapY - 6} textAnchor="end" fill="#c4b5fd" fontSize="12">Top +2 steps</text>
        </svg>

        {hoverPoint ? (
          <div
            className="pointer-events-none absolute rounded-md border border-slate-700 bg-slate-900/95 px-2 py-1 text-xs text-slate-100"
            style={{
              left: `${(hoverPoint.xPx / CHART_WIDTH) * 100}%`,
              top: `${(hoverPoint.yPx / CHART_HEIGHT) * 100}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div>{hoverPoint.series === 'real' ? 'Actual' : 'Forecast'}</div>
            <div className="font-semibold">{formatMoney(hoverPoint.y)}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-400" />Actual Progress</span>
          <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 bg-amber-300" />Forecast (1m updates)</span>
          <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 bg-emerald-400" />Target</span>
          <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 bg-violet-300" />Target +20%</span>
        </div>
      </div>

      <p className="mt-2 text-xs text-slate-500">
        Earnings source: Driver Pulse API ({driverId || 'DRV001'}) | Refresh: every 1 minute
        {lastUpdatedAt ? ` | Last update: ${lastUpdatedAt.toLocaleTimeString()}` : ''}
      </p>
    </section>
  )
}

function AccelerationSpikesCard({ driverId }) {
  const SPIKE_THRESHOLD = 3.5
  const [accelRows, setAccelRows] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchSensorData().then((res) => {
      if (cancelled || !res) return
      const { accel, trips } = res
      const normalizedId = (driverId || '').trim().toUpperCase()
      const driverTrips = new Set(
        (trips || []).filter((t) => !normalizedId || (t.driver_id || '').toUpperCase() === normalizedId).map((t) => t.trip_id),
      )
      const filtered = (accel || []).filter((r) => driverTrips.has(r.trip_id))
      setAccelRows(filtered)
    })
    return () => { cancelled = true }
  }, [driverId])

  const { bars, alertCount } = useMemo(() => {
    if (!accelRows.length) return { bars: [], alertCount: 0 }
    const magnitudes = accelRows.map((r) => Math.sqrt(parseFloat(r.accel_x) ** 2 + parseFloat(r.accel_y) ** 2))
    const maxMag = Math.max(...magnitudes, 1)
    const barValues = magnitudes.map((m) => (m / maxMag) * 100)
    const alerts = magnitudes.filter((m) => m >= SPIKE_THRESHOLD).length
    return { bars: barValues, alertCount: alerts }
  }, [accelRows])

  const spikeIndexes = useMemo(() => {
    if (!accelRows.length) return new Set()
    const magnitudes = accelRows.map((r) => Math.sqrt(parseFloat(r.accel_x) ** 2 + parseFloat(r.accel_y) ** 2))
    return new Set(magnitudes.map((m, i) => (m >= SPIKE_THRESHOLD ? i : -1)).filter((i) => i >= 0))
  }, [accelRows])

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">Acceleration Spikes</h3>
        <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-400">
          {alertCount} Alerts
        </span>
      </div>

      <div className="mt-4 flex h-[170px] items-end gap-[1px] rounded-xl border border-slate-800 bg-slate-950/70 p-3 overflow-hidden">
        {bars.length === 0 && <p className="m-auto text-xs text-slate-500">No acceleration data for {driverId || 'this driver'}</p>}
        {bars.map((value, index) => (
          <div
            key={`accel-${index}`}
            className={`flex-1 min-w-[2px] rounded-t-sm ${
              spikeIndexes.has(index)
                ? 'bg-gradient-to-t from-rose-700 to-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                : 'bg-gradient-to-t from-emerald-700 to-emerald-400'
            }`}
            style={{ height: `${Math.max(value, 2)}%` }}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{accelRows.length} readings | Spike threshold: {SPIKE_THRESHOLD} m/s2</p>
    </section>
  )
}

function AudioIntensityCard({ driverId }) {
  const width = 420
  const height = 170
  const [audioRows, setAudioRows] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchSensorData().then((res) => {
      if (cancelled || !res) return
      const { audio, trips } = res
      const normalizedId = (driverId || '').trim().toUpperCase()
      const driverTrips = new Set(
        (trips || []).filter((t) => !normalizedId || (t.driver_id || '').toUpperCase() === normalizedId).map((t) => t.trip_id),
      )
      const filtered = (audio || []).filter((r) => driverTrips.has(r.trip_id))
      setAudioRows(filtered)
    })
    return () => { cancelled = true }
  }, [driverId])

  const { dbValues, peakDb, avgDb } = useMemo(() => {
    if (!audioRows.length) return { dbValues: [], peakDb: 0, avgDb: 0 }
    const values = audioRows.map((r) => parseFloat(r.audio_level_db) || 0)
    const peak = Math.max(...values)
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    return { dbValues: values, peakDb: peak, avgDb: avg }
  }, [audioRows])

  const wavePath = useMemo(() => {
    if (!dbValues.length) return ''
    return createPath(dbValues, width, height, 0, Math.max(...dbValues, 100))
  }, [dbValues, width, height])

  const statusLabel = peakDb >= 80 ? 'HIGH' : peakDb >= 60 ? 'MODERATE' : 'NOMINAL'
  const statusColor = peakDb >= 80 ? 'text-rose-400' : peakDb >= 60 ? 'text-amber-400' : 'text-emerald-400'
  const strokeColor = peakDb >= 80 ? '#f43f5e' : peakDb >= 60 ? '#f59e0b' : '#34d399'

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">Audio Intensity</h3>
        <span className={`text-sm font-semibold ${statusColor}`}>
          {statusLabel} | Peak {peakDb.toFixed(1)}dB | Avg {avgDb.toFixed(1)}dB
        </span>
      </div>

      <div className="mt-4 h-[170px] rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        {dbValues.length === 0 && <p className="flex h-full items-center justify-center text-xs text-slate-500">No audio data for {driverId || 'this driver'}</p>}
        {dbValues.length > 0 && (
          <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
            <path d={wavePath} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">{audioRows.length} readings | Classifications: {[...new Set(audioRows.map((r) => r.audio_classification))].join(', ') || 'N/A'}</p>
    </section>
  )
}

function MainContentArea({ driverId, onDashboardUpdate }) {
  return (
    <>
      <section className="space-y-5">
        <MainChart driverId={driverId} onDashboardUpdate={onDashboardUpdate} />
        <FlaggedMomentsPanel driverId={driverId} />
      </section>

      <aside className="space-y-5">
        <AccelerationSpikesCard driverId={driverId} />
        <AudioIntensityCard driverId={driverId} />
      </aside>
    </>
  )
}

export default MainContentArea
