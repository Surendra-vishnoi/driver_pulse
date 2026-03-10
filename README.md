# Driver Pulse: Team 16

**Demo Video:** [https://www.youtube.com/watch?v=2TvFm59YdVs&feature=youtu.be](https://www.youtube.com/watch?v=2TvFm59YdVs&feature=youtu.be)
**🌐 Live Application:** [https://driver-pulse-n8vq.onrender.com](https://driver-pulse-n8vq.onrender.com)
**Note:** the combined stack (Python API + Node + React) can take a minute or two to boot on first run; please be patient if endpoints are not immediately available.
For the best experience while testing the project:

- Use **Driver ID:** `DRV188`
- Set the **target:** `1500`

**Demo Video:** [https://www.youtube.com/watch?v=2TvFm59YdVs&feature=youtu.be](https://www.youtube.com/watch?v=2TvFm59YdVs&feature=youtu.be)
## Testing Configuration

This configuration is recommended because the dataset for `DRV188` contains richer activity, which helps demonstrate the platform features more effectively.

> Note: The system works with other drivers as well, but this setup provides more meaningful results during demo/testing.

---
## Project Overview

Driver Pulse is a real-time driver earnings tracking and stress monitoring system designed for ride-hailing platforms. The system provides drivers with live pace scoring, projected earnings visualization, and stress detection through edge-processed sensor data.


| Component | Responsibility |
|-----------|----------------|
| **Python API** (FastAPI) | Pace scoring, projection, data pipeline & offline processing
| **Node/Express server** | Proxy to Python API, MongoDB storage, flag-engine analytics, static React hosting
| **React client** | Driver dashboard, admin view, sensor alerts (simulated), offline‑first UI
| **Data pipeline** (pyth/driver-pulse) | Batch/stream processing of historical data for analytics
| **Flag engine** (server/flagEngine.js) | Edge‑like sensor fusion and stress flagging for offline datasets

Key differentiators: real‑time pace scoring with 4‑signal model, edge sensor processing without cloud, offline‑first design, and a full admin dashboard for flagged events.

---

### Key Features
- **Real-time Earnings Tracking**: Record trips and get instant pace score updates
- **4-Signal Pace Scoring**: Multi-factor analysis (pace ratio, velocity ratio, projection ratio, pressure ratio)
- **Projected Earnings Visualization**: Interactive charts showing earnings trajectory to shift end
- **Edge Sensor Processing**: Audio and accelerometer data processed locally without cloud dependency
- **Stress Detection**: Real-time cabin noise and harsh driving pattern detection
- **Admin Dashboard**: Monitor flagged stress moments across all drivers
- **Offline-First Design**: Complete functionality without internet connectivity


## Deployment & Production

- The current public URL is deployed on Render at [driver-pulse-n8vq.onrender.com](https://driver-pulse-n8vq.onrender.com).
  **Note:** the combined stack (Python API + Node + React) can take a minute or two to boot on first run; please be patient if endpoints are not immediately available.
- Deployment uses a Dockerfile combining Node service + built React app; Python API runs separately (e.g. via `uvicorn` container or Render web service).
- For production, ensure `MONGO_URI` points to a managed database and secure environment variables.

---


## 🛠️ Setup & Development

### Prerequisites

- Node.js 18+
- Python 3.11+ (venv recommended)
- MongoDB (optional; used only by Node server for ride summaries)
- `git` to clone repo

### Local development

```powershell
# from workspace root
# 1. Install Python deps
cd pyth/driver-pulse
python -m venv venv
& venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Install Node deps
cd ..\..\server
npm install
cd ..\client
npm install
npm run build      # produces dist/ for static hosting

# 3. Start all services (one command)
cd ..\..
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1

# 4. Stop when done
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```

- Python API: http://127.0.0.1:8000
- Node server:  http://127.0.0.1:5000 (proxies to Python)
- React client: http://127.0.0.1:5000/ (served by Node)

### Configuration

Environment variables (see `server/.env.example` if added):

- `PORT` – Node server port (default 5000)
- `MONGO_URI` – MongoDB connection string (falls back to local docker/machine)
- `PYTHON_API_BASE_URL` – address of FastAPI instance (default http://127.0.0.1:8000)

### Running the API alone

```powershell
# from pyth/driver-pulse
& venv\Scripts\Activate.ps1
python api.py              # starts FastAPI (uvicorn)
```

### Python pipeline CLI (batch/edge)

```powershell
python main.py --data_dir /path/to/data --batch --chunk_size 50
```

Outputs are written to `pyth/driver-pulse/data/processed` as CSV files.

### React client local workflow

```bash
cd client
npm run dev             # Vite development server on 5173 (bypass Node)
```

Note: the configuration in `src/utils/mockData.js` mimics sensor streams; replace with real endpoints for integration.

---

## Trade‑offs & Hackathon Decisions

| Criterion | Choice & Rationale |
|-----------|--------------------|
| Privacy | Edge processing, no audio upload by default; MongoDB optional; personal data limited to driver ID and earnings. |
| Edge vs Cloud | Core logic runs on edge (Python CLI or Node flag engine) to support disconnected scenarios; cloud option is a stateless proxy and dashboard. |
| System Design | Lightweight services with in‑memory state; micro‑kernelling allows swapping components (e.g. replace pace scoring with ML model). |
| Architecture | Modular pipeline separation; API, server, client each in own subfolder. Data flow orchestrated by FastAPI; Node acts as gateway. |
| Offline Ability | Entire application, including sensor scoring and dashboards, can run without network; Node proxy can be omitted. Local CSVs handle persistent data. |
| Hackathon Judgement | Prioritized privacy (no sensor upload), real‑time responsiveness (in‑memory scoring), and demonstrable offline functionality. Rapid prototyping on React + Vite, Python + FastAPI, Node + Express. |

---

