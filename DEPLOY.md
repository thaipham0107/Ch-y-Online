# Triển khai Chạy Online

Có hai cách: **A. Cloudflare Workers (không container, khuyên dùng)** và B. máy chủ Node/Docker.

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
