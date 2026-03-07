import { useEffect, useRef, useState } from 'react'
import { accelData } from '../mockData/accelData'
import { convergenceData } from '../mockData/convergenceData'
import FlaggedMomentsPanel from './FlaggedMomentsPanel'

const CHART_HEIGHT = 260
const CHART_WIDTH = 900
const AUDIO_POINTS = 42
const NOMINAL_AUDIO_BASELINE = 56

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

function MainChart() {
  const live = convergenceData.map((row) => row.live)
  const forecast = convergenceData.map((row) => row.forecast)
  const livePath = createPath(live, CHART_WIDTH, CHART_HEIGHT)
  const forecastPath = createPath(forecast, CHART_WIDTH, CHART_HEIGHT)

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

      <div className="mt-4 h-[280px] rounded-xl border border-slate-800 bg-slate-950/80 p-4">
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="liveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          <path d={livePath} fill="none" stroke="#38bdf8" strokeWidth="3" />
          <path d={forecastPath} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="7 8" />

          <path
            d={`${livePath} L ${CHART_WIDTH} ${CHART_HEIGHT} L 0 ${CHART_HEIGHT} Z`}
            fill="url(#liveGradient)"
          />
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-400" />Actual Progress</span>
          <span className="inline-flex items-center gap-2"><span className="h-[2px] w-4 bg-slate-400" />Ghost Forecast</span>
        </div>
        <div className="flex gap-4">
          {convergenceData.slice(0, 6).map((item) => (
            <span key={item.time}>{item.time}</span>
          ))}
        </div>
      </div>
    </section>
  )
}

function AccelerationSpikesCard() {
  const spikeIndexes = new Set(
    [...accelData.bars.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, accelData.alertCount)
      .map(([index]) => index),
  )

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">Acceleration Spikes</h3>
        <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-xs font-semibold text-rose-400">
          {accelData.alertCount} Alerts
        </span>
      </div>

      <div className="mt-4 flex h-[170px] items-end gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        {accelData.bars.map((value, index) => (
          <div
            key={`${value}-${index}`}
            className={`flex-1 rounded-t-sm ${
              spikeIndexes.has(index)
                ? 'bg-gradient-to-t from-rose-700 to-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.4)]'
                : 'bg-gradient-to-t from-emerald-700 to-emerald-400'
            }`}
            style={{ height: `${value}%` }}
          />
        ))}
      </div>
    </section>
  )
}

function AudioIntensityCard({ isRideActive, liveNoiseDb, sensorError }) {
  const width = 420
  const height = 170
  const [waveSeries, setWaveSeries] = useState(() => Array.from({ length: AUDIO_POINTS }, () => NOMINAL_AUDIO_BASELINE))
  const noiseRef = useRef(liveNoiseDb)
  const phaseRef = useRef(0)

  useEffect(() => {
    noiseRef.current = liveNoiseDb
  }, [liveNoiseDb])

  useEffect(() => {
    if (!isRideActive) {
      setWaveSeries(Array.from({ length: AUDIO_POINTS }, () => NOMINAL_AUDIO_BASELINE))
      return
    }

    const interval = setInterval(() => {
      phaseRef.current += 0.6

      setWaveSeries((prev) => {
        const currentNoise = Number.isFinite(noiseRef.current) ? noiseRef.current : 42
        const normalized = ((currentNoise - 30) / 80) * 100
        const clamped = Math.min(Math.max(normalized, 0), 100)
        const oscillation = Math.sin(phaseRef.current) * 3.2
        const target = Math.min(Math.max(clamped + oscillation, 0), 100)
        const last = prev[prev.length - 1] ?? NOMINAL_AUDIO_BASELINE
        const next = Number((last + (target - last) * 0.35).toFixed(2))
        return [...prev.slice(1), next]
      })
    }, 100)

    return () => {
      clearInterval(interval)
    }
  }, [isRideActive])

  const wavePath = createPath(waveSeries, width, height, 0, 100)
  const hasLiveNoise = isRideActive && Number.isFinite(liveNoiseDb) && liveNoiseDb > 0
  const displayDb = hasLiveNoise ? liveNoiseDb : 42
  const statusLabel = hasLiveNoise ? 'ACTIVE' : 'NOMINAL'

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-200">Audio Intensity</h3>
        <span className="text-sm font-semibold text-emerald-400">
          {statusLabel} {displayDb.toFixed(1)}dB
        </span>
      </div>
      {sensorError ? <p className="mt-1 text-xs text-amber-300">Microphone permission not granted. Showing fallback dB.</p> : null}

      <div className="mt-4 h-[170px] rounded-xl border border-slate-800 bg-slate-950/70 p-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none">
          <path d={wavePath} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    </section>
  )
}

function MainContentArea({ isRideActive, liveNoiseDb, sensorError, driverId }) {
  return (
    <section className="space-y-5">
      <MainChart />

      <div className="grid gap-5 xl:grid-cols-2">
        <AccelerationSpikesCard />
        <AudioIntensityCard isRideActive={isRideActive} liveNoiseDb={liveNoiseDb} sensorError={sensorError} />
      </div>

      <FlaggedMomentsPanel driverId={driverId} />
    </section>
  )
}

export default MainContentArea
