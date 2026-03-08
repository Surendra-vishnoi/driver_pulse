# pipeline/sample_data.py
import pandas as pd

def get_sample_data():
    """
    Return sample data for 4 drivers.
    """
    drivers = pd.DataFrame({
        "driver_id": ["DRV001", "DRV002", "DRV003", "DRV004"],
        "name": ["Alex Kumar", "Priya Singh", "Raj Patel", "Meera Joshi"],
        "avg_hours_per_day": [8.0, 7.5, 9.0, 8.5],
        "avg_earnings_per_hour": [180, 190, 175, 185],
        "experience_months": [24, 18, 36, 12],
        "rating": [4.8, 4.9, 4.7, 4.6]
    })

    driver_goals = pd.DataFrame({
        "driver_id": ["DRV001", "DRV002", "DRV003", "DRV004"],
        "target_earnings": [1440, 1425, 1575, 1572.5],
        "current_earnings": [720, 950, 525, 1179],
        "shift_start_time": ["06:00:00", "07:00:00", "08:00:00", "09:00:00"],
        "shift_end_time": ["14:00:00", "15:00:00", "16:00:00", "17:00:00"],
        "current_hours": [4.0, 5.0, 3.0, 6.5]
    })

    trips = pd.DataFrame({
        "driver_id": ["DRV001", "DRV001", "DRV002", "DRV002", "DRV003", "DRV003", "DRV004", "DRV004"],
        "fare": [150, 200, 180, 220, 140, 160, 190, 210],
        "duration_min": [20, 25, 18, 30, 15, 22, 24, 28],
        "distance_km": [10, 12, 9, 15, 8, 11, 13, 14],
        "surge_multiplier": [1.2, 1.0, 1.1, 1.3, 1.0, 1.2, 1.1, 1.4]
    })

    earnings_velocity = pd.DataFrame({
        "driver_id": ["DRV001", "DRV001", "DRV002", "DRV002", "DRV003", "DRV003", "DRV004", "DRV004"],
        "current_velocity": [180, 160, 190, 200, 175, 170, 185, 195],
        "target_velocity": [180, 180, 190, 190, 175, 175, 185, 185],
        "elapsed_hours": [2, 4, 2.5, 5, 1.5, 3, 3.5, 6.5],
        "cumulative_earnings": [360, 720, 475, 950, 262.5, 525, 647.5, 1179]
    })

    return {
        "drivers": drivers,
        "driver_goals": driver_goals,
        "trips": trips,
        "earnings_velocity": earnings_velocity
    }