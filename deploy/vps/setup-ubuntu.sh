#!/usr/bin/env bash
# Cài Chạy Online lên VPS Ubuntu/Debian: Node 22, dịch vụ nền (systemd), Caddy tự cấp HTTPS cho tên miền, tường lửa.
# Dùng (trên VPS, trong thư mục mã nguồn đã chép lên):
#   sudo DOMAIN=chayonline.duckdns.org ADMIN_USER=ten ADMIN_PASS='mat-khau-dai' bash deploy/vps/setup-ubuntu.sh
# Trước khi chạy: tên miền phải trỏ (bản ghi A) về IP công khai của VPS, và cổng 80/443 mở ở nhà cung cấp VPS.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Hãy chạy bằng sudo/root"; exit 1; }
DOMAIN="${DOMAIN:?Thiếu DOMAIN, ví dụ DOMAIN=chayonline.duckdns.org}"
ADMIN_USER="${ADMIN_USER:-}"; ADMIN_PASS="${ADMIN_PASS:-}"
APP_DIR="${APP_DIR:-/opt/chay-online}"; PORT="${PORT:-3000}"; RUN_USER="${RUN_USER:-chay}"
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$SRC/server.js" ] || { echo "Không thấy server.js trong $SRC"; exit 1; }
if [ -z "$ADMIN_PASS" ]; then ADMIN_PASS="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 18)"; GEN_PASS=1; fi
[ -n "$ADMIN_USER" ] || ADMIN_USER=admin

echo "== 1/6 Gói cần thiết"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y; apt-get install -y curl ca-certificates gnupg ufw rsync debian-keyring debian-archive-keyring apt-transport-https

echo "== 2/6 Node.js 22"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "== 3/6 Mã nguồn và dữ liệu ($APP_DIR)"
id "$RUN_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$RUN_USER"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude node_modules --exclude data --exclude .env --exclude logs --exclude .git "$SRC/" "$APP_DIR/"
mkdir -p "$APP_DIR/data"
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund)
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<ENV
PORT=$PORT
BASE_URL=https://$DOMAIN
DATA_DIR=$APP_DIR/data
ADMIN_USER=$ADMIN_USER
ADMIN_PASS="$ADMIN_PASS"
ENV
  chmod 600 "$APP_DIR/.env"
else echo "(giữ nguyên $APP_DIR/.env cũ)"; fi
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"

echo "== 4/6 Dịch vụ nền systemd"
sed -e "s|__ROOT__|$APP_DIR|g" -e "s|__USER__|$RUN_USER|g" -e "s|__NODE__|$(command -v node)|g" "$APP_DIR/deploy/linux/chay-online.service" > /etc/systemd/system/chay-online.service
systemctl daemon-reload; systemctl enable --now chay-online
sleep 2; curl -fsS "http://127.0.0.1:$PORT/healthz" && echo " <- game đang chạy"

echo "== 5/6 Caddy (HTTPS tự động cho $DOMAIN)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y; apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
	encode zstd gzip
	# WebSocket (/ws) được Caddy chuyển tiếp tự động. Xóa tiêu đề CF-Connecting-IP do client gửi để không ai giả mạo IP.
	reverse_proxy 127.0.0.1:$PORT {
		header_up -Cf-Connecting-Ip
	}
}
CADDY
systemctl enable --now caddy; systemctl reload caddy

echo "== 6/6 Tường lửa"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
echo
echo "XONG. Mở https://$DOMAIN (lần đầu Caddy cần vài chục giây để xin chứng chỉ HTTPS)."
echo "Trang quản trị: https://$DOMAIN/admin/   Tài khoản: $ADMIN_USER"
[ "${GEN_PASS:-0}" = 1 ] && echo "Mật khẩu quản trị được tạo ngẫu nhiên (hãy lưu lại, cũng nằm trong $APP_DIR/.env): $ADMIN_PASS"
echo "Xem nhật ký: journalctl -u chay-online -f    Sao lưu dữ liệu: chép thư mục $APP_DIR/data"
