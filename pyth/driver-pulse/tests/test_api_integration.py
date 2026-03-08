# tests/test_api_integration.py
# ─────────────────────────────────────────────────────────────────────────────
# Test API Integration
# Run this after starting the API server to validate functionality
# ─────────────────────────────────────────────────────────────────────────────

import pytest
import requests
import sys
from datetime import datetime

API_URL = "http://127.0.0.1:8000"
TEST_DRIVER_ID = "TEST_DRV_001"

class TestAPIServer:
    """Test FastAPI server endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Check if API server is running"""
        try:
            response = requests.get(f"{API_URL}/health", timeout=2)
            assert response.status_code == 200, "API server not responding"
        except requests.exceptions.ConnectionError:
            pytest.skip("API server not running on http://127.0.0.1:8000")
    
    def test_health_check(self):
        """Test health endpoint"""
        response = requests.get(f"{API_URL}/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data
    
    def test_root(self):
        """Test root endpoint"""
        response = requests.get(f"{API_URL}/")
        assert response.status_code == 200
        data = response.json()
        assert "service" in data
        assert data["status"] == "online"
    
    def test_initialize_driver(self):
        """Test driver initialization"""
        payload = {
            "driver_id": TEST_DRIVER_ID,
            "name": "Test Driver",
            "target_earnings": 1400,
            "shift_duration_hours": 8,
            "current_earnings": 0,
            "current_hours": 0
        }
        
        response = requests.post(f"{API_URL}/drivers", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["driver_id"] == TEST_DRIVER_ID
        assert data["name"] == "Test Driver"
        assert data["target_earnings"] == 1400
        assert data["pace_band"] == "too_early"  # Not enough time elapsed
    
    def test_get_driver(self):
        """Test get driver endpoint"""
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["driver_id"] == TEST_DRIVER_ID
        assert "pace_score" in data
        assert "driver_message" in data
    
    def test_record_trip(self):
        """Test recording a trip"""
        trip_data = {
            "trip_id": "TEST_TRIP_001",
            "trip_earnings": 300,
            "trip_duration_min": 25,
            "fare": 250,
            "surge_multiplier": 1.2,
        }
        
        response = requests.post(
            f"{API_URL}/drivers/{TEST_DRIVER_ID}/trips",
            json=trip_data
        )
        assert response.status_code == 200
        
        metrics = response.json()
        assert metrics["current_earnings"] == 300
        assert metrics["trips_count"] == 1
        assert "projected_earnings" in metrics
    
    def test_record_multiple_trips(self):
        """Test recording multiple trips updates metrics"""
        trips = [
            {"trip_id": "T2", "trip_earnings": 250},
            {"trip_id": "T3", "trip_earnings": 350},
        ]
        
        for trip in trips:
            response = requests.post(
                f"{API_URL}/drivers/{TEST_DRIVER_ID}/trips",
                json=trip
            )
            assert response.status_code == 200
        
        # Check final state
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}")
        data = response.json()
        assert data["trips_count"] == 3  # 1 + 2 new
        assert data["current_earnings"] == 900  # 300 + 250 + 350
    
    def test_get_projection(self):
        """Test getting projected earnings timeline"""
        response = requests.get(
            f"{API_URL}/drivers/{TEST_DRIVER_ID}/projection",
            params={"points": 10}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "timeline" in data
        assert len(data["timeline"]) == 11  # points + 1
        
        # Check structure
        for point in data["timeline"]:
            assert "hour" in point
            assert "projected" in point
            assert "target" in point
    
    def test_get_chart_json(self):
        """Test getting chart.js format data"""
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}/chart.json")
        assert response.status_code == 200
        
        data = response.json()
        assert "datasets" in data
        assert len(data["datasets"]) == 2  # projected + target
        assert "options" in data
    
    def test_get_dashboard_html(self):
        """Test getting HTML dashboard"""
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}/dashboard")
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/html; charset=utf-8"
        assert "<!DOCTYPE html>" in response.text
        assert "Test Driver" in response.text
        assert "TEST_DRV_001" in response.text
    
    def test_get_driver_trips(self):
        """Test getting trip history"""
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}/trips")
        assert response.status_code == 200
        
        data = response.json()
        assert data["driver_id"] == TEST_DRIVER_ID
        assert data["trip_count"] == 3
        assert data["total_earnings"] == 900
        assert "trips" in data
        assert len(data["trips"]) == 3
    
    def test_list_drivers(self):
        """Test listing all drivers"""
        response = requests.get(f"{API_URL}/drivers")
        assert response.status_code == 200
        
        data = response.json()
        assert "drivers" in data
        assert "count" in data
        assert data["count"] >= 1
        
        # Find our test driver
        driver = next((d for d in data["drivers"] if d["driver_id"] == TEST_DRIVER_ID), None)
        assert driver is not None
    
    def test_driver_message_has_content(self):
        """Test that driver message is informative"""
        response = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}")
        data = response.json()
        
        message = data["driver_message"]
        assert len(message) > 20  # Should be substantial
        assert "₹" in message  # Currency symbol
        assert "earned" in message.lower() or "reached" in message.lower()
    
    def test_exported_data_is_valid(self):
        """Test that exported CSV is valid"""
        response = requests.get(f"{API_URL}/export/drivers.csv")
        
        if response.status_code == 200:  # May not exist if no drivers
            lines = response.text.strip().split('\n')
            assert len(lines) >= 2  # Header + at least 1 row
            assert "driver_id" in lines[0]
            assert "pace_score" in lines[0]


# ─────────────────────────────────────────────────────────────────────────────
# Manual Test Function (run outside pytest)
# ─────────────────────────────────────────────────────────────────────────────

def manual_test():
    """Quick manual test without pytest"""
    print("🧪 Testing Driver Pulse API...\n")
    
    try:
        # Test 1: Health
        print("1️⃣  Health check...", end=" ")
        r = requests.get(f"{API_URL}/health")
        assert r.status_code == 200
        print("✅\n")
        
        # Test 2: Initialize driver
        print("2️⃣  Initializing driver...", end=" ")
        r = requests.post(f"{API_URL}/drivers", json={
            "driver_id": TEST_DRIVER_ID + "_manual",
            "name": "Manual Test",
            "target_earnings": 1400,
            "shift_duration_hours": 8,
        })
        assert r.status_code == 200
        print("✅\n")
        
        # Test 3: Record trip
        print("3️⃣  Recording trip...", end=" ")
        r = requests.post(
            f"{API_URL}/drivers/{TEST_DRIVER_ID}_manual/trips",
            json={"trip_id": "MT1", "trip_earnings": 300}
        )
        assert r.status_code == 200
        print("✅\n")
        
        # Test 4: Get projection
        print("4️⃣  Getting projection...", end=" ")
        r = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}_manual/projection")
        assert r.status_code == 200
        print("✅\n")
        
        # Test 5: Get dashboard
        print("5️⃣  Getting dashboard...", end=" ")
        r = requests.get(f"{API_URL}/drivers/{TEST_DRIVER_ID}_manual/dashboard")
        assert r.status_code == 200
        print("✅\n")
        
        print("✅ All tests passed!")
        print(f"\n💡 Access Swagger docs: {API_URL}/docs")
        print(f"💡 View dashboard: {API_URL}/drivers/{TEST_DRIVER_ID}_manual/dashboard")
        
    except requests.exceptions.ConnectionError:
        print("❌ API server not running!")
        print(f"Start it with: python api.py")
        sys.exit(1)
    except AssertionError as e:
        print(f"❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "manual":
        manual_test()
    else:
        # Run with pytest
        pytest.main([__file__, "-v"])
