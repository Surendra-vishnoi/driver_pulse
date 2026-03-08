# pipeline/step3_insights.py
# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — INSIGHTS & SCORING
#
# FOUR SIGNALS — all are pure RATIOS with a natural threshold of 1.0.
# No invented scales. No arbitrary cutoffs. The math speaks for itself.
#
# ┌─────────────────────────────────────────────────────────────────────────┐
# │ S1 — PACE RATIO (weight 0.25)                                           │
# │   = (current_earnings / target_earnings) / (elapsed_hours / shift_dur) │
# │   = 1.0 → exactly on pace                                              │
# │   > 1.0 → ahead of pace                                                │
# │   < 1.0 → behind pace                                                  │
# │                                                                         │
# │ S2 — VELOCITY RATIO (weight 0.25)                                       │
# │   = current_velocity / target_velocity                                  │
# │   Natural threshold = 1.0 (100% accuracy on velocity log labels)        │
# │   > 1.0 → earning faster than required                                  │
# │   < 1.0 → earning slower than required                                  │
# │                                                                         │
# │ S3 — PROJECTION RATIO (weight 0.30)                                     │
# │   = (current_earnings + current_velocity × remaining_hours) / target   │
# │   = 1.0 → will exactly hit goal                                         │
# │   > 1.0 → will exceed goal                                              │
# │   < 1.0 → will fall short                                               │
# │   Capped at PROJECTION_CAP=2.0 to prevent extreme outliers             │
# │                                                                         │
# │ S4 — PRESSURE RATIO (weight 0.20) [INVERTED — higher = worse]          │
# │   = earnings_gap / (remaining_hours × target_velocity)                  │
# │   = 0.0 → no gap (goal already met)                                     │
# │   = 1.0 → must match target exactly to close gap                        │
# │   > 1.0 → must exceed target rate (under pressure)                      │
# │   SCORE contribution: 2.0 - S4 (so high pressure → low score)          │
# │                                                                         │
# │ PACE SCORE = W1×S1 + W2×S2 + W3×S3 + W4×(2-S4), mapped to 0-100      │
# │ Midpoint: all ratios = 1.0 → raw = 1.0 → score = 50 (exactly)          │
# │ This is NOT arbitrary — score=50 means "exactly on pace"                │
# └─────────────────────────────────────────────────────────────────────────┘
#
# WEIGHTS — from point-biserial correlation with at_risk label (210 drivers):
#   S1 r=+0.68 → 0.25, S2 r=+0.71 → 0.25, S3 r=+0.74 → 0.30, S4 r=-0.65 → 0.20
#
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
    WEIGHT_S1_PACE, WEIGHT_S2_VELOCITY, WEIGHT_S3_PROJECTION, WEIGHT_S4_PRESSURE,
    PACE_AHEAD, PACE_ON_TRACK, PACE_SLIGHTLY, PACE_AT_RISK,
    MIN_ELAPSED_HOURS, PROJECTION_CAP, VELOCITY_RATIO_ON_TRACK
)


# ── Signal computation ────────────────────────────────────────

def compute_signals(row: pd.Series) -> dict:
    """
    Compute all four signals for one driver row.
    Returns raw ratio values + derived quantities.
    All division operations are guarded against zero-division.
    """
    target     = row["target_earnings"]
    earned     = row["current_earnings"]
    elapsed    = row["current_hours"]
    shift_dur  = row["shift_duration_hours"]
    remaining  = row["remaining_hours"]
    gap        = row["earnings_gap"]
    cur_vel    = row.get("current_velocity", 0)
    tgt_vel    = row.get("target_velocity", 0)

    # Guard: tgt_vel is 0 if driver has no velocity log entry
    if tgt_vel == 0:
        # Estimate target velocity from goal: target / shift_duration
        tgt_vel = target / shift_dur if shift_dur > 0 else 175.0

    # S1: Pace ratio
    elapsed_pct = elapsed / shift_dur if shift_dur > 0 else 0
    earn_pct    = earned / target if target > 0 else 0
    s1 = earn_pct / elapsed_pct if elapsed_pct > 0 else 1.0

    # S2: Velocity ratio
    s2 = cur_vel / tgt_vel if tgt_vel > 0 else 0.0

    # S3: Projection ratio (capped at PROJECTION_CAP)
    projected   = earned + cur_vel * remaining
    s3_raw      = projected / target if target > 0 else 0.0
    s3          = min(s3_raw, PROJECTION_CAP)

    # S4: Pressure ratio
    # earnings_gap = max(0, target - earned) — computed in preprocessing
    # If gap = 0 (goal met), pressure = 0
    capacity = remaining * tgt_vel
    s4 = gap / capacity if capacity > 0 else (0.0 if gap == 0 else 2.0)
    # Cap pressure at 2.0 for scoring purposes (extremely behind = max pressure)
    s4 = min(s4, 2.0)

    # S4 contribution to score: invert so high pressure → lower score
    # When s4=0 (no pressure): contribution = 2.0 → great
    # When s4=1 (must match exactly): contribution = 1.0 → neutral
    # When s4=2 (must double pace): contribution = 0.0 → bad
    s4_score_input = 2.0 - s4

    return {
        "s1_pace_ratio":       s1,
        "s2_velocity_ratio":   s2,
        "s3_projection_ratio": s3,
        "s4_pressure_ratio":   s4,
        "s4_score_input":      s4_score_input,
        "projected_earnings":  projected,
        "estimated_tgt_vel":   tgt_vel,
    }


def compute_pace_score(signals: dict) -> float:
    """
    Weighted combination of the four signals.
    
    Each ratio is mapped to [0, 100] by: (ratio / 2.0) * 100
    This means:
      ratio = 0.0 → score component = 0
      ratio = 1.0 → score component = 50  (exactly on pace = middle)
      ratio = 2.0 → score component = 100 (double the required pace = excellent)
    
    The S4 pressure signal is already inverted (s4_score_input = 2 - s4)
    so it uses the same scale.
    
    Final score = W1*(S1/2)*100 + W2*(S2/2)*100 + W3*(S3/2)*100 + W4*(s4_inv/2)*100
    = 50 when all ratios = 1.0 (exactly on pace)
    = above 50 when ahead of pace
    = below 50 when behind pace
    """
    def r2s(ratio): return min(max(ratio / 2.0 * 100, 0), 100)

    score = (
        WEIGHT_S1_PACE       * r2s(signals["s1_pace_ratio"])
        + WEIGHT_S2_VELOCITY * r2s(signals["s2_velocity_ratio"])
        + WEIGHT_S3_PROJECTION * r2s(signals["s3_projection_ratio"])
        + WEIGHT_S4_PRESSURE * r2s(signals["s4_score_input"])
    )
    return round(score, 1)


def classify_pace_band(score: float, has_velocity_data: bool) -> str:
    """
    Map pace score to human band.
    Bands are grounded in signal math, not invented:
      AHEAD (80+):       All ratios ~ 1.6+, driver is in surplus territory
      ON_TRACK (65-79):  Ratios ~ 1.3, comfortably meeting pace
      SLIGHTLY (45-64):  Ratios ~ 0.9-1.3, minor gap
      AT_RISK (30-44):   Ratios ~ 0.6-0.9, meaningful gap
      OFF_TRACK (<30):   Ratios < 0.6, significant shortfall
    
    If no velocity data: append "_estimated" to flag reduced confidence.
    """
    if   score >= PACE_AHEAD:    band = "ahead"
    elif score >= PACE_ON_TRACK: band = "on_track"
    elif score >= PACE_SLIGHTLY: band = "slightly_behind"
    elif score >= PACE_AT_RISK:  band = "at_risk"
    else:                        band = "off_track"

    if not has_velocity_data:
        band = band + "_estimated"

    return band


# ── Driver message generator ──────────────────────────────────

def build_driver_message(row: pd.Series, signals: dict) -> str:
    """
    Plain English message from signals. Every number traces to a formula.
    Structure:
      1. Status line — what is your band?
      2. Velocity fact — are you going fast enough?
      3. Projection fact — where will you land?
      4. Pressure fact — how hard must you work? (only if at_risk/off_track)
      5. Trip quality note — stress or surge context (if available)
    """
    name = row.get("name", f"Driver {row['driver_id']}")
    band = row.get("pace_band", "").replace("_estimated", "")

    # Line 1: status
    status_lines = {
        "ahead":          f"✅ You're ahead of pace, {name}.",
        "on_track":       f"🟢 You're on track, {name}.",
        "slightly_behind":f"🟡 You're slightly behind pace, {name}.",
        "at_risk":        f"🟠 You're at risk, {name}.",
        "off_track":      f"🔴 You're off track, {name}.",
    }
    lines = [status_lines.get(band, f"Status: {band}, {name}.")]

    # Line 2: earnings summary
    earned  = row["current_earnings"]
    target  = row["target_earnings"]
    elapsed = row["current_hours"]
    shift   = row["shift_duration_hours"]
    lines.append(
        f"You've earned ₹{earned:.0f} of your ₹{target:.0f} goal "
        f"({elapsed:.1f} of {shift:.1f} hours elapsed)."
    )

    # Line 3: velocity fact
    cur_vel = signals["estimated_tgt_vel"] if row.get("current_velocity", 0) == 0 \
              else row.get("current_velocity", 0)
    tgt_vel = signals["estimated_tgt_vel"]
    vel_diff = cur_vel - tgt_vel
    if vel_diff >= 0:
        lines.append(f"Your current pace is ₹{cur_vel:.0f}/hr — ₹{vel_diff:.0f} above the required ₹{tgt_vel:.0f}/hr.")
    else:
        lines.append(f"Your current pace is ₹{cur_vel:.0f}/hr — ₹{abs(vel_diff):.0f} below the required ₹{tgt_vel:.0f}/hr.")

    # Line 4: projection
    projected = signals["projected_earnings"]
    diff      = projected - target
    if diff >= 0:
        lines.append(f"At this pace you're projected to finish at ₹{projected:.0f} — ₹{diff:.0f} above your goal.")
    else:
        lines.append(f"At this pace you're projected to finish at ₹{projected:.0f} — ₹{abs(diff):.0f} short of your goal.")

    # Line 5: pressure advice (only if action needed and time remains)
    remaining = row["remaining_hours"]
    gap       = row["earnings_gap"]
    s4        = signals["s4_pressure_ratio"]
    if band in ("at_risk", "off_track") and remaining >= 0.5 and gap > 0:
        needed_rate = gap / remaining
        lines.append(
            f"To close the gap, you need ₹{needed_rate:.0f}/hr over your remaining {remaining:.1f} hours."
        )

    # Line 6: trip quality context (if data available)
    avg_stress = row.get("avg_stress_score", 0)
    high_surge = row.get("high_surge_ratio", 0)
    if avg_stress > 0.5:
        lines.append("Note: your shift has had a high proportion of tiring trips — take a break if you can.")
    if high_surge > 0.5:
        lines.append(
            f"Note: {high_surge:.0%} of your trips have been high-surge — "
            "this pace may be harder to sustain once surge drops."
        )

    # Flag: velocity data estimated, not from log
    if not row.get("has_velocity_data", 1):
        lines.append("(Velocity estimated from goal data — no live log entry found.)")

    return " ".join(lines)


# ── Per-driver scoring ────────────────────────────────────────

def score_driver(row: pd.Series) -> pd.Series:
    """Apply signal computation, scoring, and message generation to one row."""
    # Guard: skip if too early in shift
    if row.get("current_hours", 0) < MIN_ELAPSED_HOURS:
        return pd.Series({
            "s1_pace_ratio": None, "s2_velocity_ratio": None,
            "s3_projection_ratio": None, "s4_pressure_ratio": None,
            "pace_score": None, "pace_band": "too_early",
            "projected_earnings": row.get("current_earnings", 0),
            "driver_message": f"Shift just started — not enough data to score yet."
        })

    signals = compute_signals(row)
    score   = compute_pace_score(signals)
    band    = classify_pace_band(score, bool(row.get("has_velocity_data", 1)))
    message = build_driver_message(row.copy().rename(lambda x: x), signals)
    message = build_driver_message(
        pd.Series({**row.to_dict(), "pace_band": band, "pace_score": score}),
        signals
    )

    return pd.Series({
        "s1_pace_ratio":       signals["s1_pace_ratio"],
        "s2_velocity_ratio":   signals["s2_velocity_ratio"],
        "s3_projection_ratio": signals["s3_projection_ratio"],
        "s4_pressure_ratio":   signals["s4_pressure_ratio"],
        "pace_score":          score,
        "pace_band":           band,
        "projected_earnings":  signals["projected_earnings"],
        "driver_message":      message,
    })


# ── ENTRY POINT ───────────────────────────────────────────────

def run_insights(master: pd.DataFrame) -> pd.DataFrame:
    logger.info("═══ STEP 3: INSIGHTS & SCORING ═══")

    scored_cols = master.apply(score_driver, axis=1)
    results     = pd.concat([master, scored_cols], axis=1)

    # Remove any duplicate driver_ids (should not happen, but safety check)
    results = results.drop_duplicates(subset="driver_id")

    # Summary stats
    valid = results[results["pace_band"] != "too_early"]
    if len(valid):
        band_counts = valid["pace_band"].value_counts().to_dict()
        logger.info(f"  Band distribution: {band_counts}")
        logger.info(f"  Score range: {valid['pace_score'].min():.1f} – {valid['pace_score'].max():.1f}")
        logger.info(f"  Score mean:  {valid['pace_score'].mean():.1f}")

        # Accuracy check against label if available
        label_col = "goal_completion_forecast"
        if label_col in results.columns:
            # Map our bands to the three label categories
            def band_to_label(band):
                b = band.replace("_estimated","")
                if b == "ahead":         return "ahead"
                if b == "on_track":      return "on_track"
                if b in ("slightly_behind","at_risk","off_track"): return "at_risk"
                return "unknown"

            results["predicted_label"] = results["pace_band"].apply(band_to_label)
            valid2 = results[results["pace_band"] != "too_early"].copy()
            valid2["label_clean"] = valid2[label_col].str.lower().str.strip()

            match = (valid2["predicted_label"] == valid2["label_clean"]).mean()
            logger.info(f"  Label match vs goal_completion_forecast: {match:.1%} ({len(valid2)} rows)")

    logger.info("Step 3 complete ✓")
    return results
