const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

export async function sendDriverTelemetry(payload) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/driver/telemetry`, {
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
    const response = await fetch(`${API_BASE_URL}/api/rides/complete`, {
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
