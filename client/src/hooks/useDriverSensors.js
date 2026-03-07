import { useEffect, useRef, useState } from 'react'
import { normalizeDb, normalizeMotion, stressLevelFromScore } from '../utils/stressHeuristics'

const VOICE_DB_MIN = 20
const VOICE_DB_MAX = 110
const DB_CALIBRATION_OFFSET = 92
const DB_SMOOTHING = 0.18
const SAMPLE_RATE_HZ = 10
const SAMPLE_WINDOW_SIZE = 30
const SAMPLE_INTERVAL_MS = 1000 / SAMPLE_RATE_HZ
const DISPLAY_LERP_FACTOR = 0.16

const initialState = {
  noiseDb: 0,
  motionMagnitude: 0,
  stressScore: 0,
  stressLevel: 'Low',
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

const average = (values) => {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

const calculateContinuousStressScore = ({ noiseDb, motionMagnitude }) => {
  const noiseScore = normalizeDb(noiseDb)
  const motionScore = normalizeMotion(motionMagnitude)
  return clamp(noiseScore * 0.6 + motionScore * 0.4, 0, 100)
}

const toHumanRangeDb = (rms) => {
  const dbfs = 20 * Math.log10(rms + 1e-7)
  const estimatedSpl = dbfs + DB_CALIBRATION_OFFSET
  return clamp(estimatedSpl, VOICE_DB_MIN, VOICE_DB_MAX)
}

export function useDriverSensors() {
  const [state, setState] = useState(initialState)
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [error, setError] = useState('')

  const latestMotionRef = useRef(0)
  const latestInstantNoiseDbRef = useRef(0)
  const targetNoiseDbRef = useRef(0)
  const targetStressScoreRef = useRef(0)
  const displayedNoiseDbRef = useRef(0)
  const displayedStressScoreRef = useRef(0)
  const noiseSamplesRef = useRef([])
  const stressSamplesRef = useRef([])
  const lastSampleTimeRef = useRef(0)
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
      const previousDb = latestInstantNoiseDbRef.current || instantDb
      const smoothedDb = previousDb + (instantDb - previousDb) * DB_SMOOTHING
      latestInstantNoiseDbRef.current = smoothedDb

      const now = performance.now()
      if (now - lastSampleTimeRef.current >= SAMPLE_INTERVAL_MS) {
        lastSampleTimeRef.current = now

        noiseSamplesRef.current.push(smoothedDb)
        if (noiseSamplesRef.current.length > SAMPLE_WINDOW_SIZE) {
          noiseSamplesRef.current.shift()
        }

        const avgNoiseDb = average(noiseSamplesRef.current)
        targetNoiseDbRef.current = avgNoiseDb

        const continuousStress = calculateContinuousStressScore({
          noiseDb: avgNoiseDb,
          motionMagnitude: latestMotionRef.current,
        })

        stressSamplesRef.current.push(continuousStress)
        if (stressSamplesRef.current.length > SAMPLE_WINDOW_SIZE) {
          stressSamplesRef.current.shift()
        }

        targetStressScoreRef.current = average(stressSamplesRef.current)
      }

      displayedNoiseDbRef.current +=
        (targetNoiseDbRef.current - displayedNoiseDbRef.current) * DISPLAY_LERP_FACTOR
      displayedStressScoreRef.current +=
        (targetStressScoreRef.current - displayedStressScoreRef.current) * DISPLAY_LERP_FACTOR

      const displayedNoiseDb = Number(displayedNoiseDbRef.current.toFixed(1))
      const displayedStressScore = Number(displayedStressScoreRef.current.toFixed(1))

      setState({
        noiseDb: displayedNoiseDb,
        motionMagnitude: Number(latestMotionRef.current.toFixed(2)),
        stressScore: displayedStressScore,
        stressLevel: stressLevelFromScore(displayedStressScore),
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
          latestMotionRef.current = motionMagnitude
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

    latestMotionRef.current = 0
    latestInstantNoiseDbRef.current = 0
    targetNoiseDbRef.current = 0
    targetStressScoreRef.current = 0
    displayedNoiseDbRef.current = 0
    displayedStressScoreRef.current = 0
    noiseSamplesRef.current = []
    stressSamplesRef.current = []
    lastSampleTimeRef.current = 0
    analyzerRef.current = null
    setState(initialState)
  }

  return {
    ...state,
    isMonitoring,
    error,
    startMonitoring,
    stopMonitoring,
  }
}
