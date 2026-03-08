$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonApiDir = Join-Path $repoRoot 'pyth/driver-pulse'
$serverDir = Join-Path $repoRoot 'server'
$clientDir = Join-Path $repoRoot 'client'
$logsDir = Join-Path $repoRoot 'scripts/logs'

if (-not (Test-Path $logsDir)) {
  New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$pythonCandidates = @(
  (Join-Path $repoRoot 'pyth/.venv/Scripts/python.exe'),
  (Join-Path $repoRoot '../pyth/.venv/Scripts/python.exe')
)

$pythonExe = $null
foreach ($candidate in $pythonCandidates) {
  if (Test-Path $candidate) {
    $pythonExe = (Resolve-Path $candidate).Path
    break
  }
}

if (-not $pythonExe) {
  $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCmd) {
    $pythonExe = $pythonCmd.Source
  }
}

if (-not $pythonExe) {
  throw 'Python executable not found. Create a venv at driver_pulse/pyth/.venv or ensure python is on PATH.'
}

$pythonApi = Join-Path $pythonApiDir 'api.py'
if (-not (Test-Path $pythonApi)) {
  throw "Python API file not found at $pythonApi"
}

Write-Host "Using Python: $pythonExe"

# Free common ports before starting new sessions.
foreach ($port in @(8000, 5000, 5173)) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "Stopped process $($conn.OwningProcess) on port $port"
  }
}

$pythonOut = Join-Path $logsDir 'python-api.out.log'
$pythonErr = Join-Path $logsDir 'python-api.err.log'
$serverOut = Join-Path $logsDir 'node-server.out.log'
$serverErr = Join-Path $logsDir 'node-server.err.log'
$clientOut = Join-Path $logsDir 'vite-client.out.log'
$clientErr = Join-Path $logsDir 'vite-client.err.log'

$pythonProc = Start-Process -FilePath $pythonExe -ArgumentList @('api.py') -WorkingDirectory $pythonApiDir -RedirectStandardOutput $pythonOut -RedirectStandardError $pythonErr -PassThru
$serverProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $serverDir -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr -PassThru
$clientProc = Start-Process -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $clientDir -RedirectStandardOutput $clientOut -RedirectStandardError $clientErr -PassThru

Write-Host 'Started services:'
Write-Host " - Python API PID: $($pythonProc.Id)"
Write-Host " - Node server PID: $($serverProc.Id)"
Write-Host " - React client PID: $($clientProc.Id)"
Write-Host ' - Python API: http://127.0.0.1:8000'
Write-Host ' - Node server: expected on http://127.0.0.1:5000'
Write-Host ' - React client: expected on http://127.0.0.1:5173'
Write-Host "Logs: $logsDir"
