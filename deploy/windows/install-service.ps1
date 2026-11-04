# Cài Chạy Online thành tác vụ nền tự khởi động cùng Windows (không cần Docker).
# Chạy bằng PowerShell "Run as Administrator":  powershell -ExecutionPolicy Bypass -File deploy\windows\install-service.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$node = (Get-Command node -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
$cmd = "/c `"cd /d `"$root`" && `"$node`" --env-file-if-exists=.env server.js >> logs\service.log 2>&1`""
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument $cmd -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'ChayOnline' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'ChayOnline'
Write-Host "Đã cài tác vụ 'ChayOnline' (tự chạy khi bật máy). Nhật ký: $root\logs\service.log"
Write-Host "Kiểm tra: curl http://localhost:3000/healthz"
Write-Host "Dừng: Stop-ScheduledTask ChayOnline   Gỡ: powershell -File deploy\windows\uninstall-service.ps1"
