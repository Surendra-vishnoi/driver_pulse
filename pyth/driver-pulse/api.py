# api.py
# ─────────────────────────────────────────────────────────────────────────────
# DRIVER PULSE — FastAPI SERVER
# RESTful API for real-time trip earnings tracking and visualization
# ─────────────────────────────────────────────────────────────────────────────

import sys, os
from pathlib import Path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
import uvicorn

from pipeline.trip_earnings import TripEarningsTracker
from pipeline.earnings_visualization import EarningsVisualization

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s")
logger = logging.getLogger(__name__)
BASE_DIR = Path(__file__).resolve().parent

# ── Request/Response Models ───────────────────────────────────

class TripData(BaseModel):
    """Trip earnings record"""
    trip_id: str
    trip_earnings: float
    trip_duration_min: Optional[float] = 0
    fare: Optional[float] = 0
    surge_multiplier: Optional[float] = 1.0
    timestamp: Optional[str] = None
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "trip_id": "TRIP_20250308_001",
                "trip_earnings": 250,
                "trip_duration_min": 25,
                "fare": 200,
                "surge_multiplier": 1.25,
                "timestamp": "2025-03-08T10:30:00"
            }
        }
    )


class DriverInitData(BaseModel):
    """Initialize a driver with baseline info"""
    driver_id: str
    name: str
    target_earnings: float
    shift_duration_hours: float
    current_earnings: Optional[float] = 0
    current_hours: Optional[float] = 0
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "driver_id": "DRV001",
                "name": "Alex Kumar",
                "target_earnings": 1400,
                "shift_duration_hours": 8,
                "current_earnings": 0,
                "current_hours": 0
            }
        }
    )


class DriverMetrics(BaseModel):
    """Driver metrics response"""
    driver_id: str
    name: str
    current_earnings: float
    target_earnings: float
    current_hours: float
    shift_duration_hours: float
    remaining_hours: float
    earnings_gap: float
    pace_score: Optional[float]
    pace_band: str
    projected_earnings: float
    driver_message: str
    trips_count: int


class DriverLoginData(BaseModel):
    """Simple driver login with just driver ID"""
    driver_id: str
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "driver_id": "DRV001"
            }
        }
    )


class TargetEarningsUpdate(BaseModel):
    """Update target earnings for a driver"""
    target_earnings: float
    shift_duration_hours: Optional[float] = None  # Optional: update shift duration too
    
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "target_earnings": 1500,
                "shift_duration_hours": 10
            }
        }
    )


class DriverDashboardData(BaseModel):
    """Complete dashboard data for driver interface"""
    driver_id: str
    name: str
    # Current status
    current_earnings: float
    target_earnings: float
    current_hours: float
    shift_duration_hours: float
    remaining_hours: float
    earnings_gap: float
    pace_score: Optional[float]
    pace_band: str
    projected_earnings: float
    driver_message: str
    trips_count: int
    # Chart data
    chart_data: str  # Chart.js JSON format
    # Additional dashboard info
    current_velocity: Optional[float]
    target_velocity: Optional[float]
    last_trip_time: Optional[str]
    shift_start_time: Optional[str]


# ── Initialize FastAPI app ───────────────────────────────────

app = FastAPI(
    title="Driver Pulse API",
    description="Real-time trip earnings tracking and pace scoring",
    version="1.0.0",
)

# Add CORS middleware for web integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize tracker
tracker = TripEarningsTracker()


def _seed_driver_drv188() -> None:
    """Seed DRV188 with gradual trip progression for demo/live-fetch UX."""
    driver_id = "DRV188"

    if driver_id in tracker.driver_earnings and tracker.driver_earnings[driver_id].get("trips_count", 0) > 0:
        return

    now = datetime.now()
    # Cumulative progression is 70 -> 150 -> 240 -> 330 (requested UX shape).
    trip_templates = [
        {"trip_id": "DRV188_SEED_001", "trip_earnings": 70, "trip_duration_min": 16, "fare": 70, "surge_multiplier": 1.0, "minutes_ago": 210},
        {"trip_id": "DRV188_SEED_002", "trip_earnings": 80, "trip_duration_min": 18, "fare": 78, "surge_multiplier": 1.0, "minutes_ago": 165},
        {"trip_id": "DRV188_SEED_003", "trip_earnings": 90, "trip_duration_min": 20, "fare": 86, "surge_multiplier": 1.05, "minutes_ago": 118},
        {"trip_id": "DRV188_SEED_004", "trip_earnings": 90, "trip_duration_min": 21, "fare": 84, "surge_multiplier": 1.08, "minutes_ago": 72},
        {"trip_id": "DRV188_SEED_005", "trip_earnings": 120, "trip_duration_min": 24, "fare": 112, "surge_multiplier": 1.1, "minutes_ago": 30},
    ]

    tracker.driver_earnings[driver_id] = {
        "current_earnings": 0,
        "target_earnings": 1500,
        "shift_duration_hours": 8,
        "current_hours": 0,
        "start_time": (now - timedelta(hours=4)).isoformat(),
        "name": "Driver DRV188",
        "trips_count": 0,
        "velocity_log": [],
        "trip_time_hours": 0.0,
    }

    for template in sorted(trip_templates, key=lambda row: row["minutes_ago"], reverse=True):
        trip_timestamp = (now - timedelta(minutes=template["minutes_ago"]))
        tracker.record_trip(
            driver_id,
            {
                "trip_id": template["trip_id"],
                "trip_earnings": template["trip_earnings"],
                "trip_duration_min": template["trip_duration_min"],
                "fare": template["fare"],
                "surge_multiplier": template["surge_multiplier"],
                "timestamp": trip_timestamp.isoformat(),
            },
        )

    logger.info("✅ Seeded DRV188 with simulated trip history")


_seed_driver_drv188()

logger.info("✅ FastAPI app initialized")


# ── Health & Status ──────────────────────────────────────────

@app.get("/", tags=["Status"])
async def root():
    """API root endpoint"""
    return {
        "service": "Driver Pulse API",
        "status": "online",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Status"])
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "trackers_initialized": len(tracker.driver_earnings),
    }


# ── Driver Management ────────────────────────────────────────

@app.post("/drivers", tags=["Drivers"])
async def init_driver(driver: DriverInitData):
    """
    Initialize a driver with baseline info.
    Call this once per driver at shift start.
    
    Returns: Driver metrics
    """
    try:
        driver_id = driver.driver_id
        tracker.driver_earnings[driver_id] = {
            "current_earnings": driver.current_earnings,
            "target_earnings": driver.target_earnings,
            "shift_duration_hours": driver.shift_duration_hours,
            "current_hours": driver.current_hours,
            "start_time": datetime.now().isoformat(),
            "name": driver.name,
            "trips_count": 0,
            "velocity_log": [],
        }
        metrics = tracker.get_driver_metrics(driver_id)
        logger.info(f"✅ Driver initialized: {driver_id} ({driver.name})")
        return metrics
    except Exception as e:
        logger.error(f"Error initializing driver: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/drivers/{driver_id}", tags=["Drivers"], response_model=dict)
async def get_driver(driver_id: str):
    """
    Get current metrics for a driver.
    Includes pace score, pace band, and driver message.
    """
    try:
        metrics = tracker.get_driver_metrics(driver_id)
        if "error" in metrics:
            raise HTTPException(status_code=404, detail=metrics["error"])
        return metrics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving driver {driver_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers", tags=["Drivers"])
async def list_drivers():
    """
    List all initialized drivers with their current metrics.
    """
    try:
        drivers = []
        for driver_id in tracker.driver_earnings.keys():
            drivers.append(tracker.get_driver_metrics(driver_id))
        return {
            "count": len(drivers),
            "drivers": drivers,
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"Error listing drivers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Driver Dashboard ──────────────────────────────────────────

@app.post("/drivers/login", tags=["Dashboard"])
async def driver_login(login: DriverLoginData):
    """
    Simple driver login with just driver ID.
    Creates driver if doesn't exist, or returns existing metrics.
    
    For hackathon: Drivers just enter their ID to sign in.
    """
    try:
        driver_id = login.driver_id
        
        # Check if driver exists
        if driver_id not in tracker.driver_earnings:
            # Create with default values for hackathon
            tracker.driver_earnings[driver_id] = {
                "current_earnings": 0,
                "target_earnings": 1400,  # Default target
                "shift_duration_hours": 8,  # Default shift
                "current_hours": 0,
                "start_time": datetime.now().isoformat(),
                "name": f"Driver {driver_id}",
                "trips_count": 0,
                "velocity_log": [],
            }
            logger.info(f"✅ New driver logged in: {driver_id}")
        else:
            logger.info(f"✅ Existing driver logged in: {driver_id}")
        
        # Return current metrics
        metrics = tracker.get_driver_metrics(driver_id)
        return {
            "login_success": True,
            "driver_id": driver_id,
            "message": f"Welcome back, {metrics['name']}!",
            "current_metrics": metrics,
        }
    except Exception as e:
        logger.error(f"Error during driver login: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/drivers/{driver_id}/target", tags=["Dashboard"])
async def update_target_earnings(driver_id: str, target: TargetEarningsUpdate):
    """
    Update target earnings for a driver.
    Driver can set their own target from the dashboard.
    
    Returns: Updated metrics with new target
    """
    try:
        if driver_id not in tracker.driver_earnings:
            raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found. Please login first.")
        
        driver = tracker.driver_earnings[driver_id]
        
        # Update target earnings
        old_target = driver["target_earnings"]
        driver["target_earnings"] = target.target_earnings
        
        # Update shift duration if provided
        if target.shift_duration_hours is not None:
            driver["shift_duration_hours"] = target.shift_duration_hours
        
        # Recalculate metrics with new target
        metrics = tracker.get_driver_metrics(driver_id)
        
        logger.info(f"✅ Target updated for {driver_id}: ₹{old_target} → ₹{target.target_earnings}")
        return {
            "update_success": True,
            "driver_id": driver_id,
            "old_target": old_target,
            "new_target": target.target_earnings,
            "updated_metrics": metrics,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating target for {driver_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers/{driver_id}/dashboard/data", tags=["Dashboard"], response_model=DriverDashboardData)
async def get_driver_dashboard_data(driver_id: str):
    """
    Get complete dashboard data for driver interface (JSON).
    
    Returns all data needed for the driver dashboard:
    - Current metrics (earnings, pace, etc.)
    - Chart data for projected earnings graph
    - Driver message
    - Additional dashboard info
    
    Use this endpoint when your frontend needs raw JSON to render its own UI.
    """
    try:
        if driver_id not in tracker.driver_earnings:
            raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found. Please login first.")
        
        # Get current metrics
        metrics = tracker.get_driver_metrics(driver_id)
        
        # Get chart data
        timeline = tracker.get_projected_earnings_timeline(driver_id, points=20)
        chart_data = EarningsVisualization.generate_json_chart(timeline, driver_id) if timeline else "{}"
        
        # Get additional dashboard info
        driver = tracker.driver_earnings[driver_id]
        last_trip_time = None
        if driver["trips_count"] > 0:
            # Get last trip timestamp from trips log
            driver_trips = [t for t in tracker.trips_log if t["driver_id"] == driver_id]
            if driver_trips:
                last_trip_time = driver_trips[-1].get("timestamp")
        
        # Build complete dashboard response
        dashboard_data = {
            "driver_id": driver_id,
            "name": metrics["name"],
            "current_earnings": metrics["current_earnings"],
            "target_earnings": metrics["target_earnings"],
            "current_hours": metrics["current_hours"],
            "shift_duration_hours": metrics["shift_duration_hours"],
            "remaining_hours": metrics["remaining_hours"],
            "earnings_gap": metrics["earnings_gap"],
            "pace_score": metrics["pace_score"],
            "pace_band": metrics["pace_band"],
            "projected_earnings": metrics["projected_earnings"],
            "driver_message": metrics["driver_message"],
            "trips_count": metrics["trips_count"],
            "chart_data": chart_data,
            "current_velocity": metrics.get("current_velocity"),
            "target_velocity": metrics.get("target_velocity"),
            "last_trip_time": last_trip_time,
            "shift_start_time": driver["start_time"],
        }
        
        return dashboard_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting dashboard for {driver_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Trip Recording ───────────────────────────────────────────

@app.post("/drivers/{driver_id}/trips", tags=["Trips"])
async def record_trip(driver_id: str, trip: TripData):
    """
    Record a new trip for a driver.
    Updates current_earnings and pace_score immediately.
    
    Returns: Updated driver metrics
    """
    try:
        trip_dict = trip.dict()
        if not trip_dict.get("timestamp"):
            trip_dict["timestamp"] = datetime.now().isoformat()
        
        metrics = tracker.record_trip(driver_id, trip_dict)
        
        if "error" in metrics:
            raise HTTPException(status_code=404, detail=metrics["error"])
        
        logger.info(f"✅ Trip recorded for {driver_id}: ₹{trip.trip_earnings}")
        return metrics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording trip: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/drivers/{driver_id}/trips", tags=["Trips"])
async def get_driver_trips(driver_id: str):
    """
    Get all trips recorded for a driver.
    """
    try:
        driver_trips = [t for t in tracker.trips_log if t["driver_id"] == driver_id]
        if not driver_trips and driver_id not in tracker.driver_earnings:
            raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found")
        
        return {
            "driver_id": driver_id,
            "trip_count": len(driver_trips),
            "total_earnings": sum(t["trip_earnings"] for t in driver_trips),
            "trips": driver_trips,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving trips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Projections & Visualization ──────────────────────────────

@app.get("/drivers/{driver_id}/projection", tags=["Analytics"])
async def get_projection(driver_id: str, points: int = 20):
    """
    Get projected earnings timeline for a driver.
    Returns list of {hour, projected, target} for visualization.
    
    Args:
        driver_id: driver identifier
        points: number of data points (default 20)
    
    Returns: Timeline data for charting
    """
    try:
        timeline = tracker.get_projected_earnings_timeline(driver_id, points=points)
        if not timeline:
            raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found")
        
        return {
            "driver_id": driver_id,
            "timeline": timeline,
            "points": len(timeline),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting projection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers/{driver_id}/chart.json", tags=["Analytics"])
async def get_chart_json(driver_id: str, points: int = 20):
    """
    Get chart data as JSON (Chart.js format).
    Use for web dashboard integration.
    """
    try:
        timeline = tracker.get_projected_earnings_timeline(driver_id, points=points)
        if not timeline:
            raise HTTPException(status_code=404, detail=f"Driver {driver_id} not found")
        
        chart_data = EarningsVisualization.generate_json_chart(timeline, driver_id)
        # chart_data is already a JSON string, parse it back to dict for JSONResponse
        import json
        return JSONResponse(content=json.loads(chart_data))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chart: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating chart: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/drivers/{driver_id}/dashboard", tags=["Analytics"], response_class=HTMLResponse)
@app.get("/drivers/{driver_id}/dashboard/html", tags=["Analytics"], response_class=HTMLResponse)
async def get_dashboard_html(driver_id: str, points: int = 20):
    """
    Get HTML dashboard with metrics, message, and earnings chart.
    Open in browser to visualize.
    """
    raise HTTPException(
        status_code=404,
        detail="HTML dashboard is disabled in service mode. Use /drivers/{driver_id}/dashboard/data or /drivers/{driver_id}/chart.json",
    )


# ── Export ────────────────────────────────────────────────────

@app.get("/export/drivers.csv", tags=["Export"])
async def export_drivers_csv():
    """
    Export all driver metrics as CSV.
    """
    try:
        output_file = BASE_DIR / "data" / "processed" / "driver_metrics_live.csv"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_path = tracker.export_driver_metrics_csv(str(output_file))
        return FileResponse(output_path, media_type="text/csv", filename="driver_metrics.csv")
    except Exception as e:
        logger.error(f"Error exporting drivers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/export/trips.csv", tags=["Export"])
async def export_trips_csv():
    """
    Export all recorded trips as CSV.
    """
    try:
        output_file = BASE_DIR / "data" / "processed" / "trips_log.csv"
        output_file.parent.mkdir(parents=True, exist_ok=True)
        output_path = tracker.export_trips_log_csv(str(output_file))
        if not output_path:
            raise HTTPException(status_code=400, detail="No trips recorded yet")
        return FileResponse(output_path, media_type="text/csv", filename="trips.csv")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting trips: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Run Server ────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Driver Pulse API Server")
    parser.add_argument("--host", default="127.0.0.1", help="Server host (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Server port (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code changes")
    
    args = parser.parse_args()
    
    logger.info(f"🚀 Starting Driver Pulse API on {args.host}:{args.port}")
    logger.info(f"📚 API Docs: http://{args.host}:{args.port}/docs")
    logger.info(f"📊 Health Check: http://{args.host}:{args.port}/health")
    
    uvicorn.run(
        "api:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )
