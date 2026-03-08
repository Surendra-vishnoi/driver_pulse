# main.py — Driver Pulse Pipeline Orchestrator
# ─────────────────────────────────────────────────────────────────────────────
# DESIGN PRINCIPLES APPLIED HERE:
#   1. Every step is wrapped in try/except — one failure never crashes the run
#   2. Data loads from OneDrive/local/env-var/sample in priority order
#   3. Audio and accelerometer processed at edge — no cloud, no network
#   4. Chunked batch processing — works for 4 or 40,000 drivers
#   5. All outputs are local CSV — no upload, no cloud dependency
# ─────────────────────────────────────────────────────────────────────────────
import sys, os
os.environ["PYTHONUNBUFFERED"] = "1"
sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(THIS_DIR)
sys.path.insert(0, THIS_DIR)

print("=" * 62, flush=True)
print("  DRIVER PULSE — Offline · Edge · Scalable", flush=True)
print(f"  Dir: {THIS_DIR}", flush=True)
print("=" * 62, flush=True)

import argparse
import pandas as pd
import numpy as np
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s",
                    stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)

# ── Import pipeline modules ───────────────────────────────────
try:
    from pipeline.data_loader import load_data, load_data_chunked
    from pipeline import run_preprocessing, run_feature_extraction, run_insights
    from pipeline.edge_audio import process_audio_batch
    from pipeline.edge_accelerometer import process_accel_batch
    from pipeline.step1_preprocess import fuse_sensor_signals
    print("  pipeline OK\n", flush=True)
except ImportError as e:
    print(f"  IMPORT ERROR: {e}", flush=True)
    sys.exit(1)


# ── Edge sensor loading (optional) ───────────────────────────

def load_edge_data(data_dir: str = None) -> tuple:
    """
    Look for audio files and accelerometer CSVs in the data directory.
    These are OPTIONAL — their absence is handled gracefully.
    Returns ({driver_id: audio_path}, {driver_id: accel_path_or_array})
    """
    audio_map = {}
    accel_map = {}

    if not data_dir:
        return audio_map, accel_map

    base = Path(data_dir).expanduser()
    if not base.exists():
        return audio_map, accel_map

    # Audio: look for files named DRV001.wav, DRV001_audio.wav etc.
    for f in base.rglob("*.wav"):
        # Extract driver ID from filename
        stem = f.stem.upper().replace("_AUDIO", "").replace("_VOICE", "")
        if stem.startswith("DRV"):
            audio_map[stem] = str(f)
            logger.info(f"  [audio] found {f.name} → {stem}")

    # Accelerometer: look for DRV001_accel.csv etc.
    for f in base.rglob("*accel*.csv"):
        stem = f.stem.upper().split("_")[0]
        if stem.startswith("DRV"):
            accel_map[stem] = str(f)
            logger.info(f"  [accel] found {f.name} → {stem}")

    return audio_map, accel_map


# ── Single chunk processor ────────────────────────────────────

def process_chunk(raw: dict, audio_results: dict = None,
                  accel_results: dict = None) -> pd.DataFrame:
    """
    Run the full pipeline on one chunk of data.
    Returns scored DataFrame or empty DataFrame on failure.

    ISOLATION: exceptions within any step are caught here.
    A bad chunk logs an error and returns empty — does not crash the run.
    """
    try:
        # Step 1: Preprocess
        drivers, goals, trips, velocity = run_preprocessing(
            raw["drivers"], raw["driver_goals"],
            raw["trips"],   raw["earnings_velocity"]
        )

        # Step 1b: Fuse edge sensor data if available
        if audio_results or accel_results:
            trips = fuse_sensor_signals(trips, audio_results, accel_results)

        # Step 2: Features
        master, vel_enriched = run_feature_extraction(drivers, goals, trips, velocity)

        # Step 3: Score
        results = run_insights(master)
        return results

    except Exception as e:
        logger.error(f"  CHUNK FAILED: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return pd.DataFrame()


# ── Output writer ─────────────────────────────────────────────

def write_results(results: pd.DataFrame, out_dir: Path, chunk_idx: int = 0):
    """Append chunk results to output CSVs."""
    out_dir.mkdir(parents=True, exist_ok=True)

    # Main output
    out_file = out_dir / "pace_scores.csv"
    write_header = not out_file.exists() or chunk_idx == 0
    results.to_csv(out_file, mode='w' if write_header else 'a',
                   header=write_header, index=False)

    # Driver messages only (lightweight — for app consumption)
    msg_cols = [c for c in ["driver_id","name","pace_score","pace_band",
                             "projected_earnings","driver_message"] if c in results.columns]
    msg_file = out_dir / "driver_messages.csv"
    results[msg_cols].to_csv(msg_file, mode='w' if write_header else 'a',
                              header=write_header, index=False)


# ── Print summary ─────────────────────────────────────────────

def print_results(results: pd.DataFrame):
    sep = "=" * 72
    print(f"\n{sep}", flush=True)
    print("  PACE SCORES", flush=True)
    print(sep, flush=True)
    print(f"{'ID':<10} {'Name':<16} {'Earned':>8} {'Goal':>8} "
          f"{'Score':>7} {'Band':<20} {'Projected':>10}", flush=True)
    print("-" * 72, flush=True)
    for _, r in results.iterrows():
        score = r.get("pace_score") or 0
        print(f"{str(r['driver_id']):<10} {str(r.get('name','')):<16} "
              f"{r['current_earnings']:>8.0f} {r['target_earnings']:>8.0f} "
              f"{score:>7.1f} {str(r.get('pace_band','')):20} "
              f"{r.get('projected_earnings',0):>10.0f}", flush=True)

    print(f"\n{sep}", flush=True)
    print("  SIGNAL RATIOS  (threshold = 1.0 on all signals)", flush=True)
    print(f"  S1=pace  S2=velocity  S3=projection  S4=pressure", flush=True)
    print(sep, flush=True)
    print(f"{'ID':<10} {'S1':>7} {'S2':>7} {'S3':>7} {'S4':>7}  {'Score':>7}", flush=True)
    print("-" * 72, flush=True)
    for _, r in results.iterrows():
        s1 = r.get("s1_pace_ratio", 0) or 0
        s2 = r.get("s2_velocity_ratio", 0) or 0
        s3 = r.get("s3_projection_ratio", 0) or 0
        s4 = r.get("s4_pressure_ratio", 0) or 0
        score = r.get("pace_score", 0) or 0
        print(f"{str(r['driver_id']):<10} {s1:>7.2f} {s2:>7.2f} "
              f"{s3:>7.2f} {s4:>7.2f}  {score:>7.1f}", flush=True)

    print(f"\n{sep}", flush=True)
    print("  DRIVER MESSAGES", flush=True)
    print(sep, flush=True)
    for _, r in results.iterrows():
        score = r.get("pace_score")
        s = f"{score:.1f}" if score is not None else "N/A"
        print(f"\n  [{r['driver_id']}]  {s}/100  ({r.get('pace_band','')})", flush=True)
        print(f"  {r.get('driver_message', '')}", flush=True)
        print("  " + "-" * 68, flush=True)


# ── Main ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Driver Pulse — offline edge pipeline")
    parser.add_argument("--data_dir",   default=None,
                        help="Path to data folder (OneDrive, USB, local). "
                             "Auto-detects OneDrive if omitted.")
    parser.add_argument("--batch",      action="store_true",
                        help="Chunked batch mode — for large datasets (1000s of drivers)")
    parser.add_argument("--chunk_size", type=int, default=None,
                        help=f"Drivers per chunk in batch mode (default from settings)")
    args = parser.parse_args()

    out_dir = Path("data/processed")

    # ── BATCH MODE ───────────────────────────────────────────
    if args.batch:
        print(f"  [MODE] Batch (chunked) from: {args.data_dir or 'auto-detect'}\n", flush=True)

        # Load edge sensor data once (not per-chunk — filepaths are small)
        audio_map, accel_map = load_edge_data(args.data_dir)

        # Process edge data
        audio_results = process_audio_batch(audio_map) if audio_map else {}
        accel_results = process_accel_batch(accel_map) if accel_map else {}

        if audio_results:
            print(f"  [edge] Audio processed: {len(audio_results)} drivers", flush=True)
        if accel_results:
            print(f"  [edge] Accel processed: {len(accel_results)} drivers", flush=True)

        total_scored = 0
        for i, chunk in enumerate(load_data_chunked(args.data_dir, args.chunk_size)):
            print(f"\n  --- Chunk {i+1} ---", flush=True)
            results = process_chunk(chunk, audio_results, accel_results)
            if not results.empty:
                write_results(results, out_dir, chunk_idx=i)
                total_scored += len(results)

        print(f"\n  Batch complete: {total_scored} drivers scored", flush=True)
        print(f"  Output: {(out_dir/'pace_scores.csv').resolve()}", flush=True)
        return

    # ── SINGLE RUN MODE (default) ────────────────────────────
    print(f"  [MODE] Single run from: {args.data_dir or 'auto-detect'}\n", flush=True)

    # Load data
    try:
        raw = load_data(args.data_dir)
    except Exception as e:
        logger.error(f"Data load failed: {e}")
        print("\n  ERROR: No data loaded. Check data files in data/raw/.", flush=True)
        return

    # Check if we actually got data
    total_rows = sum(len(v) for v in raw.values())
    if total_rows == 0:
        logger.error("No data loaded from any source.")
        print("\n  ERROR: No data loaded. Check data files in data/raw/.", flush=True)
        return

    # Load and process edge sensor data
    print("\n  --- Edge Sensor Processing ---", flush=True)
    audio_map, accel_map = load_edge_data(args.data_dir)

    audio_results = {}
    if audio_map:
        print(f"  Found audio for {len(audio_map)} drivers", flush=True)
        try:
            audio_results = process_audio_batch(audio_map)
        except Exception as e:
            logger.error(f"  Audio processing failed: {e} — continuing without")

    accel_results = {}
    if accel_map:
        print(f"  Found accel data for {len(accel_map)} drivers", flush=True)
        try:
            accel_results = process_accel_batch(accel_map)
        except Exception as e:
            logger.error(f"  Accel processing failed: {e} — continuing without")

    if not audio_map and not accel_map:
        print("  No audio/accel files found — using trip heuristics for stress", flush=True)

    # Run pipeline
    print("\n  --- Step 1: Preprocessing ---", flush=True)
    print("\n  --- Step 2: Feature Extraction ---", flush=True)
    print("\n  --- Step 3: Scoring ---", flush=True)

    results = process_chunk(raw, audio_results, accel_results)

    if results.empty:
        print("\n  ERROR: No results produced. Check logs above.", flush=True)
        return

    # Ensure clean output files for single run
    import os
    pace_file = out_dir / "pace_scores.csv"
    msg_file = out_dir / "driver_messages.csv"
    if pace_file.exists():
        os.remove(pace_file)
    if msg_file.exists():
        os.remove(msg_file)

    write_results(results, out_dir, chunk_idx=0)
    print_results(results)
    print(f"\n  Output: {(out_dir/'pace_scores.csv').resolve()}", flush=True)
    print(f"  Messages: {(out_dir/'driver_messages.csv').resolve()}", flush=True)


if __name__ == "__main__":
    main()
