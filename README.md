# Driver Pulse
## Project Overview

Driver Pulse is a real-time driver earnings tracking and stress monitoring system designed for ride-hailing platforms. The system provides drivers with live pace scoring, projected earnings visualization, and stress detection through edge-processed sensor data.

### Key Features
- **Real-time Earnings Tracking**: Record trips and get instant pace score updates
- **4-Signal Pace Scoring**: Multi-factor analysis (pace ratio, velocity ratio, projection ratio, pressure ratio)
- **Projected Earnings Visualization**: Interactive charts showing earnings trajectory to shift end
- **Edge Sensor Processing**: Audio and accelerometer data processed locally without cloud dependency
- **Stress Detection**: Real-time cabin noise and harsh driving pattern detection
- **Admin Dashboard**: Monitor flagged stress moments across all drivers
- **Offline-First Design**: Complete functionality without internet connectivity
## Run All Services (One Command)

From `driver_pulse` root, start Python API + Node server + React client:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Stop all three (ports `8000`, `5000`, `5173`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```
