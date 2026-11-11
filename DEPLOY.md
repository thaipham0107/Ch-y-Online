# Triển khai Chạy Online

## Cloudflare + Git (cách chính)
Cloudflare tự lấy mã từ nhánh Git của bạn, build và triển khai mỗi lần bạn đẩy mã. Không cần VPS, Docker hay container. Phần cấu hình trong repo đã sẵn (`wrangler.jsonc`, `worker/`, `scripts/build-assets.mjs`, `.nvmrc`); bạn chỉ cần cấu hình phía Cloudflare:

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Import a repository** (Workers Builds) → kết nối GitHub, chọn repo `Ch-y-Online` và **nhánh** muốn triển khai.
2. Tên Worker phải là **`chay-online`** (khớp `name` trong `wrangler.jsonc`; nếu muốn tên khác, sửa `name` rồi đẩy mã).
3. **Build command**: để trống (Wrangler tự chạy `node scripts/build-assets.mjs`). **Deploy command**: `npx wrangler deploy`. **Root directory**: để trống. Nếu có ô biến môi trường lúc build, đặt `NODE_VERSION=22`.
4. Lưu và đẩy một commit lên nhánh đó (hoặc bấm Retry build). Lần đầu Cloudflare tạo Durable Object cho dữ liệu.
5. Worker → **Settings → Variables and Secrets** → thêm **Secret**: `ADMIN_USER`, `ADMIN_PASS` (bắt buộc nếu muốn dùng `/admin/`), và nếu dùng Strava: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`. (Secret không bị ghi đè khi triển khai lại.)
6. Mở địa chỉ `https://chay-online.<tài-khoản>.workers.dev`. Kiểm tra `/healthz`, chơi thử, mở `/admin/`.
7. Tên miền riêng: Worker → **Settings → Domains & Routes → Add → Custom domain** (tên miền phải do Cloudflare quản lý DNS; DuckDNS không dùng được). Địa chỉ công khai (`BASE_URL`, dùng cho Strava) tự lấy từ địa chỉ người dùng truy cập, không phải cấu hình.

Lưu ý:
- Mọi thay đổi trong `wrangler.jsonc` (biến `vars`, R2...) là nguồn sự thật; biến thường đặt trên dashboard sẽ bị ghi đè khi triển khai lại, nên chỉ đặt **Secret** trên dashboard.
- Ảnh bản đồ: trên `*.workers.dev` Cache API không hoạt động; dùng tên miền riêng hoặc bật R2 (bỏ chú thích `r2_buckets` trong `wrangler.jsonc` sau khi tạo bucket `chay-tiles`) để server lưu ảnh một lần.
- Dữ liệu nằm trong Durable Object (SQLite) của Cloudflare; chưa có công cụ xuất/sao lưu trong dự án.
- Một Durable Object phục vụ toàn bộ API và WebSocket, phù hợp từ vài trăm người chơi đồng thời; WebSocket đang mở được tính phí thời gian chạy, hãy xem hạn mức/giá hiện hành của Cloudflare.
- Chạy thử tại chỗ bản Cloudflare: `printf 'ADMIN_USER=admin\nADMIN_PASS=matkhau123\nSTRAVA_MOCK=1\n' > .dev.vars && npm run dev:worker` rồi mở http://localhost:8787.

---
Các cách dưới đây là phương án khác (chạy trên máy cá nhân/Docker), không cần cho luồng Cloudflare + Git.

Hai phương án phụ: **C. chạy trên máy cá nhân + Cloudflare Tunnel (không Docker, để thử nghiệm)** và **B. máy chủ Node/Docker**. Cả hai dùng chung mã nguồn và `core.js` với bản Cloudflare.

## C. Máy cá nhân + Cloudflare Tunnel, chạy như dịch vụ nền (không Docker)
Game chạy trên máy của bạn bằng Node; **cloudflared** mở một đường hầm ra ngoài tới Cloudflare nên **không phải mở cổng router**, IP nhà không lộ, có HTTPS miễn phí. Dữ liệu nằm ở thư mục `data/` trên máy bạn.

### Cách nhanh nhất trên Windows: bấm đúp `chay-online.bat`
File này làm hết: kiểm tra Node 22.5+, cài thư viện, hỏi tài khoản quản trị lần đầu (lưu vào `.env`), tự tải cloudflared, khởi động game ở nền, mở link công khai `trycloudflare.com`, chép link vào clipboard và mở trình duyệt. Có thể đóng cửa sổ, game vẫn chạy; dừng bằng `chay-online-stop.bat`. Muốn tên miền cố định: thêm `TUNNEL_TOKEN=...` và `BASE_URL=https://...` vào `.env` (lấy token ở bước "Cách ổn định" bên dưới), lần chạy sau sẽ dùng tên miền đó. Muốn tự chạy khi bật máy: dùng `install-service.ps1` (bước 3). Nhật ký ở thư mục `logs\`.

Các bước thủ công tương ứng:

### 1. Chuẩn bị
- Cài **Node 22.5 trở lên** (nodejs.org, bản LTS) và **cloudflared** (developers.cloudflare.com → Cloudflare One → Connections → Downloads).
- Lấy mã nguồn (giải nén gói hoặc `git clone`), rồi trong thư mục dự án:
  ```bash
  npm install --omit=dev
  copy .env.example .env        # macOS/Linux: cp .env.example .env
  ```
- Mở `.env`, đặt `ADMIN_USER`, `ADMIN_PASS` (mật khẩu dài, vì `/admin/` sẽ ra Internet). Các dòng khác để mặc định.
- Kiểm tra: `npm run doctor`, rồi chạy thử `npm start` và mở http://localhost:3000.

### 2. Đưa ra Internet
**Cách nhanh để thử (không cần tên miền hay tài khoản):**
```bash
cloudflared tunnel --url http://localhost:3000
```
Lệnh in địa chỉ dạng `https://xxxx.trycloudflare.com`: gửi địa chỉ này cho bạn bè. Địa chỉ **đổi mỗi lần chạy lại** và Cloudflare không đảm bảo hoạt động; chưa dùng được Strava (cần tên miền cố định).

**Cách ổn định (cần một tên miền đã thêm vào Cloudflare):**
1. dash.cloudflare.com → Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared, đặt tên, **sao chép token**.
2. Tab Public Hostname: Hostname `chay.ten-mien-cua-ban.com`, Service `HTTP` → `localhost:3000`.
3. Cài cloudflared thành dịch vụ (Windows: PowerShell chạy bằng Administrator; macOS/Linux: thêm `sudo`):
   ```bash
   cloudflared service install <TOKEN>
   ```
4. Trong `.env` đặt `BASE_URL=https://chay.ten-mien-cua-ban.com`, rồi khởi động lại game (bước 3).

### 3. Chạy game như dịch vụ nền (tự bật cùng máy, tự khởi động lại khi lỗi)
- **Windows** (PowerShell, Run as Administrator, trong thư mục dự án):
  `powershell -ExecutionPolicy Bypass -File deploy\windows\install-service.ps1`
  (tạo tác vụ `ChayOnline` chạy khi khởi động; nhật ký ở `logs\service.log`; gỡ bằng `deploy\windows\uninstall-service.ps1`).
- **Linux**: `sudo bash deploy/linux/install-service.sh` (dịch vụ systemd `chay-online`, xem nhật ký `journalctl -u chay-online -f`).
- **macOS**: `bash deploy/macos/install-service.sh` (LaunchAgent, chạy khi bạn đăng nhập).
- Kiểm tra: `curl http://localhost:3000/healthz`, rồi mở địa chỉ công khai từ điện thoại (tắt Wi‑Fi, dùng 4G) để thử đúng như người ngoài.

### 4. Nên làm
- **Bảo vệ `/admin/`**: Zero Trust → Access → Applications → Add → Self-hosted, đường dẫn `chay.ten-mien-cua-ban.com/admin*`, chỉ cho email của bạn.
- Đặt máy **không tự ngủ** khi cắm điện; máy tắt hoặc mất mạng thì game ngừng.
- **Sao lưu** thư mục `data/` (dừng game rồi chép `chay.db*`).
- Trang quản trị chỉ là mật khẩu; đừng dùng chung mật khẩu với nơi khác. Xem thêm "Lưu ý chung" bên dưới.
- Lưu lượng ảnh bản đồ cũng đi qua đường hầm. Với thử nghiệm nhỏ thì ổn; điều khoản của Cloudflare về nội dung không phải HTML có thể thay đổi, bạn nên đọc điều khoản hiện hành trước khi mở cho đông người.
- Khi chuyển sang VPS: chép thư mục `data/` sang máy mới là xong.



## B. Máy chủ Node / Docker
Yêu cầu: máy chủ có **Node 22.5+** (hoặc Docker), tên miền có HTTPS (Strava, định vị GPS và cookie an toàn đều cần HTTPS).

### Cách 1: Docker (khuyên dùng)
```bash
cp .env.example .env      # sửa BASE_URL=https://ten-mien-cua-ban, ADMIN_USER, ADMIN_PASS, khóa Strava
docker compose up -d --build
curl localhost:3000/healthz
```
Dữ liệu (SQLite, ảnh bản đồ) nằm ở `./data`, **hãy sao lưu thư mục này**.

### Cách 2: chạy trực tiếp
```bash
npm ci --omit=dev
cp .env.example .env      # như trên
npm start                 # hoặc dùng pm2 / systemd
```

### Đặt sau HTTPS
Dùng Caddy hoặc Nginx làm reverse proxy tới cổng 3000, bắt buộc chuyển tiếp WebSocket (`/ws`) và header `X-Forwarded-For/Proto`. Ví dụ Caddy: `ten-mien.com { reverse_proxy localhost:3000 }`.

### Kiểm tra sau khi chạy
1. Mở `https://ten-mien/`, chơi thử chế độ khách, mở 2 tab để thấy nhau.
2. `https://ten-mien/admin/` đăng nhập quản trị (cấu hình qua `ADMIN_USER`/`ADMIN_PASS`).
3. Strava: `npm run check:strava` rồi vào Hồ sơ → Kết nối Strava (ô Callback Domain điền đúng tên miền).
4. Chế độ vệ tinh/2D: server tự lưu ảnh vào `data/tiles` (xem `/api/tiles/stats`).

## Lưu ý chung trước khi mở công khai
- Nguồn ảnh OpenStreetMap, Esri, Nominatim, Valhalla là dịch vụ công cộng có giới hạn và điều khoản riêng. Lưu lượng thật nên dùng nhà cung cấp có giấy phép (`TILES_ROAD`, `TILES_SAT`, `GEO_SEARCH_URL`, `GEO_ROUTE_URL`).
- Đường chạy dùng GPX tự vẽ trong Komoot, chưa phải GPX chính thức của ban tổ chức giải.
- Trang quản trị có theo dõi truy cập (IP băm, mã thiết bị): nên có chính sách quyền riêng tư.
- Một tiến trình Node, một file SQLite: phù hợp vài trăm người chơi đồng thời; muốn lớn hơn cần tách lưu trữ.

## Kiểm tra tự động (CI)
`.github/workflows/ci.yml` chạy trên mọi lần đẩy mã và pull request: kiểm cú pháp, chạy server Node thật rồi kiểm thử đầu-cuối (`tools/smoke.mjs`, `tools/test-flush.mjs`), dựng thử bản Cloudflare (`wrangler deploy --dry-run`). Không cần khóa. Việc triển khai do Cloudflare đảm nhiệm (mục "Cloudflare + Git" ở đầu tài liệu).
