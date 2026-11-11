# Triển khai Chạy Online

Có ba cách: **C. chạy trên máy cá nhân + Cloudflare Tunnel (không Docker, để thử nghiệm)**, **A. Cloudflare Workers (không container)** và **B. VPS Node/Docker**. Cả ba dùng chung mã nguồn và `core.js`.

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



## A. Cloudflare Workers + Durable Object (không container)
Kiến trúc: file tĩnh (`public/`) do Cloudflare phục vụ; `/api`, `/auth`, `/ws` chạy trong một **Durable Object** có SQLite riêng (lưu tài khoản, lịch sử, giải đấu, thống kê); `/tiles` là Worker lưu ảnh bản đồ một lần (R2 nếu bật, nếu không thì cache biên). Không cần server, Docker hay CSDL ngoài.

### Các bước
1. Tạo tài khoản Cloudflare (dash.cloudflare.com). Trên máy của bạn cần Node 22+ và Git.
2. Lấy mã nguồn, cài thư viện, đăng nhập:
   ```bash
   npm install
   npx wrangler login
   ```
3. Mở `wrangler.jsonc`, sửa `BASE_URL` thành địa chỉ thật. Chưa có tên miền riêng thì tạm dùng `https://chay-online.<tên-tài-khoản>.workers.dev` (tên chính xác hiện ra sau lần deploy đầu; deploy lại sau khi sửa).
4. Đặt bí mật (không ghi vào file):
   ```bash
   npx wrangler secret put ADMIN_USER
   npx wrangler secret put ADMIN_PASS
   # nếu dùng Strava:
   npx wrangler secret put STRAVA_CLIENT_ID
   npx wrangler secret put STRAVA_CLIENT_SECRET
   ```
   (Lệnh `secret put` hỏi bạn tạo Worker mới nếu chưa có: chọn Yes, hoặc chạy bước 5 trước rồi đặt bí mật sau.)
5. Triển khai:
   ```bash
   npm run deploy:worker
   ```
   Wrangler dựng `dist/assets`, tải mã và file tĩnh lên, tạo Durable Object và in địa chỉ Worker.
6. Kiểm tra: `curl https://<địa-chỉ>/healthz`, mở trang chủ, chơi thử, mở `/admin/`. Có thể chạy `node tools/smoke.mjs https://<địa-chỉ> <ADMIN_USER> <ADMIN_PASS>` (lưu ý: bài kiểm tra tạo rồi xóa một tài khoản và một giải thử).
7. Tên miền riêng: Workers & Pages → chọn `chay-online` → Settings → Domains & Routes → Add → Custom domain (tên miền phải nằm trong Cloudflare). Sau đó sửa `BASE_URL` và deploy lại.
8. Strava: ô **Authorization Callback Domain** điền tên miền (không có `https://`).

### Triển khai tự động từ GitHub
Workers & Pages → Create → Import a repository → chọn repo/nhánh. Build command để trống (Wrangler tự chạy `node scripts/build-assets.mjs`), Deploy command `npx wrangler deploy`. Mỗi lần push là một lần triển khai.

### Chạy thử trên máy
`printf 'ADMIN_USER=admin\nADMIN_PASS=matkhau123\nSTRAVA_MOCK=1\n' > .dev.vars && npm run dev:worker` rồi mở http://localhost:8787 (dữ liệu giả lập nằm trong `.wrangler/`).

### Lưu ý
- **Một Durable Object phục vụ toàn bộ API và WebSocket**: nhất quán và đơn giản, phù hợp từ vài trăm người chơi đồng thời. Muốn lớn hơn cần chia (ví dụ mỗi phòng một Durable Object, bảng xếp hạng vào D1).
- WebSocket đang mở giữ Durable Object hoạt động nên tính phí thời gian chạy (Duration). Hãy theo dõi mức dùng trong dashboard; hạn mức và giá của gói Free/Paid do Cloudflare quy định và có thể đổi, bạn xem ở trang Pricing của họ.
- Cache API **không hoạt động trên miền `*.workers.dev`**: ở đó ảnh bản đồ chỉ được trình duyệt giữ lại (Service Worker). Dùng tên miền riêng hoặc bật R2: `npx wrangler r2 bucket create chay-tiles` rồi bỏ chú thích `r2_buckets` trong `wrangler.jsonc`.
- Dữ liệu nằm trong SQLite của Durable Object, **chưa có công cụ xuất/sao lưu** trong dự án (Cloudflare có khôi phục theo thời điểm cho SQLite Durable Object). Dữ liệu từ bản Node cũ không tự chuyển sang.
- Đổi `TILES_VERSION` trong `wrangler.jsonc` để buộc tải lại ảnh bản đồ.

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

## D. VPS + tên miền DuckDNS (không dùng Cloudflare Tunnel)
**Vì sao không gắn DuckDNS vào Cloudflare Tunnel được:** tunnel có tên cố định chỉ chạy với tên miền do Cloudflare quản lý DNS, mà DuckDNS không cho chuyển DNS về Cloudflare (chỉ cho đặt IP). Với DuckDNS, bạn trỏ thẳng tên miền vào IP của máy chủ có IP công khai cố định, tức VPS.

1. Có VPS Ubuntu/Debian (1 GB RAM trở lên), mở cổng 80 và 443 ở tường lửa của nhà cung cấp.
2. Vào duckdns.org, ở dòng `chayonline` điền **IPv4 của VPS** rồi bấm update.
3. Chép mã nguồn lên VPS (git clone, hoặc giải nén gói), rồi chạy:
   ```bash
   sudo DOMAIN=chayonline.duckdns.org ADMIN_USER=ten ADMIN_PASS='mat-khau-dai' bash deploy/vps/setup-ubuntu.sh
   ```
   Script cài Node 22, dịch vụ nền, Caddy (tự xin chứng chỉ HTTPS Let's Encrypt), tường lửa, và đặt `BASE_URL=https://chayonline.duckdns.org`.
4. Mở https://chayonline.duckdns.org . Strava: ô Callback Domain điền `chayonline.duckdns.org`.
- Lưu ý: tên miền DuckDNS có thể bị một số trình duyệt hoặc dịch vụ chống lừa đảo gắn cờ; nếu gặp, đổi sang tên miền mua riêng.
- Chạy ngay trên máy cá nhân với DuckDNS là có thể (mở cổng 80/443 trên router, cài Caddy, DuckDNS cập nhật IP nhà) nhưng không khuyến nghị: nhiều nhà mạng dùng CGNAT nên không mở cổng được, và IP nhà bị lộ.

## E. Tự build và triển khai từ GitHub (CI/CD)
Có hai cách, chọn một:
1. **Cloudflare tự lấy mã từ GitHub (dễ nhất, không cần khóa trong GitHub):** Cloudflare dashboard → Workers & Pages → Create → Import a repository → chọn repo và nhánh. Build command để trống (Wrangler tự chạy `node scripts/build-assets.mjs`), Deploy command `npx wrangler deploy`. Đặt bí mật (ADMIN_USER, ADMIN_PASS...) trong Settings → Variables and Secrets của Worker. Mỗi lần đẩy mã lên nhánh đó là tự triển khai.
2. **GitHub Actions** (`.github/workflows/`):
   - `ci.yml`: chạy trên mọi lần đẩy mã và pull request: kiểm cú pháp, chạy server Node thật rồi kiểm thử đầu-cuối (`tools/smoke.mjs`, `tools/test-flush.mjs`), và dựng thử bản Cloudflare (`wrangler deploy --dry-run`). Không cần khóa.
   - `deploy-cloudflare.yml`: triển khai lên Cloudflare Workers khi đẩy lên nhánh `main`, hoặc bấm tay ở tab Actions (chọn nhánh). Cần khai trong GitHub → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN` (tạo ở Cloudflare → My Profile → API Tokens, mẫu "Edit Cloudflare Workers") và `CLOUDFLARE_ACCOUNT_ID`; tùy chọn `ADMIN_USER`, `ADMIN_PASS`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` để workflow tự đặt bí mật cho Worker.
- Lưu ý: hiện repo chỉ có nhánh `claude/chay-online-game`, chưa có `main`; hãy tạo `main` (hoặc bấm chạy tay và chọn nhánh hiện có). Bản Cloudflare dùng địa chỉ `*.workers.dev` hoặc tên miền do Cloudflare quản lý (không dùng được DuckDNS). Dữ liệu nằm trong Durable Object của Cloudflare, tách biệt với dữ liệu trên máy/VPS của bạn.
