import { useEffect, useRef, useState } from 'react'
import { calculateStressScore, stressLevelFromScore } from '../utils/stressHeuristics'

const initialState = {
  noiseDb: 0,
  motionMagnitude: 0,
  stressScore: 0,
  stressLevel: 'Low',
}

export function useDriverSensors() {
  const [state, setState] = useState(initialState)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState('')

  const latestNoiseDbRef = useRef(0)
  const audioContextRef = useRef(null)
  const analyzerRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const animationRef = useRef(null)
  const motionHandlerRef = useRef(null)

  useEffect(() => {
    return () => {
      stopMonitoring()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updateStress = ({ noiseDb, motionMagnitude }) => {
    const stressScore = calculateStressScore({ noiseDb, motionMagnitude })
    const stressLevel = stressLevelFromScore(stressScore)
    latestNoiseDbRef.current = noiseDb

    setState({ noiseDb, motionMagnitude, stressScore, stressLevel })
  }

  const runAudioLoop = () => {
    if (!analyzerRef.current) return

    const analyser = analyzerRef.current
    const buffer = new Uint8Array(analyser.fftSize)

    const tick = () => {
      analyser.getByteTimeDomainData(buffer)

      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const centered = (buffer[i] - 128) / 128
        sum += centered * centered
      }

      const rms = Math.sqrt(sum / buffer.length)
      const noiseDb = Math.max(0, Math.round(20 * Math.log10(rms + 1e-4) + 90))
      latestNoiseDbRef.current = noiseDb

      setState((prev) => {
        const stressScore = calculateStressScore({
          noiseDb,
          motionMagnitude: prev.motionMagnitude,
        })

        return {
          noiseDb,
          motionMagnitude: prev.motionMagnitude,
          stressScore,
          stressLevel: stressLevelFromScore(stressScore),
        }
      })

      animationRef.current = requestAnimationFrame(tick)
    }

    tick()
  }

  const startMonitoring = async () => {
    try {
      setError('')

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const audioContext = new window.AudioContext()
      audioContextRef.current = audioContext

      const sourceNode = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      sourceNode.connect(analyser)
      analyzerRef.current = analyser

      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission()
        if (permission !== 'granted') {
          throw new Error('Motion sensor permission was denied.')
        }
      }

      const onMotion = (event) => {
        const { x = 0, y = 0, z = 0 } = event.accelerationIncludingGravity ?? {}
        const motionMagnitude = Number(Math.sqrt(x * x + y * y + z * z).toFixed(2))

        updateStress({
          noiseDb: latestNoiseDbRef.current,
          motionMagnitude,
        })
      }

      window.addEventListener('devicemotion', onMotion)
      motionHandlerRef.current = onMotion

      runAudioLoop()
      setIsMonitoring(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start sensor monitoring.')
      stopMonitoring()
    }
  }

  const stopMonitoring = () => {
    setIsMonitoring(false)

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    if (motionHandlerRef.current) {
      window.removeEventListener('devicemotion', motionHandlerRef.current)
      motionHandlerRef.current = null
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyzerRef.current = null
  }

  return {
    ...state,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
  }
}
