import { useEffect } from 'react'
import { MetricCard } from '../components/MetricCard'
import { StatusBadge } from '../components/StatusBadge'
import { useDriverSensors } from '../hooks/useDriverSensors'
import { sendDriverTelemetry } from '../services/stressApi'

function stressTone(level) {
  if (level === 'High') return 'danger'
  if (level === 'Moderate') return 'warning'
  return 'info'
}

function Dashboard() {
  const {
    noiseDb,
    motionMagnitude,
    stressScore,
    stressLevel,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
  } = useDriverSensors()

  useEffect(() => {
    if (!isMonitoring) return

    const timer = setInterval(() => {
      sendDriverTelemetry({
        noiseDb,
        motionMagnitude,
        stressScore,
        stressLevel,
        capturedAt: new Date().toISOString(),
      })
    }, 6000)

    return () => clearInterval(timer)
  }, [isMonitoring, noiseDb, motionMagnitude, stressScore, stressLevel])

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Driver Pulse</p>
          <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Driver Stress Monitoring Dashboard</h1>
          <p className="mt-3 max-w-3xl text-slate-300">
            Monitors cabin noise and motion events using Web Audio and device accelerometer data to estimate driver stress in real time.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <StatusBadge level={stressLevel} />
            <button
              type="button"
              onClick={isMonitoring ? stopMonitoring : startMonitoring}
              className="rounded-xl bg-cyan-400 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
            </button>
          </div>
          {error ? <p className="mt-4 text-sm font-medium text-rose-300">{error}</p> : null}
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard title="Noise Level" value={noiseDb} unit="dB" tone="info" />
          <MetricCard title="Motion Magnitude" value={motionMagnitude} unit="m/s^2" tone="warning" />
          <MetricCard title="Stress Score" value={stressScore} unit="/100" tone={stressTone(stressLevel)} />
        </section>
      </div>
    </main>
  )
}

export default Dashboard
