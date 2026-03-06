import { useEffect, useRef, useState } from 'react'
import { calculateStressScore, stressLevelFromScore } from '../utils/stressHeuristics'

const VOICE_DB_MIN = 20
const VOICE_DB_MAX = 110
const DB_CALIBRATION_OFFSET = 92
const DB_SMOOTHING = 0.18

const initialState = {
  noiseDb: 0,
  motionMagnitude: 0,
  stressScore: 0,
  stressLevel: 'Low',
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const toHumanRangeDb = (rms) => {
  const dbfs = 20 * Math.log10(rms + 1e-7)
  const estimatedSpl = dbfs + DB_CALIBRATION_OFFSET
  return clamp(estimatedSpl, VOICE_DB_MIN, VOICE_DB_MAX)
}

export function useDriverSensors() {
  const [state, setState] = useState(initialState)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState('')

  const latestNoiseDbRef = useRef(0)
  const smoothedNoiseDbRef = useRef(0)
  const audioContextRef = useRef(null)
  const analyzerRef = useRef(null)
  const audioNodesRef = useRef([])
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
    const buffer = new Float32Array(analyser.fftSize)

    const tick = () => {
      analyser.getFloatTimeDomainData(buffer)

      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        sum += buffer[i] * buffer[i]
      }

      const rms = Math.sqrt(sum / buffer.length)
      const instantDb = toHumanRangeDb(rms)
      const previousDb = smoothedNoiseDbRef.current || instantDb
      const smoothedDb = previousDb + (instantDb - previousDb) * DB_SMOOTHING
      const noiseDb = Number(smoothedDb.toFixed(1))

      smoothedNoiseDbRef.current = noiseDb
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
        throw new Error('Driver Pulse requires microphone access, but this browser does not support it.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaStreamRef.current = stream

      const audioContext = new window.AudioContext()
      audioContextRef.current = audioContext

      const sourceNode = audioContext.createMediaStreamSource(stream)

      // Focus on voice-relevant frequencies to estimate cabin speech/noise in a human-like dB range.
      const highpass = audioContext.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 85

      const presence = audioContext.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 3000
      presence.Q.value = 1
      presence.gain.value = 3

      const lowpass = audioContext.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 8000

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048

      sourceNode.connect(highpass)
      highpass.connect(presence)
      presence.connect(lowpass)
      lowpass.connect(analyser)

      audioNodesRef.current = [sourceNode, highpass, presence, lowpass, analyser]
      analyzerRef.current = analyser

      let motionPermissionGranted = true
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission()
        motionPermissionGranted = permission === 'granted'
      }

      if (motionPermissionGranted) {
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
      }

      runAudioLoop()
      setIsMonitoring(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Driver Pulse was unable to start sensor monitoring.')
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

    audioNodesRef.current = []

    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    smoothedNoiseDbRef.current = 0
    latestNoiseDbRef.current = 0
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
