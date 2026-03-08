# Quick Start Guide — Driver Pulse API

## 🚀 Start the API Server

### Step 1: Install Dependencies

If you haven't already, install the new requirements:

```bash
pip install -r requirements.txt
```

### Step 2: Start the API Server

Option A — Simple (default):
```bash
python api.py
```

Option B — With custom settings:
```bash
python api.py --host 127.0.0.1 --port 8000 --reload
```

Option C — Using PowerShell:
```powershell
& venv\Scripts\Activate.ps1
python api.py
```

**Expected Output:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     API Docs: http://127.0.0.1:8000/docs
```

---

## 📚 Access API Documentation

Open in your browser:
- **Interactive Docs (Swagger)**: http://127.0.0.1:8000/docs
- **Alternative Docs (ReDoc)**: http://127.0.0.1:8000/redoc

You can test all endpoints directly from the browser docs!

---

## 🧪 Run Example Integration

Open a NEW terminal (keep API server running):

```bash
# Activate venv if needed
& venv\Scripts\Activate.ps1

# Run example
python examples/example_integration.py
```

This will:
1. ✅ Initialize a driver
2. ✅ Record 5 trips throughout the day
3. ✅ Get projected earnings timeline
4. ✅ Retrieve trip history
5. ✅ Open interactive dashboard
6. ✅ Export metrics to CSV

---

## 🎯 Key Endpoints

### Initialize Driver
```bash
curl -X POST "http://127.0.0.1:8000/drivers" \
  -H "Content-Type: application/json" \
  -d '{"driver_id":"DRV001","name":"Alex","target_earnings":1400,"shift_duration_hours":8}'
```

### Record Trip (Updates Earnings & Pace)
```bash
curl -X POST "http://127.0.0.1:8000/drivers/DRV001/trips" \
  -H "Content-Type: application/json" \
  -d '{"trip_id":"T1","trip_earnings":300,"trip_duration_min":25}'
```

### Get Projected Earnings
```bash
curl "http://127.0.0.1:8000/drivers/DRV001/projection?points=20"
```

### View Dashboard (Open in Browser)
```
http://127.0.0.1:8000/drivers/DRV001/dashboard
```

---

## 📊 What's New (in this update)

### 1. **Real-Time Trip Earnings** (`pipeline/trip_earnings.py`)
- Track earnings after each trip
- Velocity calculated from completed trips
- Pace score updates instantly

### 2. **Projected Earnings Graph** (`pipeline/earnings_visualization.py`)
- Interactive HTML dashboard with Chart.js
- Shows projected earnings timeline
- Target goal line for reference
- Surplus/Gap zones highlighted

### 3. **FastAPI REST API** (`api.py`)
- 12+ endpoints for integration
- JSON request/response format
- OpenAPI/Swagger documentation
- CORS enabled for web integration

### 4. **Integration Examples** (`examples/example_integration.py`)
- Python script demonstrating all workflows
- Shows how to integrate with mobile apps
- Webhook patterns for ride-hailing platforms

---

## 📁 New Files

```
driver_pulse/
├── api.py                          ← FastAPI server (start here!)
├── pipeline/
│   ├── trip_earnings.py            ← Tracks earnings & metrics
│   └── earnings_visualization.py    ← Charts & dashboards
├── examples/
│   └── example_integration.py       ← Integration example
├── FASTAPI_GUIDE.md                ← Detailed API guide
└── STARTUP.md                       ← This file
```

---

## 🔧 How It Works

```
Recording a Trip (POST /drivers/{id}/trips)
    ↓
Earnings updated: current_earnings += trip_earnings
    ↓
Elapsed hours calculated from trip timestamp
    ↓
Velocity recalculated: current_earnings / elapsed_hours
    ↓
Pace score recomputed using 4-signal model:
  • S1: Pace Ratio (earned % vs elapsed %)
  • S2: Velocity Ratio (current ₹/hr vs target)
  • S3: Projection Ratio (will you hit goal?)
  • S4: Pressure Ratio (pressure to earn more?)
    ↓
Projected earnings calculated:
  projected = current_earnings + (velocity × remaining_hours)
    ↓
Driver message regenerated with all insights
    ↓
Updated metrics returned instantly
```

---

## 💡 Integration Patterns

### Pattern 1: Mobile App Integration

```python
# When driver completes a trip (in your mobile app)
def on_trip_complete(trip_data):
    response = requests.post(
        f"http://api.example.com/drivers/{driver_id}/trips",
        json={
            "trip_id": trip_data["trip_id"],
            "trip_earnings": trip_data["fare"] * trip_data["surge"],
            "fare": trip_data["fare"],
            "surge_multiplier": trip_data["surge"],
            "timestamp": trip_data["completed_at"]
        }
    )
    
    metrics = response.json()
    
    # Update UI
    show_earnings(metrics["current_earnings"])
    show_pace_score(metrics["pace_score"])
    show_message(metrics["driver_message"])
    show_chart(metrics["driver_id"])
```

### Pattern 2: Platform Webhook

```python
# In ride-hailing platform backend
@app.post("/webhooks/trip_complete")
async def on_trip_complete(webhook_data):
    # Forward to Driver Pulse API
    requests.post(
        "http://driver-pulse-api/drivers/{driver_id}/trips",
        json=webhook_data
    )
```

### Pattern 3: Dashboard Embed

```html
<!-- In your admin dashboard -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<canvas id="earningsChart"></canvas>

<script>
  fetch('http://api/drivers/DRV001/chart.json')
    .then(r => r.json())
    .then(data => new Chart(ctx, data));
</script>
```

---

## ✅ Checklist

- [ ] Python packages installed (`pip install -r requirements.txt`)
- [ ] API server running (`python api.py`)
- [ ] Can access Swagger docs (http://127.0.0.1:8000/docs)
- [ ] Example integration runs (`python examples/example_integration.py`)
- [ ] Dashboard opens in browser

---

## 🆘 Troubleshooting

**API won't start?**
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000
# Kill if needed: taskkill /PID <PID> /F
```

**Can't import pipeline modules?**
```bash
# Make sure you're in the project directory
cd c:\Users\lavan\OneDrive\Desktop\driver_pulse

# Check PYTHONPATH
echo $env:PYTHONPATH
```

**Example script fails?**
```bash
# Make sure API server is running in another terminal
python api.py --reload
```

---

## 📖 Full Documentation

See `FASTAPI_GUIDE.md` for complete API reference and integration examples.

---

**Ready? Start with:**
```bash
python api.py
```

Then open: http://127.0.0.1:8000/docs
