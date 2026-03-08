# FASTAPI INTEGRATION GUIDE
# Driver Pulse Real-Time Earnings & Visualization System

## Overview

This guide shows how to use the new **FastAPI layer** to:
1. ✅ Track trip earnings in real-time
2. ✅ Update pace scores after each trip
3. ✅ Display projected earnings graphs
4. ✅ Integrate with external systems via REST API

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     External Systems                             │
│         (Mobile app, Dashboard, Ride-hailing platform)          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/JSON
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Server (api.py)                        │
│  • POST /drivers/{id}/trips   (record trip earnings)            │
│  • GET  /drivers/{id}         (get current metrics)             │
│  • GET  /drivers/{id}/dashboard (view projected earnings)       │
│  • GET  /drivers/{id}/projection (get chart data)               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│           TripEarningsTracker (pipeline/trip_earnings.py)       │
│  • Tracks current_earnings per driver                           │
│  • Calculates velocity (₹/hour) rolling average                │
│  • Computes pace scores using 4-signal model                   │
│  • Generates driver messages                                    │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│      Earnings Visualization (pipeline/earnings_visualization.py) │
│  • Generates interactive HTML dashboards                        │
│  • Creates Chart.js JSON for integration                        │
│  • Produces projected earnings graphs                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Start the API Server

```bash
# Activate virtual environment
cd c:\Users\lavan\OneDrive\Desktop\driver_pulse
& venv\Scripts\Activate.ps1

# Start FastAPI server
python api.py --host 127.0.0.1 --port 8000

# Or with auto-reload for development:
python api.py --host 127.0.0.1 --port 8000 --reload
```

**Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     API Docs: http://127.0.0.1:8000/docs
```

Open http://127.0.0.1:8000/docs in your browser to see interactive API documentation.

---

## 2. Initialize a Driver

**Endpoint:** `POST /drivers`

**Request:**
```bash
curl -X POST "http://127.0.0.1:8000/drivers" \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "DRV001",
    "name": "Alex Kumar",
    "target_earnings": 1400,
    "shift_duration_hours": 8,
    "current_earnings": 0,
    "current_hours": 0
  }'
```

**Response:**
```json
{
  "driver_id": "DRV001",
  "name": "Alex Kumar",
  "current_earnings": 0,
  "target_earnings": 1400,
  "current_hours": 0,
  "shift_duration_hours": 8,
  "remaining_hours": 8,
  "pace_score": null,
  "pace_band": "too_early",
  "projected_earnings": 0,
  "driver_message": "Shift just started — not enough data to score yet.",
  "trips_count": 0
}
```

---

## 3. Record a Trip (Trip Earnings Update)

**Endpoint:** `POST /drivers/{driver_id}/trips`

This is the **key endpoint** that updates earnings and pace scores in real-time.

**Request:**
```bash
curl -X POST "http://127.0.0.1:8000/drivers/DRV001/trips" \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id": "TRIP_20250308_001",
    "trip_earnings": 350,
    "trip_duration_min": 28,
    "fare": 280,
    "surge_multiplier": 1.25,
    "timestamp": "2025-03-08T10:30:00"
  }'
```

**What Happens Internally:**
1. ✅ Earnings updated: `current_earnings = 350`
2. ✅ Velocity calculated: `₹/hour = 350 / (elapsed_time)`
3. ✅ Pace score recomputed using 4 signals:
   - S1: Pace Ratio (earned % vs elapsed %)
   - S2: Velocity Ratio (current ₹/hr vs target)
   - S3: Projection Ratio (will you hit goal?)
   - S4: Pressure Ratio (how much must you earn now?)
4. ✅ Driver message regenerated with current situation
5. ✅ Projected earnings recalculated

**Response:**
```json
{
  "driver_id": "DRV001",
  "name": "Alex Kumar",
  "current_earnings": 350,
  "target_earnings": 1400,
  "current_hours": 0.47,
  "shift_duration_hours": 8,
  "remaining_hours": 7.53,
  "earnings_gap": 1050,
  "pace_score": 45.3,
  "pace_band": "slightly_behind",
  "projected_earnings": 1095,
  "driver_message": "🟡 You're slightly behind pace, Alex Kumar. You've earned ₹350 of your ₹1400 goal (0.5 of 8.0 hours elapsed). Your current pace is ₹745/hr — ₹573 above the required ₹175/hr. At this pace you're projected to finish at ₹1095 — ₹305 short of your goal.",
  "trips_count": 1,
  "current_velocity": 745.0,
  "target_velocity": 175.0
}
```

---

## 4. Get Projected Earnings Graph Data

**Endpoint:** `GET /drivers/{driver_id}/projection?points=20`

Returns timeline data for visualization (current to end of shift).

**Request:**
```bash
curl "http://127.0.0.1:8000/drivers/DRV001/projection?points=20"
```

**Response:**
```json
{
  "driver_id": "DRV001",
  "timeline": [
    {
      "hour": 0.47,
      "projected": 350,
      "target": 1400,
      "current": 350
    },
    {
      "hour": 1.22,
      "projected": 559,
      "target": 1400,
      "current": null
    },
    {
      "hour": 1.97,
      "projected": 769,
      "target": 1400,
      "current": null
    },
    ...
    {
      "hour": 8.0,
      "projected": 1095,
      "target": 1400
    }
  ],
  "points": 20
}
```

### For Web Integration (Chart.js format):

**Endpoint:** `GET /drivers/{driver_id}/chart.json`

```bash
curl "http://127.0.0.1:8000/drivers/DRV001/chart.json"
```

Returns JSON ready for Chart.js library.

---

## 5. View Interactive Dashboard

**Endpoint:** `GET /drivers/{driver_id}/dashboard`

Opens in any browser. Includes:
- 📊 Projected earnings chart
- 📈 Current metrics (earnings, pace, velocity)
- 💬 Driver message
- ✅ Status emoji and pace band

**Request:**
```bash
# Open in browser directly
http://127.0.0.1:8000/drivers/DRV001/dashboard
```

Or from command line:
```bash
# Windows PowerShell
Start-Process "http://127.0.0.1:8000/drivers/DRV001/dashboard"

# Or
curl "http://127.0.0.1:8000/drivers/DRV001/dashboard" -o driver_dashboard.html
# Then open driver_dashboard.html in browser
```

---

## 6. Get Driver Metrics Summary

**Endpoint:** `GET /drivers/{driver_id}`

Quick snapshot of current metrics for a driver.

```bash
curl "http://127.0.0.1:8000/drivers/DRV001"
```

---

## 7. List All Drivers

**Endpoint:** `GET /drivers`

Get metrics for all initialized drivers.

```bash
curl "http://127.0.0.1:8000/drivers"
```

---

## Complete Workflow Example

Here's a **Python script** to simulate a full day:

```python
# example_integration.py
import requests
import time
from datetime import datetime, timedelta

BASE_URL = "http://127.0.0.1:8000"

# 1. Initialize driver at shift start
print("1️⃣  Initializing driver...")
driver = requests.post(f"{BASE_URL}/drivers", json={
    "driver_id": "DRV001",
    "name": "Alex Kumar",
    "target_earnings": 1400,
    "shift_duration_hours": 8,
}).json()
print(f"Driver initialized: {driver['pace_band']}")

# 2. Record trips throughout shift
trips = [
    {"trip_id": "T1", "trip_earnings": 280, "trip_duration_min": 22},
    {"trip_id": "T2", "trip_earnings": 320, "trip_duration_min": 28},
    {"trip_id": "T3", "trip_earnings": 350, "trip_duration_min": 25},
    {"trip_id": "T4", "trip_earnings": 210, "trip_duration_min": 18},
    {"trip_id": "T5", "trip_earnings": 380, "trip_duration_min": 32},
]

for i, trip in enumerate(trips, 1):
    print(f"\n{i+1}️⃣  Recording trip {trip['trip_id']}...")
    
    # Record trip
    metrics = requests.post(
        f"{BASE_URL}/drivers/DRV001/trips",
        json=trip
    ).json()
    
    # Display update
    print(f"   Earnings: ₹{metrics['current_earnings']:.0f} / ₹{metrics['target_earnings']:.0f}")
    print(f"   Pace: {metrics['pace_band']} (score: {metrics['pace_score']})")
    print(f"   Message: {metrics['driver_message'][:80]}...")
    
    # Wait before next trip (simulate real time)
    if i < len(trips):
        time.sleep(2)

# 3. Get final projection
print(f"\n7️⃣  Getting projected earnings...")
projection = requests.get(f"{BASE_URL}/drivers/DRV001/projection").json()
final_projected = projection['timeline'][-1]['projected']
print(f"   Final projection: ₹{final_projected:.0f}")

# 4. Open dashboard
print(f"\n8️⃣  Opening dashboard...")
dashboard_url = f"{BASE_URL}/drivers/DRV001/dashboard"
print(f"   → Open in browser: {dashboard_url}")

# 5. Export data
print(f"\n9️⃣  Exporting data...")
# CSV files available at /export/drivers.csv and /export/trips.csv
```

**Run it:**
```bash
python example_integration.py
```

---

## Integration Examples

### With Mobile App

**Example: React Native / Flutter**

```javascript
// React example
const recordTrip = async (driverId, tripData) => {
  const response = await fetch(`http://api.example.com/drivers/${driverId}/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripData)
  });
  
  const metrics = await response.json();
  
  // Update UI
  setEarnings(metrics.current_earnings);
  setPaceScore(metrics.pace_score);
  setDriverMessage(metrics.driver_message);
  
  // Show dashboard
  navigateToChart(metrics.driver_id);
};
```

### With Dashboard / Analytics

**Embed Chart.js visualization:**

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<canvas id="earningsChart"></canvas>

<script>
  fetch('/drivers/DRV001/chart.json')
    .then(r => r.json())
    .then(chartData => {
      new Chart(document.getElementById('earningsChart'), chartData);
    });
</script>
```

### With Ride-Hailing Platform

**Webhook to record earnings:**

```python
# When ride-hailing platform completes a trip
@app.post("/webhook/trip_complete")
async def on_trip_complete(data):
    # Forward to Driver Pulse API
    response = requests.post(
        f"http://driver-pulse-api/drivers/{data['driver_id']}/trips",
        json={
            "trip_id": data["trip_id"],
            "trip_earnings": data["fare"] * data["surge_multiplier"],
            "fare": data["fare"],
            "surge_multiplier": data["surge_multiplier"],
            "timestamp": data["completed_at"]
        }
    )
    return response.json()
```

---

## API Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/drivers` | Initialize driver |
| GET | `/drivers` | List all drivers |
| GET | `/drivers/{id}` | Get driver metrics |
| POST | `/drivers/{id}/trips` | **Record trip earnings** ⭐ |
| GET | `/drivers/{id}/trips` | Get trip history |
| GET | `/drivers/{id}/projection` | Get projected earnings timeline |
| GET | `/drivers/{id}/chart.json` | Get Chart.js format data |
| GET | `/drivers/{id}/dashboard` | View HTML dashboard |
| GET | `/export/drivers.csv` | Export all driver metrics |
| GET | `/export/trips.csv` | Export trip log |
| GET | `/health` | Health check |

---

## Key Features

### ✅ Real-Time Earnings Updates

- Trip earnings added immediately
- Velocity recalculated after each trip
- Pace score updated in real-time
- No batch processing delay

### ✅ Projected Earnings Graph

The graph uses the same mathematical formulas:
- **Timeline**: From current time to shift end
- **Current Velocity**: ₹/hour from all completed trips
- **Projection**: `projected = current_earnings + (velocity × remaining_hours)`
- **Target**: Horizontal line showing goal

### ✅ Driver Messages

Updated after each trip with:
- Current status (emoji + band)
- Earnings summary (earned vs goal)
- Velocity fact (current vs required)
- Projection fact (where you'll land)
- Pressure advice (if behind)

### ✅ No External Dependencies

- All computation local (offline-first)
- No cloud storage needed
- Works with stable internet only for webhooks

---

## Configuration

Edit `config/settings.py` to adjust:

```python
# Pace score bands
PACE_AHEAD       = 80    # When to show ✅
PACE_ON_TRACK    = 65    # When to show 🟢
PACE_SLIGHTLY    = 45    # When to show 🟡
PACE_AT_RISK     = 30    # When to show 🟠
# <30 is off_track 🔴

# Signal weights (must sum to 1.0)
WEIGHT_S1_PACE        = 0.25  # Earned % vs elapsed %
WEIGHT_S2_VELOCITY    = 0.25  # Current ₹/hr vs required
WEIGHT_S3_PROJECTION  = 0.30  # Will you hit goal?
WEIGHT_S4_PRESSURE    = 0.20  # How hard must you work?
```

---

## Troubleshooting

### API not starting?
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000
# Kill process if needed
taskkill /PID <PID> /F
```

### Trip recorded but metrics not updating?
- Ensure `current_hours >= 0.5` (minimum elapsed time)
- Check driver was initialized with `POST /drivers` first

### Chart not showing?
- Browser needs internet for Chart.js library
- Check `/drivers/{id}/projection` returns data
- Verify driver has at least one trip recorded

---

## Next Steps

1. **Connect to mobile app**: Use mobile app to call `/drivers/{id}/trips` when trip completes
2. **Create dashboard**: Build frontend using `/drivers/{id}/chart.json`
3. **Set up webhooks**: Integrate with ride-hailing platform
4. **Monitor drivers**: Use `/drivers` endpoint for fleet overview

---

For support, check FastAPI docs at: http://127.0.0.1:8000/docs
