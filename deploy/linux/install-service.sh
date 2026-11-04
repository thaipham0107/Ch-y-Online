#!/usr/bin/env bash
# Cài Chạy Online thành dịch vụ systemd (không cần Docker). Chạy: sudo bash deploy/linux/install-service.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_USER="${SUDO_USER:-$(whoami)}"
NODE="$(command -v node)"
sed -e "s|__ROOT__|$ROOT|g" -e "s|__USER__|$RUN_USER|g" -e "s|__NODE__|$NODE|g" "$ROOT/deploy/linux/chay-online.service" > /etc/systemd/system/chay-online.service
systemctl daemon-reload
systemctl enable --now chay-online
echo "Đã cài dịch vụ chay-online. Xem nhật ký: journalctl -u chay-online -f"
echo "Kiểm tra: curl http://localhost:3000/healthz"
