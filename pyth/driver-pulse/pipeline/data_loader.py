# pipeline/data_loader.py
import pandas as pd
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def load_data(data_dir=None):
    """
    Load data from CSV files in the specified directory.
    If data_dir is None, defaults to 'data/raw'.
    Returns dict with keys: drivers, driver_goals, trips, earnings_velocity
    """
    if data_dir is None:
        data_dir = Path("data/raw")
    else:
        data_dir = Path(data_dir)

    if not data_dir.exists():
        raise FileNotFoundError(f"Data directory {data_dir} does not exist")

    data = {}
    files = {
        "drivers": "drivers.csv.xlsx",
        "driver_goals": "driver_goals.csv.xlsx",
        "trips": "trips.csv.xlsx",
        "earnings_velocity": "earnings_velocity_log.csv.xlsx"
    }

    for key, filename in files.items():
        filepath = data_dir / filename
        if filepath.exists():
            if filename.endswith('.xlsx'):
                data[key] = pd.read_excel(filepath)
            else:
                data[key] = pd.read_csv(filepath)
            logger.info(f"Loaded {len(data[key])} rows from {filepath}")
        else:
            logger.warning(f"File {filepath} not found")
            data[key] = pd.DataFrame()

    return data

def load_data_chunked(data_dir=None, chunk_size=None):
    """
    Generator to load data in chunks for batch processing.
    For simplicity, since chunking is per driver, but data is not chunked here.
    This is a placeholder; in real implementation, chunk by driver_id.
    """
    data = load_data(data_dir)
    # For now, yield the entire data as one chunk
    yield data