# DRIVER PULSE API — QUICK REFERENCE CARD

## 🚀 Start Server
```bash
python api.py
```
Access: http://127.0.0.1:8000/docs

---

## 📌 Core Workflow

```
1. Initialize Driver (at shift start)
   POST /drivers
   ↓
2. Record Trip (when trip completes)
   POST /drivers/{id}/trips  ⭐
   ↓
3. Get Metrics (real-time update)
   GET /drivers/{id}
   ↓
4. View Dashboard
   GET /drivers/{id}/dashboard
```

---

## 🎯 Key Endpoints

### Initialize
```bash
curl -X POST http://127.0.0.1:8000/drivers \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "DRV001",
    "name": "Alex Kumar",
    "target_earnings": 1400,
    "shift_duration_hours": 8
  }'
```

### Record Trip ⭐ (Updates earnings & pace)
```bash
curl -X POST http://127.0.0.1:8000/drivers/DRV001/trips \
  -H "Content-Type: application/json" \
  -d '{
    "trip_id": "TRIP_001",
    "trip_earnings": 320,
    "trip_duration_min": 25,
    "fare": 260,
    "surge_multiplier": 1.23
  }'
```

### Get Metrics
```bash
curl http://127.0.0.1:8000/drivers/DRV001
```

### Get Projection
```bash
curl http://127.0.0.1:8000/drivers/DRV001/projection?points=20
```

### Get Dashboard (Browser)
```
http://127.0.0.1:8000/drivers/DRV001/dashboard
```

---

## 📊 Response Format

```json
{
  "driver_id": "DRV001",
  "name": "Alex Kumar",
  "current_earnings": 950,
  "target_earnings": 1400,
  "current_hours": 2.5,
  "shift_duration_hours": 8,
  "remaining_hours": 5.5,
  "earnings_gap": 450,
  "pace_score": 62.3,
  "pace_band": "on_track",
  "projected_earnings": 1220,
  "driver_message": "🟢 You're on track, Alex Kumar. You've earned ₹950...",
  "trips_count": 3,
  "current_velocity": 380,
  "target_velocity": 175
}
```

---

## 🎨 Dashboard Features

- ✅ Projected earnings chart (interactive)
- ✅ Current metrics (earnings, time, pace)
- ✅ Driver message (actionable)
- ✅ Status emoji (visual feedback)
- ✅ Pace bands (ahead/on_track/at_risk/off_track)

---

## 🔄 Real-Time Updates

Every trip updates:
- ✅ Earnings added
- ✅ Velocity recalculated
- ✅ Pace score recomputed
- ✅ Projected earnings updated
- ✅ Driver message regenerated

All within **<10ms**.

---

## 📈 Pace Score Bands

| Score | Band | Emoji | Meaning |
|-------|------|-------|---------|
| 80-100 | ahead | ✅ | Earning faster than required |
| 65-79 | on_track | 🟢 | Exactly on pace |
| 45-64 | slightly_behind | 🟡 | Minor gap forming |
| 30-44 | at_risk | 🟠 | Meaningful gap, action needed |
| <30 | off_track | 🔴 | Significant shortfall |

**Score = 50 means exactly on pace**

---

## 🧪 Test It

### Quick Manual Test
```bash
python tests/test_api_integration.py manual
```

### Full Test Suite
```bash
pytest tests/test_api_integration.py -v
```

### Integration Example
```bash
python examples/example_integration.py
```

---

## 📁 New Files

```
api.py                          ← FastAPI server
pipeline/trip_earnings.py       ← Earnings tracker
pipeline/earnings_visualization.py ← Charts
examples/example_integration.py ← Examples
tests/test_api_integration.py   ← Tests
FASTAPI_GUIDE.md               ← Full guide
README_API.md                  ← Feature overview
STARTUP.md                     ← Quick start
```

---

## 💡 Integration Examples

### Mobile App
```python
metrics = requests.post(
    f"http://api/drivers/{id}/trips",
    json=trip_data
).json()

show_status(metrics['pace_band'])
show_earnings(metrics['current_earnings'])
show_message(metrics['driver_message'])
```

### Dashboard
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<canvas id="chart"></canvas>
<script>
  fetch('/drivers/DRV001/chart.json')
    .then(r => r.json())
    .then(data => new Chart(ctx, data));
</script>
```

### Webhook
```python
# When trip completes in platform
requests.post(
    "http://driver-pulse-api/drivers/{id}/trips",
    json=trip_data
)
```

---

## ⚙️ Configuration

Edit `config/settings.py`:

```python
# Pace bands
PACE_AHEAD = 80
PACE_ON_TRACK = 65
PACE_SLIGHTLY = 45
PACE_AT_RISK = 30

# Signal weights
WEIGHT_S1_PACE = 0.25
WEIGHT_S2_VELOCITY = 0.25
WEIGHT_S3_PROJECTION = 0.30
WEIGHT_S4_PRESSURE = 0.20
```

---

## 🔗 Pace Scoring Math

```
S1 = Pace Ratio
    = (earned % of goal) / (time % of shift)

S2 = Velocity Ratio
    = (current ₹/hour) / (required ₹/hour)

S3 = Projection Ratio
    = (projected_earnings) / (target_earnings)

S4 = Pressure Ratio
    = (gap to close) / (remaining capacity)

PACE_SCORE = (S1 + S2 + S3 + (2-S4)) / 4 × 100
```

Score = 50 → on pace
Score > 50 → ahead
Score < 50 → behind

---

## 🚨 Troubleshooting

**Server won't start?**
```bash
# Check port
netstat -ano | findstr :8000
# Kill if needed
taskkill /PID <PID> /F
```

**Import errors?**
```bash
# Make sure in project directory
cd c:\Users\lavan\OneDrive\Desktop\driver_pulse
# Check venv
& venv\Scripts\Activate.ps1
```

**API not responding?**
```bash
# Check health
curl http://127.0.0.1:8000/health
```

---

## 📚 Full Documentation

- **FASTAPI_GUIDE.md** — Complete API reference
- **STARTUP.md** — Getting started
- **README_API.md** — Feature overview
- **example_integration.py** — Working examples

---

## ✅ Checklist

- [ ] `pip install -r requirements.txt`
- [ ] `python api.py` (server running)
- [ ] Open http://127.0.0.1:8000/docs
- [ ] Initialize driver via POST /drivers
- [ ] Record trip via POST /drivers/{id}/trips
- [ ] View metrics via GET /drivers/{id}
- [ ] Open dashboard in browser

---

**Start here:**
```bash
python api.py
```

Then:
```
http://127.0.0.1:8000/docs
```

🎉
