# Dừng game + đường hầm Cloudflare do chay-online.bat khởi động.
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$logs = Join-Path $root 'logs'
foreach ($n in 'game', 'tunnel') {
  $f = Join-Path $logs "$n.pid"
  if (Test-Path $f) { $p = Get-Content $f | Select-Object -First 1; if ($p) { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue }; Remove-Item $f -Force -ErrorAction SilentlyContinue }
}
# phòng khi file pid bị mất: dừng theo dòng lệnh
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ($_.Name -eq 'node.exe' -and $_.CommandLine -match 'server\.js' -and $_.CommandLine -match [regex]::Escape($root)) -or ($_.Name -eq 'cloudflared.exe' -and $_.CommandLine -match 'tunnel') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host 'Đã dừng Chạy Online và đường hầm Cloudflare.' -ForegroundColor Green
Start-Sleep -Seconds 2
