import { useState } from 'react'
import PreShiftWelcome from './components/PreShiftWelcome'
import Dashboard from './pages/Dashboard'

function App() {
  const [isShiftStarted, setIsShiftStarted] = useState(false)
  const [dailyTarget, setDailyTarget] = useState(null)

  const handleShiftStart = (target) => {
    setDailyTarget(target)
    setIsShiftStarted(true)
  }

  return (
    <div className="relative">
      <Dashboard dailyTarget={dailyTarget} isShiftStarted={isShiftStarted} />
      {!isShiftStarted ? <PreShiftWelcome onLaunch={handleShiftStart} /> : null}
    </div>
  )
}

export default App
