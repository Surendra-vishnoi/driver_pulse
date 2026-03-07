function clip(val, lo, hi) {
  return Math.min(Math.max(val, lo), hi)
}

function toTs(timestamp) {
  return new Date(timestamp).getTime()
}

function lateralXY(x, y) {
  return Math.sqrt(x * x + y * y)
}

function motionScore(lxy) {
  if (lxy >= 5.0) return clip(0.85 + ((lxy - 5.0) / (8.68 - 5.0)) * 0.15, 0.85, 1.0)
  if (lxy >= 3.5) return clip(0.65 + ((lxy - 3.5) / (5.0 - 3.5)) * 0.2, 0.65, 0.85)
  if (lxy >= 2.0) return clip(0.4 + ((lxy - 2.0) / (3.5 - 2.0)) * 0.25, 0.4, 0.65)
  return clip((lxy / 2.0) * 0.4, 0.0, 0.4)
}

function audioScore(db, sustainedSec) {
  let base = clip((db - 50) / 50, 0, 1)
  if (sustainedSec > 120) base *= 1.25
  else if (sustainedSec > 60) base *= 1.15
  return clip(base, 0, 1)
}

const ALIGN_WINDOW_MS = 30_000

function alignSensors(accelRows, audioRows) {
  const audioByTrip = {}
  for (const a of audioRows) {
    if (!audioByTrip[a.trip_id]) audioByTrip[a.trip_id] = []
    audioByTrip[a.trip_id].push(a)
  }

  const aligned = []

  for (const acc of accelRows) {
    const candidates = audioByTrip[acc.trip_id] || []
    let bestAudio = null
    let bestDist = Infinity

    for (const aud of candidates) {
      const dist = Math.abs(acc.ts - aud.ts)
      if (dist <= ALIGN_WINDOW_MS && dist < bestDist) {
        bestDist = dist
        bestAudio = aud
      }
    }

    const lxy = lateralXY(acc.accel_x, acc.accel_y)
    const mScore = motionScore(lxy)

    let aScore, db, classification, sustained
    if (bestAudio) {
      db = bestAudio.audio_level_db
      classification = bestAudio.audio_classification
      sustained = bestAudio.sustained_duration_sec
      aScore = audioScore(db, sustained)
    } else {
      db = null
      classification = null
      sustained = 0
      aScore = null
    }

    aligned.push({
      trip_id: acc.trip_id,
      timestamp: acc.timestamp,
      elapsed_seconds: acc.elapsed_seconds,
      accel_x: acc.accel_x,
      accel_y: acc.accel_y,
      accel_z: acc.accel_z,
      speed_kmh: acc.speed_kmh,
      lateral_xy: lxy,
      motion_score: mScore,
      audio_level_db: db,
      audio_classification: classification,
      sustained_duration_sec: sustained,
      audio_score: aScore,
    })
  }

  const accelByTrip = {}
  for (const a of accelRows) {
    if (!accelByTrip[a.trip_id]) accelByTrip[a.trip_id] = []
    accelByTrip[a.trip_id].push(a)
  }

  for (const aud of audioRows) {
    const candidates = accelByTrip[aud.trip_id] || []
    let hasMatch = false
    for (const acc of candidates) {
      if (Math.abs(acc.ts - aud.ts) <= ALIGN_WINDOW_MS) {
        hasMatch = true
        break
      }
    }

    if (!hasMatch) {
      const aScore = audioScore(aud.audio_level_db, aud.sustained_duration_sec)
      aligned.push({
        trip_id: aud.trip_id,
        timestamp: aud.timestamp,
        elapsed_seconds: aud.elapsed_seconds,
        accel_x: null,
        accel_y: null,
        accel_z: null,
        speed_kmh: null,
        lateral_xy: null,
        motion_score: null,
        audio_level_db: aud.audio_level_db,
        audio_classification: aud.audio_classification,
        sustained_duration_sec: aud.sustained_duration_sec,
        audio_score: aScore,
      })
    }
  }

  aligned.sort((a, b) => {
    const tc = a.trip_id.localeCompare(b.trip_id)
    if (tc !== 0) return tc
    return new Date(a.timestamp) - new Date(b.timestamp)
  })

  return aligned
}

function fuseScores(mScore, aScore) {
  const NEUTRAL = 0.2
  if (mScore != null && aScore != null) return 0.5 * mScore + 0.5 * aScore
  if (mScore != null) return 0.7 * mScore + 0.3 * NEUTRAL
  if (aScore != null) return 0.7 * aScore + 0.3 * NEUTRAL
  return NEUTRAL
}

function severityLevel(combined) {
  if (combined >= 0.8) return 'high'
  if (combined >= 0.55) return 'medium'
  return 'low'
}

function classifyMotionLabel(lxy) {
  if (lxy == null) return 'none'
  if (lxy >= 5.0) return 'harsh_brake'
  if (lxy >= 3.5) return 'strong'
  if (lxy >= 2.0) return 'moderate'
  return 'normal'
}

function classifyAudioLabel(db) {
  if (db == null) return 'none'
  if (db >= 95) return 'extreme'
  if (db >= 88) return 'very_loud'
  if (db >= 75) return 'elevated'
  if (db >= 60) return 'normal'
  return 'quiet'
}

function assignFlag(row) {
  const ms = row.motion_score ?? 0
  const as = row.audio_score ?? 0
  const lxy = row.lateral_xy
  const db = row.audio_level_db
  const sustained = row.sustained_duration_sec || 0
  const motionLabel = classifyMotionLabel(lxy)
  const audioLabel = classifyAudioLabel(db)

  if ((ms >= 0.7 && as >= 0.7) || (ms >= 0.5 && as >= 0.8 && sustained > 60)) {
    const lxyStr = lxy != null ? lxy.toFixed(1) : 'N/A'
    const dbStr = db != null ? db.toFixed(0) : 'N/A'
    const sustStr = sustained > 0 ? ` for ${sustained}s` : ''
    return {
      flag_type: 'conflict_moment',
      explanation: `Combined signal: Harsh braking (${lxyStr} m/s²) + sustained high audio (${dbStr} dB)${sustStr}. Potential argument.`,
      context: `Motion: ${motionLabel} | Audio: ${audioLabel}`,
    }
  }

  if (ms >= 0.7 && as < 0.7) {
    const lxyStr = lxy != null ? lxy.toFixed(1) : 'N/A'
    const extra = db != null ? ` Audio ${audioLabel}.` : ''
    return {
      flag_type: 'harsh_braking',
      explanation: `Sudden deceleration detected (${lxyStr} m/s² spike).${extra}`,
      context: `Motion: ${motionLabel} | Audio: ${audioLabel}`,
    }
  }

  if (as >= 0.7 && ms < 0.7) {
    const dbStr = db != null ? db.toFixed(0) : 'N/A'
    const sustStr = sustained > 0 ? ` for ${sustained} seconds` : ''
    return {
      flag_type: 'audio_spike',
      explanation: `Sustained elevated cabin audio (${dbStr} dB)${sustStr}.`,
      context: `Motion: ${motionLabel} | Audio: ${audioLabel}`,
    }
  }

  if (ms >= 0.4 && ms < 0.7) {
    const lxyStr = lxy != null ? lxy.toFixed(1) : 'N/A'
    const extra = db != null ? ` Cabin audio ${db.toFixed(0)} dB.` : ''
    return {
      flag_type: 'moderate_brake',
      explanation: `Moderate deceleration event (${lxyStr} m/s²).${extra}`,
      context: `Motion: ${motionLabel} | Audio: ${audioLabel}`,
    }
  }

  if (as >= 0.4 && as < 0.7) {
    const dbStr = db != null ? db.toFixed(0) : 'N/A'
    const sustStr = sustained > 0 ? ` for ${sustained}s` : ''
    return {
      flag_type: 'audio_elevated',
      explanation: `Elevated cabin audio (${dbStr} dB)${sustStr}.`,
      context: `Motion: ${motionLabel} | Audio: ${audioLabel}`,
    }
  }

  return null
}

const SUSTAINED_STRESS_WINDOW_SEC = 120

function detectSustainedStress(flaggedRows) {
  const byTrip = {}
  for (const f of flaggedRows) {
    if (!byTrip[f.trip_id]) byTrip[f.trip_id] = []
    byTrip[f.trip_id].push(f)
  }

  const extra = []
  for (const [tripId, rows] of Object.entries(byTrip)) {
    const moderates = rows.filter((r) => r.flag_type === 'moderate_brake' || r.flag_type === 'audio_elevated')
    const used = new Set()

    for (let i = 0; i < moderates.length; i++) {
      if (used.has(i)) continue
      const cluster = [i]

      for (let j = i + 1; j < moderates.length; j++) {
        if (used.has(j)) continue
        const gap = Math.abs(moderates[j].elapsed_seconds - moderates[i].elapsed_seconds)
        if (gap <= SUSTAINED_STRESS_WINDOW_SEC) cluster.push(j)
      }

      if (cluster.length >= 2) {
        for (const idx of cluster) used.add(idx)
        const rep = cluster.map((idx) => moderates[idx]).sort((a, b) => b.combined_score - a.combined_score)[0]
        extra.push({
          ...rep,
          flag_type: 'sustained_stress',
          severity: severityLevel(rep.combined_score),
          explanation: `Cluster of ${cluster.length} moderate events within ${SUSTAINED_STRESS_WINDOW_SEC}s — sustained elevated stress.`,
          context: `Cluster size: ${cluster.length} | Trip: ${tripId}`,
        })
      }
    }
  }

  return extra
}

export function runFlaggingPipeline(rawData) {
  const { accel, audio, trips } = rawData

  // Build driver lookup
  const tripDriverMap = {}
  for (const t of trips) {
    tripDriverMap[t.trip_id] = t.driver_id
  }

  const accelRows = accel.map((r) => ({
    ...r,
    ts: toTs(r.timestamp),
    elapsed_seconds: Number(r.elapsed_seconds),
    accel_x: Number(r.accel_x),
    accel_y: Number(r.accel_y),
    accel_z: Number(r.accel_z),
    speed_kmh: Number(r.speed_kmh),
  }))

  const audioRows = audio.map((r) => ({
    ...r,
    ts: toTs(r.timestamp),
    elapsed_seconds: Number(r.elapsed_seconds),
    audio_level_db: Number(r.audio_level_db),
    sustained_duration_sec: Number(r.sustained_duration_sec),
  }))

  const aligned = alignSensors(accelRows, audioRows)

  for (const row of aligned) {
    row.combined_score = fuseScores(row.motion_score, row.audio_score)
  }

  let flagId = 1
  const flagged = []

  for (const row of aligned) {
    const result = assignFlag(row)
    if (!result) continue

    const combined = row.combined_score
    const sev = severityLevel(combined)

    flagged.push({
      flag_id: `FLAG${String(flagId).padStart(3, '0')}`,
      trip_id: row.trip_id,
      driver_id: tripDriverMap[row.trip_id] || 'UNKNOWN',
      timestamp: row.timestamp,
      elapsed_seconds: row.elapsed_seconds,
      flag_type: result.flag_type,
      severity: sev,
      motion_score: row.motion_score != null ? Number(row.motion_score.toFixed(2)) : null,
      audio_score: row.audio_score != null ? Number(row.audio_score.toFixed(2)) : null,
      combined_score: Number(combined.toFixed(2)),
      explanation: result.explanation,
      context: result.context,
      lateral_xy: row.lateral_xy != null ? Number(row.lateral_xy.toFixed(2)) : null,
      audio_level_db: row.audio_level_db,
      sustained_duration_sec: row.sustained_duration_sec || 0,
      speed_kmh: row.speed_kmh,
    })

    flagId++
  }

  const sustainedFlags = detectSustainedStress(flagged)
  for (const sf of sustainedFlags) {
    sf.flag_id = `FLAG${String(flagId).padStart(3, '0')}`
    flagged.push(sf)
    flagId++
  }

  flagged.sort((a, b) => {
    const tc = a.trip_id.localeCompare(b.trip_id)
    if (tc !== 0) return tc
    return a.elapsed_seconds - b.elapsed_seconds
  })

  flagged.forEach((f, i) => {
    f.flag_id = `FLAG${String(i + 1).padStart(3, '0')}`
  })

  const stats = computeStats(flagged)

  return { flagged, stats }
}

export function computeStats(flagged) {
  const byType = {}
  const bySeverity = {}
  const byTrip = {}
  const byDriver = {}

  for (const f of flagged) {
    byType[f.flag_type] = (byType[f.flag_type] || 0) + 1
    bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1
    byTrip[f.trip_id] = (byTrip[f.trip_id] || 0) + 1
    byDriver[f.driver_id] = (byDriver[f.driver_id] || 0) + 1
  }

  const topTrips = Object.entries(byTrip)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([trip_id, count]) => ({ trip_id, count }))

  const topDrivers = Object.entries(byDriver)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([driver_id, count]) => ({ driver_id, count }))

  return { total: flagged.length, byType, bySeverity, topTrips, topDrivers }
}
