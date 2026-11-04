Stop-ScheduledTask -TaskName 'ChayOnline' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Unregister-ScheduledTask -TaskName 'ChayOnline' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host "Đã gỡ tác vụ ChayOnline (dữ liệu trong thư mục data được giữ nguyên)."
