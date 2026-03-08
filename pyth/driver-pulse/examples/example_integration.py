# examples/example_integration.py
# ─────────────────────────────────────────────────────────────────────────────
# Example: Real-Time Trip Earnings Integration with Driver Pulse API
# ─────────────────────────────────────────────────────────────────────────────

import requests
import json
import time
from datetime import datetime, timedelta
import sys

# Configuration
BASE_URL = "http://127.0.0.1:8000"
DRIVER_ID = "DRV001"

def print_section(title):
    """Pretty print section headers"""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")

def print_metrics(metrics):
    """Pretty print driver metrics"""
    if "error" in metrics:
        print(f"❌ Error: {metrics['error']}")
        return
    
    status_emoji = {
        "ahead": "✅",
        "on_track": "🟢",
        "slightly_behind": "🟡",
        "at_risk": "🟠",
        "off_track": "🔴",
        "too_early": "⏳",
    }
    
    band = metrics.get("pace_band", "unknown").replace("_estimated", "")
    emoji = status_emoji.get(band, "❓")
    
    print(f"{emoji} {metrics['name']} ({metrics['driver_id']})")
    print(f"   Earnings:  ₹{metrics['current_earnings']:.0f} / ₹{metrics['target_earnings']:.0f}")
    print(f"   Time:      {metrics['current_hours']:.1f} / {metrics['shift_duration_hours']:.1f} hours")
    print(f"   Pace:      {band.replace('_', ' ').title()} (Score: {metrics['pace_score']}/100)")
    print(f"   Projected: ₹{metrics['projected_earnings']:.0f}")
    print(f"   Message:   {metrics['driver_message']}\n")

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 1: Initialize Driver at Shift Start
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 1: Initialize Driver at Shift Start")

driver_init = {
    "driver_id": DRIVER_ID,
    "name": "Rajesh Singh",
    "target_earnings": 1500,
    "shift_duration_hours": 10,
    "current_earnings": 0,
    "current_hours": 0
}

print(f"POST /drivers")
print(f"Payload: {json.dumps(driver_init, indent=2)}\n")

response = requests.post(f"{BASE_URL}/drivers", json=driver_init)
if response.status_code == 200:
    metrics = response.json()
    print("✅ Driver initialized!\n")
    print_metrics(metrics)
else:
    print(f"❌ Error: {response.status_code}")
    print(response.text)
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 2: Record Trips Throughout The Day
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 2: Record Trips & See Real-Time Updates")

trips = [
    {
        "trip_id": "TRIP_20250308_001",
        "trip_earnings": 320,
        "trip_duration_min": 24,
        "fare": 260,
        "surge_multiplier": 1.23,
    },
    {
        "trip_id": "TRIP_20250308_002",
        "trip_earnings": 290,
        "trip_duration_min": 20,
        "fare": 250,
        "surge_multiplier": 1.16,
    },
    {
        "trip_id": "TRIP_20250308_003",
        "trip_earnings": 450,
        "trip_duration_min": 38,
        "fare": 380,
        "surge_multiplier": 1.18,
    },
    {
        "trip_id": "TRIP_20250308_004",
        "trip_earnings": 210,
        "trip_duration_min": 15,
        "fare": 190,
        "surge_multiplier": 1.11,
    },
    {
        "trip_id": "TRIP_20250308_005",
        "trip_earnings": 380,
        "trip_duration_min": 32,
        "fare": 310,
        "surge_multiplier": 1.23,
    },
]

for i, trip in enumerate(trips, 1):
    print(f"--- Trip {i}: {trip['trip_id']} ---")
    print(f"POST /drivers/{DRIVER_ID}/trips")
    print(f"Earnings: ₹{trip['trip_earnings']}, Duration: {trip['trip_duration_min']}min")
    print()
    
    response = requests.post(
        f"{BASE_URL}/drivers/{DRIVER_ID}/trips",
        json=trip
    )
    
    if response.status_code == 200:
        metrics = response.json()
        print("✅ Trip recorded & metrics updated:\n")
        print_metrics(metrics)
    else:
        print(f"❌ Error: {response.status_code}")
        print(response.text)
        continue
    
    # Small delay between trips (optional)
    if i < len(trips):
        time.sleep(1)

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 3: Get Projected Earnings Timeline
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 3: Get Projected Earnings Timeline")

print(f"GET /drivers/{DRIVER_ID}/projection?points=10\n")

response = requests.get(
    f"{BASE_URL}/drivers/{DRIVER_ID}/projection",
    params={"points": 10}
)

if response.status_code == 200:
    data = response.json()
    print("✅ Projection timeline retrieved:\n")
    print("Hour  | Projected | Target | Status")
    print("------|-----------|--------|--------")
    for point in data['timeline'][::2]:  # Show every 2nd point
        gap = point['projected'] - point['target']
        status = "✅ Surplus" if gap >= 0 else "⚠️  Short"
        print(f"{point['hour']:5.1f} | ₹{point['projected']:7.0f} | ₹{point['target']:6.0f} | {status}")
    
    print("\n")
else:
    print(f"❌ Error: {response.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 4: View Interactive Dashboard
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 4: Open Interactive Dashboard")

dashboard_url = f"{BASE_URL}/drivers/{DRIVER_ID}/dashboard"
print(f"📊 Dashboard URL: {dashboard_url}\n")
print("Open this URL in your browser to see:")
print("  • Projected earnings chart")
print("  • Current metrics (earnings, pace, velocity)")
print("  • Driver message with actionable advice")
print("  • Visual pace status\n")

# Optionally open in browser (windows only)
try:
    import webbrowser
    webbrowser.open(dashboard_url)
    print("✅ Dashboard opened in browser!")
except:
    print("💡 Tip: Manually open the URL above in your browser")

time.sleep(2)

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 5: Get Chart Data for Custom Visualization
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 5: Get Chart Data (Chart.js Format)")

print(f"GET /drivers/{DRIVER_ID}/chart.json\n")

response = requests.get(f"{BASE_URL}/drivers/{DRIVER_ID}/chart.json")

if response.status_code == 200:
    chart_data = response.json()
    print("✅ Chart data retrieved (for your web dashboard):\n")
    print(f"Datasets: {len(chart_data['datasets'])}")
    for ds in chart_data['datasets']:
        print(f"  • {ds['label']}: {len(ds['data'])} points")
    print(f"\nSample data point:")
    print(f"  {json.dumps(chart_data['datasets'][0]['data'][0], indent=4)}\n")
else:
    print(f"❌ Error: {response.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 6: Get Trip History
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 6: Get Trip History")

print(f"GET /drivers/{DRIVER_ID}/trips\n")

response = requests.get(f"{BASE_URL}/drivers/{DRIVER_ID}/trips")

if response.status_code == 200:
    data = response.json()
    print(f"✅ Trip history retrieved:\n")
    print(f"Total trips: {data['trip_count']}")
    print(f"Total earnings from trips: ₹{data['total_earnings']:.0f}\n")
    
    print("Trip Details:")
    print("ID  | Earnings | Duration | Fare | Surge")
    print("----|----------|----------|------|-------")
    for trip in data['trips']:
        print(f"{trip['trip_id'][-3:]} | ₹{trip['trip_earnings']:7.0f} | {trip['trip_duration_min']:7.0f}m | ₹{trip['fare']:4.0f} | {trip['surge_multiplier']:.2f}x")
    
    print("\n")
else:
    print(f"❌ Error: {response.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 7: List All Drivers
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 7: Get All Drivers Summary")

print(f"GET /drivers\n")

response = requests.get(f"{BASE_URL}/drivers")

if response.status_code == 200:
    data = response.json()
    print(f"✅ Retrieved {data['count']} driver(s):\n")
    
    for driver in data['drivers']:
        status_emoji = {
            "ahead": "✅",
            "on_track": "🟢",
            "slightly_behind": "🟡",
            "at_risk": "🟠",
            "off_track": "🔴",
            "too_early": "⏳",
        }
        band = driver.get("pace_band", "unknown").replace("_estimated", "")
        emoji = status_emoji.get(band, "❓")
        
        print(f"{emoji} {driver['name']:20} {driver['driver_id']} | "
              f"₹{driver['current_earnings']:7.0f}/{driver['target_earnings']:7.0f} | "
              f"Score: {driver['pace_score']}/100")
    
    print("\n")
else:
    print(f"❌ Error: {response.status_code}")

# ─────────────────────────────────────────────────────────────────────────────
# SCENARIO 8: Export Data
# ─────────────────────────────────────────────────────────────────────────────

print_section("SCENARIO 8: Export Data to CSV")

print("GET /export/drivers.csv")
response1 = requests.get(f"{BASE_URL}/export/drivers.csv")
if response1.status_code == 200:
    with open("drivers_export.csv", "wb") as f:
        f.write(response1.content)
    print("✅ Drivers exported to drivers_export.csv\n")
else:
    print(f"⚠️  Could not export drivers: {response1.status_code}\n")

print("GET /export/trips.csv")
response2 = requests.get(f"{BASE_URL}/export/trips.csv")
if response2.status_code == 200:
    with open("trips_export.csv", "wb") as f:
        f.write(response2.content)
    print("✅ Trips exported to trips_export.csv\n")
else:
    print(f"⚠️  Could not export trips: {response2.status_code}\n")

# ─────────────────────────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────────────────────────

print_section("✅ Integration Example Complete!")

print("""
Key Takeaways:
  1. Initialize driver once at shift start (POST /drivers)
  2. Record each trip as it completes (POST /drivers/{id}/trips)
  3. Metrics update automatically — no manual calculation
  4. View projections anytime (GET /drivers/{id}/projection)
  5. Share dashboard with driver (GET /drivers/{id}/dashboard)

API Endpoints Summary:
  📝 Initialize:        POST /drivers
  📊 Record trip:       POST /drivers/{id}/trips ⭐
  👤 Get metrics:       GET /drivers/{id}
  📈 Get projection:    GET /drivers/{id}/projection
  📊 Get chart data:    GET /drivers/{id}/chart.json
  🌐 View dashboard:    GET /drivers/{id}/dashboard
  💾 Export CSV:        GET /export/drivers.csv, /export/trips.csv

API Docs:              http://127.0.0.1:8000/docs

Next: Integrate with your mobile app, dashboard, or ride-hailing platform!
""")
