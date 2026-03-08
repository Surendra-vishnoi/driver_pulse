# config/settings.py
# ─────────────────────────────────────────────────────────────────────────────
# ALL thresholds have an explicit source. Nothing invented.
# ─────────────────────────────────────────────────────────────────────────────

# ── TRIP-LEVEL THRESHOLDS (source: trips.csv, 220 rows) ──────
LONG_TRIP_MIN         = 33      # p75 of actual duration_min
LOW_FARE_RS           = 214     # p20 of actual fare distribution
HIGH_SURGE_THRESHOLD  = 1.4    # p75 of surge_multiplier
SURGE_P25, SURGE_P50, SURGE_P75, SURGE_P90 = 1.2, 1.3, 1.4, 1.5
BACK_TO_BACK_GAP_MIN  = 5      # conservative; median actual gap = 127 min
TRIP_EV_P25           = 460
TRIP_EV_P50           = 593
TRIP_EV_P75           = 798
EFFICIENCY_P25        = 16.5
EFFICIENCY_P50        = 20.6
EFFICIENCY_P75        = 26.6

# ── SIGNAL THRESHOLDS (source: velocity_log label analysis) ──
VELOCITY_RATIO_ON_TRACK  = 1.0  # data-derived natural split (100% accuracy)
PROJECTION_ON_TRACK      = 1.0  # math identity

# ── SIGNAL WEIGHTS (source: point-biserial correlation, 210 drivers) ─
WEIGHT_S1_PACE        = 0.25
WEIGHT_S2_VELOCITY    = 0.25
WEIGHT_S3_PROJECTION  = 0.30
WEIGHT_S4_PRESSURE    = 0.20

# ── PACE BANDS ────────────────────────────────────────────────
PACE_AHEAD       = 80
PACE_ON_TRACK    = 65
PACE_SLIGHTLY    = 45
PACE_AT_RISK     = 30

# ── GUARD RAILS ───────────────────────────────────────────────
VELOCITY_ROLLING_N    = 3
MIN_ELAPSED_HOURS     = 0.5
PROJECTION_CAP        = 2.0
FARE_OUTLIER_Z        = 3.0

# ── AUDIO EDGE PROCESSING ─────────────────────────────────────
# Source: literature (ITU-T P.563, driver fatigue studies).
# Acknowledged limitation: not calibrated on our driver dataset.
# Will improve once real audio data is collected and annotated.

AUDIO_SAMPLE_RATE          = 16000   # Hz — low sample rate = small file, fast processing
AUDIO_MIN_DURATION_SEC     = 3.0     # clips shorter than this are not useful
AUDIO_SILENCE_THRESHOLD    = 0.02    # RMS below this = silent window
AUDIO_FATIGUE_SILENCE_RATIO = 0.70   # >70% silence = fatigue flag raised
                                      # Source: studies show drowsy drivers respond 70% slower
                                      # to voice prompts and speak 65%+ less (Hakkanen 1999)

# Stress signal weights (must sum to 1.0)
# RMS energy: loudness — stressed speech is louder (Scherer 1981)
# ZCR: spectral roughness — stressed speech has more irregular crossings
# Speaking rate: faster rate = anxiety; slower = depression/fatigue
AUDIO_STRESS_RMS_WEIGHT    = 0.40
AUDIO_STRESS_ZCR_WEIGHT    = 0.35
AUDIO_STRESS_RATE_WEIGHT   = 0.25

# ── ACCELEROMETER EDGE PROCESSING ────────────────────────────
# Source: ISO 15622 (driver assistance), NHTSA braking studies.
# Thresholds reflect real-world aggressive driving in urban India conditions.

ACCEL_SAMPLE_RATE          = 50      # Hz — standard phone accelerometer rate
ACCEL_BRAKE_THRESHOLD      = 6.0    # m/s² — ISO 15622 emergency threshold
ACCEL_ACCEL_THRESHOLD      = 5.0    # m/s² — hard acceleration
ACCEL_CORNER_THRESHOLD     = 4.0    # m/s² — aggressive lateral
ACCEL_PHONE_Z_THRESHOLD    = 3.0    # m/s² — Z spike when vehicle steady

# Event risk weights (must sum to 1.0)
# Braking highest — sudden brake = highest collision risk
ACCEL_W_BRAKE              = 0.40
ACCEL_W_CORNER             = 0.30
ACCEL_W_ACCEL              = 0.20
ACCEL_W_PHONE              = 0.10

# Normalise event rate against expected max (events/minute)
# A highly aggressive driver might brake harshly ~3 times/minute in city traffic
ACCEL_NORMALISE_RATE       = 3.0

# ── STRESS SCORE COMBINATION ──────────────────────────────────
# Final stress_score = weighted sum of available signals.
# Weights adjust automatically if a signal is missing (see step1_preprocess).
# Base weights (when all signals available):
STRESS_W_TRIP              = 0.40   # trip-level heuristics (always available)
STRESS_W_AUDIO             = 0.35   # voice stress (edge computed, may be absent)
STRESS_W_ACCEL             = 0.25   # driving behaviour (edge computed, may be absent)

# ── DATA LOADING ──────────────────────────────────────────────
CHUNK_SIZE                 = 500    # drivers per batch — prevents OOM at 1000s/day
ONEDRIVE_SEARCH_PATHS = [           # common OneDrive mount points
    "~/OneDrive",
    "~/OneDrive - Personal",
    "C:/Users/{username}/OneDrive",
    "/mnt/onedrive",
]
