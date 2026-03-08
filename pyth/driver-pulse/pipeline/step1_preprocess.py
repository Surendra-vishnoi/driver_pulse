# pipeline/step1_preprocess.py
# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — PREPROCESSING
#
# Responsibilities:
#   1. Standardise column names and types
#   2. Validate rows against schema — bad rows logged and dropped, not silently kept
#   3. Impute missing values using DATASET MEDIANS (not invented constants)
#   4. Derive trip-level features from actual distributions
#   5. Flag outliers without dropping them
#   6. Derive trip_summaries from trips.csv — no external telemetry required
#
# All thresholds come from config/settings.py which is computed from real data.
# ─────────────────────────────────────────────────────────────────────────────

import sys, os
import logging
import numpy as np
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s",
                    stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.settings import (
    LONG_TRIP_MIN, LOW_FARE_RS, HIGH_SURGE_THRESHOLD, BACK_TO_BACK_GAP_MIN,
    TRIP_EV_P25, EFFICIENCY_P25, EFFICIENCY_P50, EFFICIENCY_P75,
    FARE_OUTLIER_Z, SURGE_P25, SURGE_P50, SURGE_P75
)


# ── Generic helpers ───────────────────────────────────────────

def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Lowercase, strip, replace spaces/hyphens with underscores."""
    df.columns = (
        df.columns.str.strip()
                  .str.lower()
                  .str.replace(r'[\s\-]+', '_', regex=True)
    )
    return df


def _log_drop(df: pd.DataFrame, before: int, context: str):
    dropped = before - len(df)
    if dropped:
        logger.warning(f"  [{context}] {dropped} rows dropped")


def _parse_time(series: pd.Series, col: str) -> pd.Series:
    """Try multiple datetime formats. Return NaT on failure."""
    for fmt in ("%H:%M:%S", "%H:%M", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
        try:
            return pd.to_datetime(series, format=fmt)
        except Exception:
            pass
    try:
        return pd.to_datetime(series, infer_datetime_format=True)
    except Exception:
        logger.warning(f"  Could not parse timestamps in {col}")
        return pd.to_datetime(series, errors='coerce')


# ── DRIVERS ───────────────────────────────────────────────────

def preprocess_drivers(df: pd.DataFrame) -> pd.DataFrame:
    logger.info("Preprocessing: drivers")
    df = _clean_columns(df.copy())
    n = len(df)

    required = ["driver_id", "name"]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        logger.error(f"  drivers missing columns: {missing_cols}")
        return df

    df = df.drop_duplicates(subset="driver_id")

    # Impute numerics with dataset median — not invented constants
    for col in ["avg_hours_per_day", "avg_earnings_per_hour", "experience_months", "rating"]:
        if col in df.columns:
            med = df[col].median()
            nulls = df[col].isnull().sum()
            if nulls:
                logger.info(f"  [drivers] imputing {nulls} nulls in {col} with median={med:.1f}")
            df[col] = df[col].fillna(med)

    _log_drop(df, n, "drivers")
    logger.info(f"  [drivers] {len(df)} rows loaded")
    return df


# ── GOALS ─────────────────────────────────────────────────────

def preprocess_goals(df: pd.DataFrame) -> pd.DataFrame:
    logger.info("Preprocessing: driver_goals")
    df = _clean_columns(df.copy())
    n = len(df)

    required = ["driver_id", "target_earnings", "current_earnings",
                "shift_start_time", "shift_end_time"]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        logger.error(f"  goals missing columns: {missing_cols}")
        return df

    # Parse times
    df["shift_start_time"] = _parse_time(df["shift_start_time"], "shift_start_time")
    df["shift_end_time"]   = _parse_time(df["shift_end_time"],   "shift_end_time")

    # Parse date column if it exists, else create from timestamps
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors='coerce')

    # Drop rows with unparseable times
    before = len(df)
    df = df.dropna(subset=["shift_start_time", "shift_end_time"])
    _log_drop(df, before, "goals/time-parse")

    # Numeric validation — negative or zero earnings is a data error
    for col in ["target_earnings", "current_earnings"]:
        before = len(df)
        df = df[df[col] > 0]
        _log_drop(df, before, f"goals/{col}>0")

    # Derived time fields
    df["shift_duration_hours"] = (
        (df["shift_end_time"] - df["shift_start_time"])
        .dt.total_seconds() / 3600
    )
    # Drop impossible shifts
    before = len(df)
    df = df[df["shift_duration_hours"].between(0.5, 24)]
    _log_drop(df, before, "goals/shift_duration")

    # current_hours: impute with dataset median if missing
    if "current_hours" in df.columns:
        med = df["current_hours"].median()
        nulls = df["current_hours"].isnull().sum()
        if nulls:
            logger.info(f"  [goals] imputing {nulls} nulls in current_hours with median={med:.1f}")
        df["current_hours"] = df["current_hours"].fillna(med).clip(lower=0)
    else:
        # Estimate from shift_elapsed_fraction if not present
        df["current_hours"] = df["shift_duration_hours"] * 0.5
        logger.warning("  [goals] current_hours not found — estimated at 50% of shift")

    # Derived fields
    df["elapsed_pct"]     = (df["current_hours"] / df["shift_duration_hours"]).clip(0, 1)
    df["remaining_hours"] = (df["shift_duration_hours"] - df["current_hours"]).clip(lower=0)
    df["earnings_gap"]    = (df["target_earnings"] - df["current_earnings"]).clip(lower=0)

    # Normalise forecast label column name (PDF had typo "gal_completion_forecast")
    for alias in ["gal_completion_forecast", "goal_completion_forecast",
                  "forecast", "completion_forecast"]:
        if alias in df.columns and alias != "goal_completion_forecast":
            df = df.rename(columns={alias: "goal_completion_forecast"})
            break

    _log_drop(df, n, "goals")
    logger.info(f"  [goals] {len(df)} rows loaded")
    return df


# ── TRIPS ─────────────────────────────────────────────────────

def preprocess_trips(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and validate trips. All thresholds from real distribution."""
    logger.info("Preprocessing: trips (primary input)")
    df = _clean_columns(df.copy())
    n = len(df)

    required = ["driver_id", "fare", "duration_min", "distance_km"]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        logger.error(f"  trips missing columns: {missing_cols}")
        return df

    # Keep only completed trips
    if "trip_status" in df.columns:
        before = len(df)
        df = df[df["trip_status"].str.lower() == "completed"]
        _log_drop(df, before, "trips/not-completed")

    # Numeric coercion
    for col in ["fare", "duration_min", "distance_km"]:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # Drop physically impossible rows
    before = len(df)
    df = df[(df["fare"] > 0) & (df["duration_min"] > 0) & (df["distance_km"] > 0)]
    _log_drop(df, before, "trips/non-positive")

    # Outlier fare flag — log-normal distribution, use Z on log(fare)
    log_fare = np.log(df["fare"])
    z_scores = (log_fare - log_fare.mean()) / log_fare.std()
    df["is_outlier_fare"] = z_scores.abs() > FARE_OUTLIER_Z
    n_outliers = df["is_outlier_fare"].sum()
    if n_outliers:
        logger.info(f"  [trips] {n_outliers} outlier fares flagged (|z|>{FARE_OUTLIER_Z}), kept")

    # Surge multiplier
    if "surge_multiplier" in df.columns:
        df["surge_multiplier"] = pd.to_numeric(df["surge_multiplier"], errors='coerce').fillna(1.0)
    else:
        df["surge_multiplier"] = 1.0
        logger.info("  [trips] surge_multiplier not found — defaulting to 1.0")

    # ── Derived features — all from data distributions ──────────

    # base_fare: what this trip earns at 1.0× surge (surge-neutral comparison)
    df["base_fare"] = df["fare"] / df["surge_multiplier"]

    # per-trip earnings velocity: Rs/hr for this specific trip
    df["trip_ev"] = df["fare"] / df["duration_min"] * 60

    # base velocity: surge-neutral trip velocity
    df["base_trip_ev"] = df["base_fare"] / df["duration_min"] * 60

    # efficiency: Rs per km
    df["efficiency_score"] = df["fare"] / df["distance_km"]

    # ── Rule-based flags (all thresholds from settings.py) ──────

    # long_trip: top quartile of duration — physical fatigue signal
    # threshold = p75 of actual data = 33 min (not invented 45 min)
    df["long_trip_flag"] = (df["duration_min"] >= LONG_TRIP_MIN).astype(int)

    # low_fare: bottom quintile — bad trip economically
    # threshold = p20 of actual fare distribution = 214 Rs
    df["low_fare_flag"] = (df["fare"] < LOW_FARE_RS).astype(int)

    # high_surge: top quartile of surge (p75 = 1.4)
    # binary flag is meaningful here because it marks genuinely exceptional surge
    df["high_surge_flag"] = (df["surge_multiplier"] >= HIGH_SURGE_THRESHOLD).astype(int)

    # surge_band: categorical, uses actual percentile boundaries
    df["surge_band"] = pd.cut(
        df["surge_multiplier"],
        bins=[0, SURGE_P25, SURGE_P50, SURGE_P75, float('inf')],
        labels=["normal", "moderate", "high", "very_high"]
    )

    # Parse start_time for back-to-back detection
    if "start_time" in df.columns and "end_time" in df.columns:
        df["start_dt"] = _parse_time(df["start_time"].astype(str), "start_time")
        df["end_dt"]   = _parse_time(df["end_time"].astype(str),   "end_time")
    else:
        df["start_dt"] = pd.NaT
        df["end_dt"]   = pd.NaT

    _log_drop(df, n, "trips")
    logger.info(f"  [trips] {len(df)} rows loaded")
    return df


def add_back_to_back_flag(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute back-to-back flag AFTER sorting by driver + time.
    back_to_back_flag = 1 if gap to PREVIOUS trip < BACK_TO_BACK_GAP_MIN.
    Requires start_dt and end_dt columns.
    Median gap in real data = 127 min. Threshold = 5 min (conservative).
    """
    if "start_dt" not in df.columns or df["start_dt"].isnull().all():
        df["back_to_back_flag"] = 0
        return df

    df = df.sort_values(["driver_id", "start_dt"]).copy()
    df["prev_end"] = df.groupby("driver_id")["end_dt"].shift(1)
    df["gap_min"]  = (df["start_dt"] - df["prev_end"]).dt.total_seconds() / 60
    df["back_to_back_flag"] = (
        df["gap_min"].notna() & (df["gap_min"] < BACK_TO_BACK_GAP_MIN)
    ).astype(int)
    df = df.drop(columns=["prev_end", "gap_min"])
    return df


# ── TRIP SUMMARIES ────────────────────────────────────────────

def derive_trip_summaries(trips: pd.DataFrame) -> pd.DataFrame:
    """
    Derive trip_summaries.csv equivalent from raw trips.
    
    Since we have no hardware sensors, we build proxy signals using
    observable features and their actual distributions.
    
    STRESS PROXY — three additive components:
      Component 1 (weight 0.40): long_trip_flag
        Why 0.40? Duration is the strongest physical fatigue signal.
        Threshold = p75 (33 min) — top quartile of actual trip lengths.
      
      Component 2 (weight 0.40): low_fare_flag
        Why 0.40? Economic frustration is equally important as physical fatigue.
        Threshold = p20 (214 Rs) — bottom quintile of actual fares.
      
      Component 3 (weight 0.20): back_to_back_flag
        Why 0.20? Confirms fatigue but only fires for extreme cases (gap < 5 min).
        Given median gap = 127 min, this is a rare signal — lower weight is correct.
      
      Sum = 0.40*long + 0.40*low_fare + 0.20*btb → range [0, 1]
      
    QUALITY BAND — based on efficiency_score quartiles:
      "excellent"  → efficiency >= p75 (26.6 Rs/km) and not high_surge
      "good"       → efficiency >= p50 (20.6 Rs/km)
      "average"    → efficiency >= p25 (16.5 Rs/km)
      "poor"       → efficiency < p25
      
      Surge-adjusted version: uses base_fare/km to remove surge effect
      for a fair quality comparison across trips.
    """
    trips = add_back_to_back_flag(trips.copy())

    trips["stress_score"] = (
        0.40 * trips["long_trip_flag"]
        + 0.40 * trips["low_fare_flag"]
        + 0.20 * trips["back_to_back_flag"]
    )

    # Severity label from stress_score continuous → discrete
    # Thresholds: 0.4 = one strong signal fires; 0.7 = two signals fire
    trips["severity"] = pd.cut(
        trips["stress_score"],
        bins=[-0.001, 0.1, 0.4, 0.7, 1.001],
        labels=["none", "low", "medium", "high"]
    )

    # Quality band: use base_fare efficiency (surge-neutral) for fairness
    base_eff = trips["base_fare"] / trips["distance_km"]
    trips["quality_band"] = "average"
    trips.loc[base_eff >= EFFICIENCY_P75, "quality_band"] = "excellent"
    trips.loc[(base_eff >= EFFICIENCY_P50) & (base_eff < EFFICIENCY_P75), "quality_band"] = "good"
    trips.loc[base_eff < EFFICIENCY_P25, "quality_band"] = "poor"

    return trips


# ── VELOCITY LOG ─────────────────────────────────────────────

def preprocess_velocity(df: pd.DataFrame) -> pd.DataFrame:
    logger.info("Preprocessing: earnings_velocity_log")
    df = _clean_columns(df.copy())
    n = len(df)

    required = ["driver_id", "current_velocity", "target_velocity"]
    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        logger.error(f"  velocity_log missing columns: {missing_cols}")
        return df

    for col in ["current_velocity", "target_velocity", "cumulative_earnings", "elapsed_hours"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')

    # Drop rows with missing core signals
    before = len(df)
    df = df.dropna(subset=["current_velocity", "target_velocity"])
    _log_drop(df, before, "velocity/nulls")

    # Drop physically impossible velocities (negative or > 5000 Rs/hr = data error)
    before = len(df)
    df = df[(df["current_velocity"] >= 0) & (df["current_velocity"] <= 5000)]
    _log_drop(df, before, "velocity/range")

    # Derived: velocity_ratio — the core signal
    # Natural threshold = 1.0 (from data: "ahead" min=1.07, "at_risk" max=0.97)
    df["velocity_ratio"] = df["current_velocity"] / df["target_velocity"]

    # velocity_delta already in source; recompute to be safe
    df["velocity_delta"] = df["current_velocity"] - df["target_velocity"]

    _log_drop(df, n, "velocity_log")
    logger.info(f"  [velocity_log] {len(df)} rows loaded")
    return df


# ── ENTRY POINT ───────────────────────────────────────────────

def run_preprocessing(drivers_raw, goals_raw, trips_raw, velocity_raw):
    logger.info("═══ STEP 1: PREPROCESSING ═══")
    drivers  = preprocess_drivers(drivers_raw)
    goals    = preprocess_goals(goals_raw)
    trips    = preprocess_trips(trips_raw)
    trips    = derive_trip_summaries(trips)
    velocity = preprocess_velocity(velocity_raw)
    logger.info("Step 1 complete ✓")
    return drivers, goals, trips, velocity


# ── SENSOR FUSION ─────────────────────────────────────────────

def fuse_sensor_signals(trips_df: pd.DataFrame,
                        audio_results: dict = None,
                        accel_results: dict = None) -> pd.DataFrame:
    """
    Combine trip-heuristic stress with audio and accelerometer signals
    into a single fused_stress_score per driver.

    WEIGHTING LOGIC:
      - If all three signals available: trip=0.40, audio=0.35, accel=0.25
      - If audio missing:              trip=0.60, accel=0.40
      - If accel missing:              trip=0.55, audio=0.45
      - If both missing:               trip=1.00 (fallback to heuristics only)

    The weights are not symmetric because trip-level data is always available
    and most reliable (directly observed). Audio and accel are complementary.

    WHY NOT AVERAGE?
      A driver with a stress-free audio clip but a terrible trip pattern
      should not get a neutral score — the trip evidence is hard data.
      Weighted fusion lets trip data anchor the score.
    """
    from config.settings import STRESS_W_TRIP, STRESS_W_AUDIO, STRESS_W_ACCEL

    # Aggregate stress to driver level from trips
    if "driver_id" not in trips_df.columns or "stress_score" not in trips_df.columns:
        return trips_df

    driver_trip_stress = (
        trips_df.groupby("driver_id")["stress_score"].mean().reset_index()
        .rename(columns={"stress_score": "trip_stress_score"})
    )

    # Merge audio results
    if audio_results:
        audio_df = pd.DataFrame([
            {"driver_id": did,
             "voice_stress_score": r.get("voice_stress_score") or 0.0,
             "fatigue_flag":       r.get("fatigue_flag", 0),
             "audio_available":    r.get("audio_available", False)}
            for did, r in audio_results.items()
        ])
        driver_trip_stress = driver_trip_stress.merge(audio_df, on="driver_id", how="left")
    else:
        driver_trip_stress["voice_stress_score"] = None
        driver_trip_stress["fatigue_flag"]        = 0
        driver_trip_stress["audio_available"]     = False

    # Merge accel results
    if accel_results:
        accel_df = pd.DataFrame([
            {"driver_id": did,
             "driving_risk_score": r.get("driving_risk_score") or 0.0,
             "weave_score":        r.get("weave_score", 0.0),
             "accel_available":    r.get("accel_available", False)}
            for did, r in accel_results.items()
        ])
        driver_trip_stress = driver_trip_stress.merge(accel_df, on="driver_id", how="left")
    else:
        driver_trip_stress["driving_risk_score"] = None
        driver_trip_stress["weave_score"]         = 0.0
        driver_trip_stress["accel_available"]     = False

    # Fused stress score
    def fuse_row(row):
        trip  = row.get("trip_stress_score") or 0.0
        audio = row.get("voice_stress_score")
        accel = row.get("driving_risk_score")
        has_audio = pd.notna(audio)
        has_accel = pd.notna(accel)

        if has_audio and has_accel:
            w_t, w_a, w_x = STRESS_W_TRIP, STRESS_W_AUDIO, STRESS_W_ACCEL
        elif has_audio:
            w_t, w_a, w_x = 0.55, 0.45, 0.0
        elif has_accel:
            w_t, w_a, w_x = 0.60, 0.0, 0.40
        else:
            w_t, w_a, w_x = 1.0, 0.0, 0.0

        return float(
            w_t * trip
            + w_a * (audio if has_audio else 0.0)
            + w_x * (accel if has_accel else 0.0)
        )

    driver_trip_stress["fused_stress_score"] = driver_trip_stress.apply(fuse_row, axis=1)

    # Attach back to trips (so downstream sees fused_stress_score per driver)
    trips_out = trips_df.merge(
        driver_trip_stress[["driver_id","trip_stress_score","fused_stress_score",
                            "audio_available","accel_available",
                            "fatigue_flag","weave_score"]],
        on="driver_id", how="left"
    )
    return trips_out
