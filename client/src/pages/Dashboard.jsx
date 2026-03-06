import { useEffect } from 'react'
import Header from '../components/Header'
import HistoryPanel from '../components/HistoryPanel'
import MainContentArea from '../components/MainContentArea'
import Sidebar from '../components/Sidebar'
import { useDriverSensors } from '../hooks/useDriverSensors'

function Dashboard({ dailyTarget, isShiftStarted }) {
  const { noiseDb, error, startMonitoring, stopMonitoring } = useDriverSensors()

  useEffect(() => {
    if (!isShiftStarted) {
      stopMonitoring()
      return
    }

    startMonitoring()

    return () => {
      stopMonitoring()
    }
    // startMonitoring/stopMonitoring come from the hook and are safe to capture for this mount cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isShiftStarted])

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-5 text-slate-100 sm:px-6 lg:px-8">
      <h1 className="sr-only">Driver Pulse Dashboard</h1>
      <div className="mx-auto max-w-[1800px] space-y-5">
        <Header dailyTarget={dailyTarget} />

        <section className="grid gap-5 xl:grid-cols-[20%_55%_25%]">
          <Sidebar />
          <MainContentArea liveNoiseDb={noiseDb} sensorError={error} />
          <HistoryPanel />
        </section>
      </div>
    </main>
  )
}

export default Dashboard
