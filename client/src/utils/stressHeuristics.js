const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export const normalizeDb = (db) => {
  // Typical conversation/cabin noise range mapped to 0-100.
  const normalized = ((db - 30) / 60) * 100
  return clamp(normalized, 0, 100)
}

export const normalizeMotion = (motionMagnitude) => {
  // Convert acceleration spikes to a 0-100 intensity signal.
  const normalized = (motionMagnitude / 20) * 100
  return clamp(normalized, 0, 100)
}

export const calculateStressScore = ({ noiseDb, motionMagnitude }) => {
  const noiseScore = normalizeDb(noiseDb)
  const motionScore = normalizeMotion(motionMagnitude)

  // Weighted average: cabin noise is often a stronger immediate stress indicator.
  const blended = noiseScore * 0.6 + motionScore * 0.4
  return Math.round(clamp(blended, 0, 100))
}

export const stressLevelFromScore = (score) => {
  if (score < 35) return 'Low'
  if (score < 70) return 'Moderate'
  return 'High'
}
