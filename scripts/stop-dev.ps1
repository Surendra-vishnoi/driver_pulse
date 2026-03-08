$ErrorActionPreference = 'Stop'

$stopped = $false
foreach ($port in @(8000, 5000, 5173)) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn) {
    Stop-Process -Id $conn.OwningProcess -Force
    Write-Host "Stopped process $($conn.OwningProcess) on port $port"
    $stopped = $true
  }
}

if (-not $stopped) {
  Write-Host 'No matching dev services were listening on ports 8000, 5000, or 5173.'
}
