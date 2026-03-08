# pipeline/step2_features.py
# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — FEATURE EXTRACTION
#
# Responsibilities:
#   1. Per-driver velocity snapshot (latest log entry per driver)
#   2. Rolling velocity stats (mean, trend via linear regression, consistency)
#   3. Per-driver trip aggregation
#   4. Build master join — one row per driver with all signals
#
# SIGNAL DESIGN — what each feature actually means:
#   velocity_ratio    : current Rs/hr ÷ required Rs/hr (natural threshold = 1.0)
#   pace_ratio        : (earned/target) ÷ (elapsed/shift_duration) (natural = 1.0)
#   projection_ratio  : (earned + velocity*remaining) ÷ target (natural = 1.0)
#   pressure_ratio    : gap_remaining ÷ (remaining_hours × target_velocity) (natural = 1.0)
#
# All four signals have a natural threshold of 1.0 (ratios, not invented scales).
# ─────────────────────────────────────────────────────────────────────────────

import sys, os
import logging
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s",
                    stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.settings import VELOCITY_ROLLING_N, MIN_ELAPSED_HOURS, PROJECTION_CAP


# ── A. Velocity snapshot per driver ───────────────────────────

def extract_velocity_snapshot(velocity: pd.DataFrame) -> pd.DataFrame:
    """
    Take the most recent velocity log entry per driver.
    Most recent = highest cumulative_earnings (or latest timestamp if available).
    
    Why most recent? The latest entry has seen all previous trips — 
    it is the most informed reading of current pace.
    """
    logger.info("Extracting velocity snapshot (most recent per driver)")

    sort_col = "cumulative_earnings" if "cumulative_earnings" in velocity.columns else "elapsed_hours"
    if sort_col not in velocity.columns:
        # Fallback: just take last row per driver
        snap = velocity.groupby("driver_id").last().reset_index()
    else:
        snap = (
            velocity
            .sort_values(["driver_id", sort_col])
            .groupby("driver_id")
            .last()
            .reset_index()
        )

    cols_keep = ["driver_id", "current_velocity", "target_velocity",
                 "velocity_ratio", "velocity_delta", "forecast_status"]
    if "cumulative_earnings" in snap.columns:
        cols_keep.append("cumulative_earnings")
    if "elapsed_hours" in snap.columns:
        cols_keep.append("elapsed_hours")
    if "trips_completed" in snap.columns:
        cols_keep.append("trips_completed")

    snap = snap[[c for c in cols_keep if c in snap.columns]]
    logger.info(f"  Velocity snapshot: {len(snap)} drivers")
    return snap


# ── B. Rolling velocity features ─────────────────────────────

def extract_rolling_velocity(velocity: pd.DataFrame) -> pd.DataFrame:
    """
    For each driver compute rolling statistics over their last N log entries.
    
    rolling_velocity_mean:
      Average velocity over last N entries. Smooths single-entry noise.
      
    velocity_trend (linear regression slope):
      Fit a line through the N velocity readings. Positive = accelerating.
      Uses numpy polyfit(degree=1) — this is just finding the slope of a line,
      not a model. With N=3 points: slope = (v3 - v1) / (t3 - t1).
      We report it as Rs/hr per entry (not per hour — entries are irregular).
      
    velocity_consistency (coefficient of variation):
      std / mean of velocity readings. Low = steady pace. High = erratic.
      A driver with CV=0.1 is steady. CV=0.5 means swinging wildly.
    """
    logger.info(f"Extracting rolling velocity features (N={VELOCITY_ROLLING_N})")

    sort_col = "cumulative_earnings" if "cumulative_earnings" in velocity.columns else "elapsed_hours"
    v = velocity.sort_values(["driver_id", sort_col]).copy() if sort_col in velocity.columns \
        else velocity.sort_values("driver_id").copy()

    results = []
    for driver_id, grp in v.groupby("driver_id"):
        grp = grp.tail(VELOCITY_ROLLING_N)
        vals = grp["current_velocity"].values

        mean_vel  = float(np.mean(vals))
        consistency = float(np.std(vals) / mean_vel) if mean_vel > 0 else 0.0

        # Linear trend: slope of line through velocity readings
        # With only 1 entry: trend = 0 (neutral)
        if len(vals) >= 2:
            x = np.arange(len(vals), dtype=float)
            slope = np.polyfit(x, vals, 1)[0]
        else:
            slope = 0.0

        results.append({
            "driver_id":            driver_id,
            "rolling_velocity_mean": mean_vel,
            "velocity_trend":        slope,        # Rs/hr per step (positive = improving)
            "velocity_consistency":  consistency,  # CV (lower = steadier)
            "n_velocity_entries":    len(grp),
        })

    df = pd.DataFrame(results)
    logger.info(f"  Rolling velocity: {len(df)} drivers, max N={VELOCITY_ROLLING_N}")
    return df


# ── C. Trip aggregation per driver ────────────────────────────

def extract_trip_aggregates(trips: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate trip-level data to driver level.
    
    Key design: we compute BOTH total averages and RECENT averages (last 3 trips).
    The comparison between recent and overall gives a direction signal.
    """
    logger.info("Extracting trip aggregates per driver")

    sort_col = "start_dt" if "start_dt" in trips.columns else None
    if sort_col and trips[sort_col].notna().any():
        trips_sorted = trips.sort_values(["driver_id", sort_col])
    else:
        trips_sorted = trips.copy()

    aggs = trips_sorted.groupby("driver_id").agg(
        total_trips       = ("fare",               "count"),
        total_fare        = ("fare",               "sum"),
        avg_fare          = ("fare",               "mean"),
        avg_base_fare     = ("base_fare",           "mean"),  # surge-neutral
        avg_duration_min  = ("duration_min",        "mean"),
        avg_distance_km   = ("distance_km",         "mean"),
        avg_trip_ev       = ("trip_ev",             "mean"),  # per-trip velocity
        avg_efficiency    = ("efficiency_score",    "mean"),
        avg_stress_score  = ("stress_score",        "mean"),
        high_surge_trips  = ("high_surge_flag",     "sum"),
        long_trip_count   = ("long_trip_flag",      "sum"),
        low_fare_count    = ("low_fare_flag",       "sum"),
    ).reset_index()

    aggs["high_surge_ratio"]  = aggs["high_surge_trips"] / aggs["total_trips"]
    aggs["long_trip_ratio"]   = aggs["long_trip_count"]  / aggs["total_trips"]
    aggs["low_fare_ratio"]    = aggs["low_fare_count"]   / aggs["total_trips"]

    # Recent trips (last 3 per driver) — detect whether pace is changing
    recent = (
        trips_sorted.groupby("driver_id")
        .tail(3)
        .groupby("driver_id")
        .agg(
            recent_avg_fare      = ("fare",            "mean"),
            recent_avg_base_fare = ("base_fare",        "mean"),
            recent_avg_ev        = ("trip_ev",          "mean"),
            recent_avg_stress    = ("stress_score",     "mean"),
        )
        .reset_index()
    )

    df = aggs.merge(recent, on="driver_id", how="left")

    # Recent vs overall direction signal
    # > 1.0 → recent trips are better than average (positive momentum)
    # < 1.0 → recent trips are worse (slowing down)
    df["recent_fare_ratio"] = np.where(
        df["avg_fare"] > 0,
        df["recent_avg_fare"] / df["avg_fare"],
        1.0
    )
    df["recent_ev_ratio"] = np.where(
        df["avg_trip_ev"] > 0,
        df["recent_avg_ev"] / df["avg_trip_ev"],
        1.0
    )

    logger.info(f"  Trip aggregates: {len(df)} drivers")
    return df


# ── D. Master join ────────────────────────────────────────────

def build_master(goals, drivers, velocity_snap, rolling_vel, trip_agg) -> pd.DataFrame:
    """
    Join all tables on driver_id. One row per driver goal.
    Goals is the spine — every goal row appears exactly once.
    Missing velocity or trip data gets 0/neutral values with a flag.
    """
    logger.info("Building master feature table")

    master = goals.copy()
    master = master.merge(drivers, on="driver_id", how="left")
    master = master.merge(velocity_snap, on="driver_id", how="left")
    master = master.merge(rolling_vel, on="driver_id", how="left")
    master = master.merge(trip_agg, on="driver_id", how="left")

    # Flag rows where velocity data is missing — scoring will be degraded
    master["has_velocity_data"] = master["current_velocity"].notna().astype(int)

    # Fill numeric columns with 0 where missing (conservative — treat as no data)
    numeric_cols = master.select_dtypes(include=[np.number]).columns
    null_before = master[numeric_cols].isnull().sum().sum()
    master[numeric_cols] = master[numeric_cols].fillna(0)
    if null_before:
        logger.info(f"  Filled {null_before} numeric nulls with 0")

    logger.info(f"  Master: {len(master)} rows × {len(master.columns)} columns")
    logger.info(f"  Drivers with velocity data: {master['has_velocity_data'].sum()}/{len(master)}")
    return master


# ── ENTRY POINT ───────────────────────────────────────────────

def run_feature_extraction(drivers, goals, trips, velocity):
    logger.info("═══ STEP 2: FEATURE EXTRACTION ═══")

    vel_snap    = extract_velocity_snapshot(velocity)
    rolling_vel = extract_rolling_velocity(velocity)
    trip_agg    = extract_trip_aggregates(trips)
    master      = build_master(goals, drivers, vel_snap, rolling_vel, trip_agg)

    logger.info("Step 2 complete ✓")
    return master, velocity
