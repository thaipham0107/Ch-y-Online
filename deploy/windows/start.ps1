# Chạy Online: khởi động game + đường hầm Cloudflare (link công khai) chỉ bằng một lần bấm.
# Được gọi từ chay-online.bat. Tương thích Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$logs = Join-Path $root 'logs'; New-Item -ItemType Directory -Force -Path $logs | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Fail($msg) { Write-Host ''; Write-Host "LỖI: $msg" -ForegroundColor Red; Write-Host ''; Read-Host 'Nhấn Enter để đóng'; exit 1 }
function Info($msg) { Write-Host $msg -ForegroundColor Cyan }
function EnvValue($key) {
  $f = Join-Path $root '.env'; if (-not (Test-Path $f)) { return '' }
  foreach ($l in [IO.File]::ReadAllLines($f)) {
    if ($l -match "^\s*$key\s*=\s*(.*)$") { return $matches[1].Trim().Trim('"') }
  }
  return ''
}
function StopPidFile($name) {
  $f = Join-Path $logs "$name.pid"
  if (Test-Path $f) { $p = (Get-Content $f -ErrorAction SilentlyContinue | Select-Object -First 1); if ($p) { Stop-Process -Id ([int]$p) -Force -ErrorAction SilentlyContinue } ; Remove-Item $f -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Write-Host '=== CHẠY ONLINE ===' -ForegroundColor Yellow

# 1. Node
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { Fail 'Chưa cài Node.js. Tải bản LTS tại https://nodejs.org rồi chạy lại.' }
$ver = (& node -v).TrimStart('v').Split('.')
if ([int]$ver[0] -lt 22 -or ([int]$ver[0] -eq 22 -and [int]$ver[1] -lt 5)) { Fail "Node $($ver -join '.') quá cũ, cần 22.5 trở lên. Tải bản mới tại https://nodejs.org" }
$node = $nodeCmd.Source

# 2. Thư viện
if (-not (Test-Path (Join-Path $root 'node_modules\express'))) {
  Info 'Đang cài thư viện (lần đầu, mất khoảng 1 phút)...'
  & npm.cmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm install thất bại. Kiểm tra kết nối mạng.' }
}

# 3. File cấu hình .env + tài khoản quản trị
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $root '.env.example') $envFile }
$hasAdmin = (EnvValue 'ADMIN_USER') -ne '' -or (Test-Path (Join-Path $root 'admin.config.json'))
if (-not $hasAdmin) {
  Write-Host ''
  Info 'Thiết lập tài khoản QUẢN TRỊ (trang /admin/). Bỏ trống tên để bỏ qua (trang quản trị sẽ tắt).'
  $au = Read-Host 'Tên đăng nhập quản trị'
  if ($au) {
    while ($true) {
      $sec = Read-Host 'Mật khẩu quản trị (tối thiểu 10 ký tự, không chứa dấu ")' -AsSecureString
      $pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
      if ($pw.Length -ge 10 -and $pw -notmatch '["\r\n]') { break }
      Write-Host 'Mật khẩu chưa hợp lệ, nhập lại.' -ForegroundColor Yellow
    }
    $txt = [IO.File]::ReadAllText($envFile)
    $txt = $txt.TrimEnd() + "`r`nADMIN_USER=$au`r`nADMIN_PASS=`"$pw`"`r`n"
    [IO.File]::WriteAllText($envFile, $txt, $utf8)
    Info 'Đã lưu vào file .env (chỉ nằm trên máy này).'
  }
}
$port = EnvValue 'PORT'; if (-not $port) { $port = '3000' }
$token = EnvValue 'TUNNEL_TOKEN'
if ($token -and (EnvValue 'BASE_URL') -match 'duckdns\.org') {
  Fail "Tên miền DuckDNS không dùng được với Cloudflare Tunnel (DuckDNS không cho chuyển DNS về Cloudflare).`nCách 1: xóa dòng TUNNEL_TOKEN trong .env để dùng link tạm trycloudflare.com.`nCách 2: dùng VPS (xem DEPLOY.md, mục D: VPS + DuckDNS)."
}

# 4. cloudflared (tự tải nếu chưa có)
$cf = $null
$c = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($c) { $cf = $c.Source }
$local = Join-Path $root 'tools\bin\cloudflared.exe'
if (-not $cf -and (Test-Path $local)) { $cf = $local }
if (-not $cf) {
  Info 'Đang tải cloudflared từ Cloudflare (một lần)...'
  New-Item -ItemType Directory -Force -Path (Split-Path $local) | Out-Null
  $arch = 'amd64'; if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' } elseif (-not [Environment]::Is64BitOperatingSystem) { $arch = '386' }
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe"
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri $url -OutFile $local -UseBasicParsing } catch { Fail "Không tải được cloudflared: $($_.Exception.Message)`nTải tay từ $url rồi đặt vào tools\bin\cloudflared.exe" }
  if ((Get-Item $local).Length -lt 10MB) { Remove-Item $local -Force; Fail 'File cloudflared tải về không hợp lệ.' }
  $cf = $local
}

# 5. Dừng bản đang chạy (nếu có) rồi khởi động lại
function PortOwner($p) {
  try { $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop | Select-Object -First 1; if ($c) { return Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue } } catch { }
  return $null
}
function IsOurGame($p) { try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$p/healthz" -TimeoutSec 2; return [bool]$h.ok } catch { return $false } }
StopPidFile 'game'; StopPidFile 'tunnel'
Start-Sleep -Milliseconds 500
$owner = PortOwner $port
if ($owner) {
  if ((IsOurGame $port) -and $owner.ProcessName -eq 'node') {
    Info "Phát hiện bản Chạy Online cũ đang chiếm cổng $port (PID $($owner.Id)), đang tắt để chạy lại..."
    Stop-Process -Id $owner.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  } elseif ($token) {
    Fail "Cổng $port đang bị '$($owner.ProcessName)' (PID $($owner.Id)) dùng, mà tên miền cố định Cloudflare của bạn trỏ về cổng này.`nHãy tắt chương trình đó (hoặc đổi cổng trong Public Hostname của Cloudflare rồi sửa PORT trong .env)."
  } else {
    $new = 0
    for ($q = [int]$port + 1; $q -le [int]$port + 30; $q++) { if (-not (PortOwner $q)) { $new = $q; break } }
    if ($new -eq 0) { Fail "Cổng $port đang bị '$($owner.ProcessName)' (PID $($owner.Id)) dùng và không tìm được cổng trống gần đó." }
    Write-Host "Cổng $port đang bị '$($owner.ProcessName)' (PID $($owner.Id)) dùng, chuyển sang cổng $new." -ForegroundColor Yellow
    $port = "$new"; $env:PORT = $port
  }
}
Info 'Đang khởi động game...'
$gameOut = Join-Path $logs 'game.log'; $gameErr = Join-Path $logs 'game.err.log'
$game = Start-Process -FilePath $node -ArgumentList @('--env-file-if-exists=.env', 'server.js') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $gameOut -RedirectStandardError $gameErr -PassThru
Set-Content -Path (Join-Path $logs 'game.pid') -Value $game.Id
$up = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if ($game.HasExited) { break }
  try { $h = Invoke-RestMethod -Uri "http://127.0.0.1:$port/healthz" -TimeoutSec 2; if ($h.ok) { $up = $true; break } } catch { }
}
if (-not $up) { $tail = ''; if (Test-Path $gameErr) { $tail = (Get-Content $gameErr -Tail 8) -join "`n" }; $o = PortOwner $port; $who = ''; if ($o) { $who = "`nCổng $port đang bị '$($o.ProcessName)' (PID $($o.Id)) dùng." }; Fail "Game không khởi động được.$who`n$tail`nXem logs\game.err.log" }
Info "Game đã chạy tại http://localhost:$port"

# 6. Đường hầm Cloudflare
$tunOut = Join-Path $logs 'tunnel.out.log'; $tunErr = Join-Path $logs 'tunnel.log'
Remove-Item $tunOut, $tunErr -Force -ErrorAction SilentlyContinue
if ($token) {
  Info 'Đang mở đường hầm Cloudflare (tên miền cố định theo TUNNEL_TOKEN)...'
  $args2 = @('tunnel', '--no-autoupdate', 'run', '--token', $token)
} else {
  Info 'Đang mở đường hầm Cloudflare (link tạm thời trycloudflare.com)...'
  $args2 = @('tunnel', '--no-autoupdate', '--url', "http://127.0.0.1:$port")
}
$tun = Start-Process -FilePath $cf -ArgumentList $args2 -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $tunOut -RedirectStandardError $tunErr -PassThru
Set-Content -Path (Join-Path $logs 'tunnel.pid') -Value $tun.Id

$public = ''
if ($token) {
  $public = EnvValue 'BASE_URL'
  Start-Sleep -Seconds 6
  if ($tun.HasExited) { Fail 'cloudflared thoát ngay. Kiểm tra TUNNEL_TOKEN trong .env và logs\tunnel.log' }
} else {
  for ($i = 0; $i -lt 45 -and -not $public; $i++) {
    Start-Sleep -Seconds 1
    if ($tun.HasExited) { break }
    if (Test-Path $tunErr) { foreach ($mm in [regex]::Matches((Get-Content $tunErr -Raw -ErrorAction SilentlyContinue), 'https://[a-z0-9-]+\.trycloudflare\.com')) { if ($mm.Value -ne 'https://api.trycloudflare.com') { $public = $mm.Value; break } } }
  }
  if (-not $public) { Fail 'Không lấy được link công khai từ Cloudflare. Xem logs\tunnel.log (có thể mạng chặn cloudflared).' }
}
[IO.File]::WriteAllText((Join-Path $logs 'public-url.txt'), $public, $utf8)
try { Set-Clipboard -Value $public } catch { }

Write-Host ''
Write-Host '==============================================' -ForegroundColor Green
Write-Host ' ĐÃ CHẠY! Gửi link này cho người chơi:' -ForegroundColor Green
Write-Host "   $public" -ForegroundColor White
Write-Host ''
Write-Host " Trên máy này:  http://localhost:$port"
Write-Host " Trang quản trị: $public/admin/"
Write-Host ' (link đã được chép vào clipboard, cũng lưu ở logs\public-url.txt)'
Write-Host '==============================================' -ForegroundColor Green
if (-not $token) { Write-Host 'Lưu ý: link trycloudflare.com ĐỔI mỗi lần khởi động lại và Cloudflare không đảm bảo hoạt động; chỉ để thử nghiệm.' -ForegroundColor Yellow }
Write-Host 'Có thể đóng cửa sổ này, game vẫn chạy nền. Dừng hẳn: bấm đúp chay-online-stop.bat'
Info 'Đang mở trình duyệt (chờ vài giây để link có hiệu lực)...'
Start-Sleep -Seconds 5
Start-Process $public
Write-Host ''
Read-Host 'Nhấn Enter để đóng cửa sổ này'
