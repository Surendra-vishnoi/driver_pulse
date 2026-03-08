# pipeline/trip_earnings.py
# ─────────────────────────────────────────────────────────────────────────────
# TRIP EARNINGS TRACKER
# Tracks individual trips and updates driver earnings in real-time
# ─────────────────────────────────────────────────────────────────────────────

import sys, os
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s",
                    stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.settings import (
    WEIGHT_S1_PACE, WEIGHT_S2_VELOCITY, WEIGHT_S3_PROJECTION, WEIGHT_S4_PRESSURE,
    MIN_ELAPSED_HOURS, PROJECTION_CAP
)
from pipeline.step3_insights import compute_signals, compute_pace_score, classify_pace_band, build_driver_message


class TripEarningsTracker:
    """
    Track trip-level earnings and update driver earnings in real-time.
    Every trip adds to current_earnings and updates the pace score.
    """
    
    def __init__(self, drivers_csv: str = None):
        """
        Initialize tracker with existing driver data.
        
        Args:
            drivers_csv: path to drivers.csv with baseline info (target_earnings, shift_duration_hours, etc.)
        """
        self.drivers_csv = drivers_csv
        self.trips_log = []  # List of trips recorded
        self.driver_earnings = {}  # {driver_id: {"current_earnings": X, "trips_count": Y, ...}}
        
        if drivers_csv and os.path.exists(drivers_csv):
            self._load_driver_baseline(drivers_csv)
    
    def _load_driver_baseline(self, csv_path: str):
        """Load driver baseline data (target_earnings, shift_duration, etc.)"""
        try:
            df = pd.read_csv(csv_path)
            for _, row in df.iterrows():
                driver_id = str(row["driver_id"])
                self.driver_earnings[driver_id] = {
                    "current_earnings": float(row.get("current_earnings", 0)),
                    "target_earnings": float(row["target_earnings"]),
                    "shift_duration_hours": float(row["shift_duration_hours"]),
                    "current_hours": float(row.get("current_hours", 0)),
                    "start_time": row.get("start_time", datetime.now().isoformat()),
                    "name": row.get("name", f"Driver {driver_id}"),
                    "trips_count": 0,
                    "velocity_log": [],  # Track velocities for rolling average
                    "trip_time_hours": 0.0,
                }
        except Exception as e:
            logger.error(f"Failed to load driver baseline from {csv_path}: {e}")
    
    def record_trip(self, driver_id: str, trip_data: dict) -> dict:
        """
        Record a new trip for a driver and update earnings.
        
        Args:
            driver_id: driver identifier
            trip_data: {
                "trip_id": str,
                "trip_earnings": float,  # amount earned in this trip
                "trip_duration_min": float,
                "fare": float,
                "surge_multiplier": float (optional),
                "timestamp": ISO datetime (optional)
            }
        
        Returns:
            Updated driver metrics with new pace score
        """
        if driver_id not in self.driver_earnings:
            # Initialize if new driver
            self.driver_earnings[driver_id] = {
                "current_earnings": 0,
                "target_earnings": 1400,  # default
                "shift_duration_hours": 8,  # default
                "current_hours": 0,
                "start_time": datetime.now().isoformat(),
                "name": f"Driver {driver_id}",
                "trips_count": 0,
                "velocity_log": [],
                "trip_time_hours": 0.0,
            }
        
        # Add trip to log
        trip_record = {
            "driver_id": driver_id,
            "trip_id": trip_data.get("trip_id", f"trip_{len(self.trips_log)}"),
            "trip_earnings": float(trip_data["trip_earnings"]),
            "trip_duration_min": float(trip_data.get("trip_duration_min", 0)),
            "fare": float(trip_data.get("fare", 0)),
            "surge_multiplier": float(trip_data.get("surge_multiplier", 1.0)),
            "timestamp": trip_data.get("timestamp", datetime.now().isoformat()),
        }
        self.trips_log.append(trip_record)
        
        # Update driver earnings
        driver = self.driver_earnings[driver_id]
        driver["current_earnings"] += trip_record["trip_earnings"]
        driver["trips_count"] += 1
        
        # Update elapsed hours
        if driver["trips_count"] == 1:
            driver["start_time"] = trip_record["timestamp"]
        
        # Calculate elapsed time
        start = datetime.fromisoformat(driver["start_time"])
        elapsed_time = datetime.fromisoformat(trip_record["timestamp"]) - start
        wall_clock_hours = max(0.0, elapsed_time.total_seconds() / 3600)

        # Also accumulate trip durations so scoring does not get stuck at near-zero when
        # incoming timestamps are close together during testing/simulation.
        driver["trip_time_hours"] = float(driver.get("trip_time_hours", 0.0)) + (
            max(0.0, trip_record["trip_duration_min"]) / 60.0
        )
        driver["current_hours"] = max(wall_clock_hours, driver["trip_time_hours"])
        
        # Calculate velocity (earnings per hour) - rolling
        if driver["current_hours"] > 0:
            current_velocity = driver["current_earnings"] / driver["current_hours"]
            driver["velocity_log"].append(current_velocity)
        
        logger.info(f"Trip recorded: {driver_id} earned ₹{trip_record['trip_earnings']:.0f} "
                   f"(total: ₹{driver['current_earnings']:.0f})")
        
        return self._get_driver_metrics(driver_id)
    
    def _get_driver_metrics(self, driver_id: str) -> dict:
        """Compute and return current driver metrics with pace score."""
        driver = self.driver_earnings[driver_id]
        
        # Construct row for signal computation
        row = pd.Series({
            "driver_id": driver_id,
            "name": driver["name"],
            "current_earnings": driver["current_earnings"],
            "target_earnings": driver["target_earnings"],
            "current_hours": driver["current_hours"],
            "shift_duration_hours": driver["shift_duration_hours"],
            "remaining_hours": max(0, driver["shift_duration_hours"] - driver["current_hours"]),
            "earnings_gap": max(0, driver["target_earnings"] - driver["current_earnings"]),
            "current_velocity": driver["velocity_log"][-1] if driver["velocity_log"] else 0,
            "has_velocity_data": 1,
        })
        
        actual_velocity = float(row.get("current_velocity", 0) or 0.0)
        target_velocity = (
            driver["target_earnings"] / driver["shift_duration_hours"]
            if driver["shift_duration_hours"] > 0 else 0.0
        )

        # Skip scoring if too early in shift
        if driver["current_hours"] < MIN_ELAPSED_HOURS:
            return {
                "driver_id": driver_id,
                "name": driver["name"],
                "current_earnings": driver["current_earnings"],
                "target_earnings": driver["target_earnings"],
                "current_hours": driver["current_hours"],
                "shift_duration_hours": driver["shift_duration_hours"],
                "remaining_hours": row["remaining_hours"],
                "earnings_gap": row["earnings_gap"],  # Added missing earnings_gap
                "pace_score": None,
                "pace_band": "too_early",
                "projected_earnings": driver["current_earnings"],
                "driver_message": "Shift just started — not enough data to score yet.",
                "trips_count": driver["trips_count"],
                "current_velocity": round(actual_velocity, 2),
                "target_velocity": round(target_velocity, 2),
            }
        
        # Compute signals and score
        signals = compute_signals(row)
        score = compute_pace_score(signals)
        band = classify_pace_band(score, bool(row.get("has_velocity_data", 1)))
        message = build_driver_message(
            pd.Series({**row.to_dict(), "pace_band": band, "pace_score": score}),
            signals
        )
        
        return {
            "driver_id": driver_id,
            "name": driver["name"],
            "current_earnings": driver["current_earnings"],
            "target_earnings": driver["target_earnings"],
            "current_hours": driver["current_hours"],
            "shift_duration_hours": driver["shift_duration_hours"],
            "remaining_hours": row["remaining_hours"],
            "earnings_gap": row["earnings_gap"],
            "pace_score": round(score, 1),
            "pace_band": band,
            "projected_earnings": signals["projected_earnings"],
            "driver_message": message,
            "trips_count": driver["trips_count"],
            "current_velocity": round(actual_velocity, 2),
            "target_velocity": round(signals["estimated_tgt_vel"], 2),
            "s1_pace_ratio": round(signals["s1_pace_ratio"], 2),
            "s2_velocity_ratio": round(signals["s2_velocity_ratio"], 2),
            "s3_projection_ratio": round(signals["s3_projection_ratio"], 2),
            "s4_pressure_ratio": round(signals["s4_pressure_ratio"], 2),
        }
    
    def get_driver_metrics(self, driver_id: str) -> dict:
        """Get current metrics for a driver."""
        if driver_id not in self.driver_earnings:
            return {"error": f"Driver {driver_id} not found"}
        return self._get_driver_metrics(driver_id)
    
    def get_projected_earnings_timeline(self, driver_id: str, points: int = 20) -> list:
        """
        Get projected earnings timeline for visualization.
        Returns points from now to end of shift.
        
        Args:
            driver_id: driver identifier
            points: number of data points for the projection
        
        Returns:
            List of {"hour": X, "projected": Y, "target": Z} dicts
        """
        driver = self.driver_earnings.get(driver_id)
        if not driver:
            return []
        
        metrics = self._get_driver_metrics(driver_id)
        current_time = max(0.0, float(driver["current_hours"]))
        shift_end = max(0.0, float(driver["shift_duration_hours"]))
        target = driver["target_earnings"]
        current_earnings = max(0.0, float(driver["current_earnings"]))

        # Prefer measured velocity; fall back to target velocity if needed.
        measured_velocity = driver["velocity_log"][-1] if driver.get("velocity_log") else 0.0
        fallback_velocity = metrics.get("target_velocity", 0.0)
        current_velocity = measured_velocity if measured_velocity > 0 else fallback_velocity
        current_velocity = max(0.0, float(current_velocity or 0.0))

        # Early in the shift, one trip can create extreme velocity spikes.
        # Blend measured velocity toward target velocity until confidence builds.
        trips_count = int(driver.get("trips_count", 0) or 0)
        hour_conf = min(1.0, current_time / max(MIN_ELAPSED_HOURS, 1e-6))
        trip_conf = min(1.0, trips_count / 4.0)
        confidence = hour_conf * trip_conf
        projection_velocity = fallback_velocity + (current_velocity - fallback_velocity) * confidence
        projection_velocity = max(0.0, float(projection_velocity))
        
        # Generate timeline
        timeline = []
        # If shift is over, project a flat line at current earnings.
        remaining_time = max(0.0, shift_end - current_time)
        
        for i in range(points + 1):
            hour = current_time + (remaining_time * i / points)
            
            # Projected earnings at this hour
            time_to_hour = max(0.0, hour - current_time)
            projected = current_earnings + (projection_velocity * time_to_hour)
            projected = max(current_earnings, projected)
            
            timeline.append({
                "hour": round(hour, 2),
                "projected": round(projected, 2),
                "target": target,
                "current": current_earnings if i == 0 else None,
            })
        
        return timeline
    
    def export_driver_metrics_csv(self, output_path: str):
        """Export all current driver metrics to CSV."""
        rows = []
        for driver_id in self.driver_earnings.keys():
            rows.append(self._get_driver_metrics(driver_id))
        
        df = pd.DataFrame(rows)
        df.to_csv(output_path, index=False)
        logger.info(f"Exported {len(df)} driver metrics to {output_path}")
        return output_path
    
    def export_trips_log_csv(self, output_path: str):
        """Export all recorded trips to CSV."""
        if not self.trips_log:
            logger.warning("No trips recorded yet")
            return None
        
        df = pd.DataFrame(self.trips_log)
        df.to_csv(output_path, index=False)
        logger.info(f"Exported {len(df)} trips to {output_path}")
        return output_path
