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

function Test-ListeningPort {
  param([int]$Port)

  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  return $null -ne $conn
}

function Wait-ForPort {
  param(
    [string]$Name,
    [int]$Port,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-ListeningPort -Port $Port) {
      Write-Host "$Name is listening on port $Port"
      return $true
    }
    Start-Sleep -Milliseconds 500
  }

  return $false
}

function Start-DevProcess {
  param(
    [string]$Name,
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory,
    [string]$StdOutLog,
    [string]$StdErrLog
  )

  $proc = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $StdOutLog -RedirectStandardError $StdErrLog -PassThru
  Start-Sleep -Seconds 2

  if ($proc.HasExited) {
    $errPreview = ''
    if (Test-Path $StdErrLog) {
      $errPreview = (Get-Content $StdErrLog -Tail 30 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
    }

    if (-not $errPreview -and (Test-Path $StdOutLog)) {
      $errPreview = (Get-Content $StdOutLog -Tail 30 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
    }

    throw "$Name exited immediately (exit code $($proc.ExitCode)). Check logs in $logsDir`n$errPreview"
  }

  return $proc
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

$pythonProc = Start-DevProcess -Name 'Python API' -FilePath $pythonExe -ArgumentList @('-X', 'utf8', 'api.py') -WorkingDirectory $pythonApiDir -StdOutLog $pythonOut -StdErrLog $pythonErr
$serverProc = Start-DevProcess -Name 'Node server' -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $serverDir -StdOutLog $serverOut -StdErrLog $serverErr
$clientProc = Start-DevProcess -Name 'React client' -FilePath 'npm.cmd' -ArgumentList @('run', 'dev') -WorkingDirectory $clientDir -StdOutLog $clientOut -StdErrLog $clientErr

$pythonReady = Wait-ForPort -Name 'Python API' -Port 8000
$serverReady = Wait-ForPort -Name 'Node server' -Port 5000
$clientReady = Wait-ForPort -Name 'React client' -Port 5173

Write-Host 'Started services:'
Write-Host " - Python API PID: $($pythonProc.Id)"
Write-Host " - Node server PID: $($serverProc.Id)"
Write-Host " - React client PID: $($clientProc.Id)"
Write-Host ' - Python API: http://127.0.0.1:8000'
Write-Host ' - Node server: expected on http://127.0.0.1:5000'
Write-Host ' - React client: expected on http://127.0.0.1:5173'
Write-Host "Logs: $logsDir"

if (-not ($pythonReady -and $serverReady -and $clientReady)) {
  Write-Warning 'One or more services did not become ready on their expected ports. Check logs for details.'
}
