#!/usr/bin/env bash
# Cài Chạy Online thành LaunchAgent của macOS (tự chạy khi đăng nhập, tự khởi động lại khi lỗi). Chạy: bash deploy/macos/install-service.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; NODE="$(command -v node)"; mkdir -p "$ROOT/logs" "$HOME/Library/LaunchAgents"
P="$HOME/Library/LaunchAgents/vn.chayonline.plist"
cat > "$P" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>vn.chayonline</string>
<key>ProgramArguments</key><array><string>$NODE</string><string>--env-file-if-exists=.env</string><string>server.js</string></array>
<key>WorkingDirectory</key><string>$ROOT</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>$ROOT/logs/service.log</string><key>StandardErrorPath</key><string>$ROOT/logs/service.log</string>
</dict></plist>
PLIST
launchctl unload "$P" 2>/dev/null || true; launchctl load "$P"
echo "Đã cài. Nhật ký: $ROOT/logs/service.log   Kiểm tra: curl http://localhost:3000/healthz"
echo "Gỡ: launchctl unload $P && rm $P"
