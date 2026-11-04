# Triển khai Chạy Online v1.0.0

Yêu cầu: máy chủ có **Node 22.5+** (hoặc Docker), tên miền có HTTPS (Strava, định vị GPS và cookie an toàn đều cần HTTPS).

## Cách 1: Docker (khuyên dùng)
```bash
cp .env.example .env      # sửa BASE_URL=https://ten-mien-cua-ban, ADMIN_USER, ADMIN_PASS, khóa Strava
docker compose up -d --build
curl localhost:3000/healthz
```
Dữ liệu (SQLite, ảnh bản đồ) nằm ở `./data`, **hãy sao lưu thư mục này**.

## Cách 2: chạy trực tiếp
```bash
npm ci --omit=dev
cp .env.example .env      # như trên
npm start                 # hoặc dùng pm2 / systemd
```

## Đặt sau HTTPS
Dùng Caddy hoặc Nginx làm reverse proxy tới cổng 3000, bắt buộc chuyển tiếp WebSocket (`/ws`) và header `X-Forwarded-For/Proto`. Ví dụ Caddy: `ten-mien.com { reverse_proxy localhost:3000 }`.

## Kiểm tra sau khi chạy
1. Mở `https://ten-mien/`, chơi thử chế độ khách, mở 2 tab để thấy nhau.
2. `https://ten-mien/admin/` đăng nhập quản trị (cấu hình qua `ADMIN_USER`/`ADMIN_PASS`).
3. Strava: `npm run check:strava` rồi vào Hồ sơ → Kết nối Strava (ô Callback Domain điền đúng tên miền).
4. Chế độ vệ tinh/2D: server tự lưu ảnh vào `data/tiles` (xem `/api/tiles/stats`).

## Lưu ý trước khi mở công khai
- Nguồn ảnh OpenStreetMap, Esri, Nominatim, Valhalla là dịch vụ công cộng có giới hạn và điều khoản riêng. Lưu lượng thật nên dùng nhà cung cấp có giấy phép (`TILES_ROAD`, `TILES_SAT`, `GEO_SEARCH_URL`, `GEO_ROUTE_URL`).
- Đường chạy dùng GPX tự vẽ trong Komoot, chưa phải GPX chính thức của ban tổ chức giải.
- Trang quản trị có theo dõi truy cập (IP băm, mã thiết bị): nên có chính sách quyền riêng tư.
- Một tiến trình Node, một file SQLite: phù hợp vài trăm người chơi đồng thời; muốn lớn hơn cần tách lưu trữ.
