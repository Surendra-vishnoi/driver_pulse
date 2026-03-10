const normalizeBase = (value) => String(value || '').trim().replace(/\/+$/, '')

const isBrowser = typeof window !== 'undefined'
const currentOrigin = isBrowser ? window.location.origin : ''
const isLocalViteOrigin = /localhost:5173|127\.0\.0\.1:5173/i.test(currentOrigin)

const configuredApiBase = normalizeBase(import.meta.env.VITE_API_BASE_URL)
const configuredEarningsBase = normalizeBase(import.meta.env.VITE_EARNINGS_API_BASE_URL)

const derivedApiBase = configuredApiBase || (isLocalViteOrigin ? 'http://127.0.0.1:5000' : '')
const derivedEarningsBase = configuredEarningsBase || derivedApiBase

const API_BASE_URL = normalizeBase(derivedApiBase)
const EARNINGS_API_BASE_URL = normalizeBase(derivedEarningsBase)

if (isBrowser && !configuredApiBase && !configuredEarningsBase && !isLocalViteOrigin) {
  console.warn('[stressApi] Missing VITE_API_BASE_URL / VITE_EARNINGS_API_BASE_URL. Requests will use relative paths.')
}

const apiUrl = (path) => `${API_BASE_URL}${path}`
const earningsUrl = (path) => `${EARNINGS_API_BASE_URL}${path}`

export async function fetchSensorData() {
  try {
    const response = await fetch(apiUrl('/api/sensor-data'))
    if (!response.ok) throw new Error(`Sensor data request failed with status ${response.status}`)
    const json = await response.json()
    return json.data
  } catch (error) {
    console.error('[fetchSensorData]', error)
    return null
  }
}

export async function sendDriverTelemetry(payload) {
  try {
    const response = await fetch(apiUrl('/api/driver/telemetry'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Telemetry request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    // Keep UI resilient while backend endpoints are still evolving.
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown telemetry error',
    }
  }
}

export async function completeRideSummary(payload) {
  try {
    const response = await fetch(apiUrl('/api/rides/complete'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Ride completion failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown ride completion error',
    }
  }
}

export async function sendRideEndMetadata(payload) {
  try {
    const response = await fetch(apiUrl('/api/rides/end-meta'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      throw new Error(`Ride end metadata request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown ride end metadata error',
    }
  }
}

export async function fetchRideEndMetadata() {
  try {
    const response = await fetch(apiUrl('/api/rides/end-meta'))

    if (!response.ok) {
      throw new Error(`Ride end metadata fetch failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown ride end metadata fetch error',
      data: [],
      count: 0,
    }
  }
}

export async function fetchEarningsProjection(driverId, points = 20) {
  try {
    const response = await fetch(
      earningsUrl(`/drivers/${encodeURIComponent(driverId)}/projection?points=${points}`),
    )

    if (!response.ok) {
      throw new Error(`Earnings projection request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchEarningsProjection]', error)
    return null
  }
}

export async function fetchEarningsDashboardData(driverId) {
  try {
    const response = await fetch(
      earningsUrl(`/drivers/${encodeURIComponent(driverId)}/dashboard/data`),
    )

    if (!response.ok) {
      throw new Error(`Earnings dashboard request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchEarningsDashboardData]', error)
    return null
  }
}

export async function ensureEarningsDriver(driverId) {
  try {
    const response = await fetch(earningsUrl('/drivers/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_id: driverId }),
    })

    if (!response.ok) {
      throw new Error(`Earnings driver login failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[ensureEarningsDriver]', error)
    return null
  }
}

export async function postEarningsTrip(driverId, tripPayload) {
  try {
    const response = await fetch(
      earningsUrl(`/drivers/${encodeURIComponent(driverId)}/trips`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tripPayload),
      },
    )

    if (!response.ok) {
      throw new Error(`Earnings trip push failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[postEarningsTrip]', error)
    return null
  }
}

export async function fetchEarningsTrips(driverId) {
  try {
    const response = await fetch(
      earningsUrl(`/drivers/${encodeURIComponent(driverId)}/trips`),
    )

    if (!response.ok) {
      throw new Error(`Earnings trips request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchEarningsTrips]', error)
    return null
  }
}

export async function fetchDriverNotifications(driverId, limit = 4) {
  try {
    const response = await fetch(
      earningsUrl(`/drivers/${encodeURIComponent(driverId)}/notifications/recent?limit=${limit}`),
    )

    if (!response.ok) {
      throw new Error(`Driver notifications request failed with status ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('[fetchDriverNotifications]', error)
    return null
  }
}
