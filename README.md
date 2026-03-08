# driver_pulse

## Run All Services (One Command)

From `driver_pulse` root, start Python API + Node server + React client:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

Stop all three (ports `8000`, `5000`, `5173`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-dev.ps1
```