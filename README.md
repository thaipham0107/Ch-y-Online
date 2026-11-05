# 🏃 Chạy Online 3D

Game chạy bộ nhiều người chơi trên trình duyệt: 10 cung đường Việt Nam, đường 4 làn, camera góc cao zoom in/zoom out xoay 360°,
xu và cửa hàng, giải đấu có huy chương riêng, GPS chạy ảo dọc tuyến thật. Tài liệu phân tích kèm ảnh giao diện: `docs/phan-tich.html`.

## Chạy thử
```bash
npm install
npm run demo        # Strava giả lập, mở http://localhost:3000
```
Cần Node 22.5 trở lên (dùng SQLite có sẵn của Node). Mở nhiều tab để thấy nhiều người cùng chạy.

## Luật chơi
- **Máy tính**: **Space hoặc nhấp chuột = 1 bước = 4 m** (tối đa 5 bước/giây), **J hoặc ↑ = nhảy** (hoặc nút NHẢY), **← →** đổi làn (4 làn), **1–5** dùng vật phẩm, **A** bật/tắt tự động, cuộn để zoom, kéo (khi zoom xa) để xoay 360° (kéo không tính là bước). **Giữ** Space, giữ chuột/ngón tay (yên khoảng 0,2 giây) hoặc giữ nút BƯỚC = chạy liên tục ở tốc độ tối đa; **M** bật/tắt âm thanh, **F** (nút 🗺) xem toàn tuyến trên bản đồ vệ tinh/2D.
- **Điện thoại/tablet** (không cần bàn phím): **chạm màn hình = 1 bước**, **nút NHẢY** để nhảy, vuốt ngang hoặc nút ◀ ▶ đổi làn, chụm để zoom.
- **Tự động**: 4,2 bước/giây (16,8 m/s: 5 km khoảng 5 phút), tự nhảy qua chướng ngại trong làn của bạn. Chó đuổi vẫn bắt kịp nếu không dùng ⚡. Đổi giữa thủ công/tự động bất cứ lúc nào.
- **Thể lực**: hết thì dừng. Nhặt 💧🍌🍉🧂 để hồi, ⚡ để tăng tốc. Lên dốc tốn nhiều hơn.
- **Xu**: 10 xu/km trong game, 25 xu/km chạy ngoài đời (Strava), nhặt 🪙, +20 xu về đích. Mua mũ, giày, phụ kiện, đồng hồ, hào quang.
- **10 bản đồ**: Hồ Gươm, Nguyễn Huệ, Cầu Rồng – Mỹ Khê, Bãi Cháy – Hạ Long, Tràng An, đồi chè Mộc Châu, đèo Hải Vân, đèo Prenn, đèo Ô Quy Hồ, Mã Pí Lèng (đường chạy thật: xem mục Dữ liệu đường chạy).

## Tài khoản, khách, Strava
- **Tài khoản**: lưu trên server (SQLite `data/chay.db`). **Khách**: lưu trong trình duyệt. Khi đăng ký/đăng nhập trên máy có dữ liệu khách, game hỏi có **gộp** vào tài khoản không (một lần; server kiểm tra hợp lý; km gộp không tính vào xếp hạng chung).
- **Strava (tùy chọn, chỉ tài khoản)**: thêm cột **km chạy ngoài đời** và **tổng** vào lịch sử, xếp hạng. Không kết nối thì ngoài đời = 0.
  Strava thật: tạo app tại https://www.strava.com/settings/api. Xem cách kết nối Strava thật bên dưới.
### Kết nối Strava thật (3 bước)
1. Tạo ứng dụng tại https://www.strava.com/settings/api. Ô **Authorization Callback Domain** chỉ điền *tên miền* (không có http, không có đường dẫn), ví dụ `chay.example.com`; chạy thử trên máy thì điền `localhost`.
2. `cp strava.config.example.json strava.config.json` rồi điền **clientId**, **clientSecret** và **baseUrl** (địa chỉ công khai của game, ví dụ `https://chay.example.com`). File `strava.config.json` đã nằm trong `.gitignore`, không commit khóa thật. Biến môi trường (`STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_SCOPE`, `BASE_URL`) luôn được ưu tiên hơn file.
3. `npm run check:strava` để kiểm tra (in đúng giá trị cần điền vào ô Callback Domain, kiểm tra khóa đúng/sai), rồi `npm start`. Vào **Hồ sơ → Kết nối Strava**.

Game tự đồng bộ nền khi mở (tối đa mỗi 15 phút/người), làm mới token hết hạn, tự ngắt kết nối nếu Strava thu hồi quyền, và nghỉ khi Strava báo hết hạn mức (429). Chỉ tính Run, TrailRun, VirtualRun theo ngày địa phương của buổi chạy. Mặc định chỉ đọc hoạt động công khai; đặt `"scope": "read,activity:read_all"` để tính cả hoạt động riêng tư.

Thử luồng Strava không cần khóa thật: `node tools/fake-strava.mjs 9911` (máy chủ Strava giả), chạy server với `PORT=3555 BASE_URL=http://localhost:3555 STRAVA_CLIENT_ID=test-id STRAVA_CLIENT_SECRET=test-secret STRAVA_OAUTH_URL=http://localhost:9911/oauth STRAVA_API_URL=http://localhost:9911/api/v3 DATA_DIR=<thư mục tạm>`, rồi `node tools/test-strava.cjs <đường dẫn chay.db>` (kiểm thử đầu-cuối bằng Playwright).

## Giải đấu
Tạo giải (tài khoản): thông tin, thể thức (bản đồ 3D hoặc tuyến GPS, tối đa 4 cự ly), thiết kế huy chương nhất/nhì/ba/phong trào, xuất bản và gửi link `/?t=MÃ`.
Công khai (hiện trong danh sách) hoặc riêng tư (chỉ người có link). Chạy khác giờ hoặc cùng giờ G (thấy nhau). Bấm tay và tự động chung một bảng. Server đo thời gian, khóa kết quả và phát huy chương khi hết giờ.

## GPS chạy ảo
Chọn điểm xuất phát (vị trí của tôi / địa chỉ / ghim), điểm đến, đồ họa 2D hoặc vệ tinh. Nhân vật chạy dọc tuyến đi bộ thật; vị trí chỉ dùng để lấy điểm xuất phát.
Mặc định dùng OpenStreetMap, Esri World Imagery, Valhalla, Nominatim (đều có giới hạn sử dụng; cho môi trường thật hãy đổi bằng `TILES_ROAD`, `TILES_SAT`, `GEO_SEARCH_URL`, `GEO_ROUTE_URL`).

## Cấu trúc
`server.js` (Express, WebSocket, SQLite, giải đấu, bản đồ) · `strava.js` · `maps.js` (luật, bản đồ, cửa hàng; dùng chung) · `public/js/`: `world.js` (cảnh 3D), `gpsworld.js` (cảnh GPS), `game.js` (engine), `store.js` (hồ sơ tài khoản/khách), `tournaments.js`, `gpspicker.js`, `medal.js`, `main.js`.

## Dữ liệu đường chạy thật (10 bản đồ)
Hình học và độ cao của 10 bản đồ nằm trong `public/courses/` (`<id>.json` + `meta.json`). Hiện cả 10 tuyến dùng **GPX tự vẽ trong Komoot** (có độ cao, `gpx/NGUON.md` ghi chi tiết). Cách dựng dự phòng từ **OpenStreetMap** (đường đi qua các điểm mốc, `tools/courses.config.mjs`) và **độ cao SRTM 30 m** (OpenTopoData), có lọc nhiễu và giới hạn độ dốc hợp lý. Đây **chưa phải GPX chính thức** của ban tổ chức giải.
- Dựng lại: `npm run courses:build` (chạy được cả từng bản đồ: `node tools/build-courses.mjs haivan`). Kết quả gọi mạng được lưu đệm trong `tools/.cache/`.
- **Thay bằng GPX chính thức**: đặt file vào `gpx/<id>.gpx` (id: `hoguom saigon danang halong trangan mocchau haivan prenn oquyho mapileng`) rồi `npm run courses:gpx`. GPX có độ cao thì dùng luôn, thiếu thì lấy từ SRTM. Game tự nhận, hiển thị "GPX chính thức" ở màn chọn bản đồ.
- Bên vách núi, vực, biển được phát hiện từ độ cao hai bên đường; cảnh dùng hình học thật (địa hình dạng lưới, lan can, cầu Rồng, tháp Bitexco, cổng Hải Vân Quan… đặt theo tọa độ).

## Vệ tinh cho 10 bản đồ
Ở màn chọn bản đồ, mục **Hiển thị**: Cảnh 3D / Bản đồ 2D / Vệ tinh. Ảnh bản đồ trải dưới đường chạy (mặt phẳng); độ dốc và thể lực vẫn theo độ cao thật. Cần mạng; nguồn ảnh đổi bằng `TILES_ROAD`, `TILES_SAT`.

## Kho ảnh bản đồ trên server & giao diện đa thiết bị
- Ảnh nền 2D/vệ tinh đi qua `GET /tiles/<road|sat>/<z>/<x>/<y>?v=<phiên bản>`: server tải từ nguồn một lần, lưu vào `data/tiles`, các lần sau trả từ đĩa với `Cache-Control: immutable` (1 năm). Trình duyệt tải ở lần đầu (Service Worker `public/sw.js` giữ cache theo phiên bản) và chỉ tải lại khi đổi `TILES_VERSION`. Màn chọn bản đồ/giải đấu có nút tải trước ảnh dọc tuyến. Biến: `TILES_VERSION`, `TILE_CACHE=0` (tắt lưu), `TILE_CACHE_MB` (mặc định 3000). Xem dung lượng: `/api/tiles/stats`.
- Lưu ý điều khoản: OpenStreetMap hạn chế tải hàng loạt và Esri có điều khoản riêng về lưu/phân phối ảnh. Bản chạy thật nên dùng nhà cung cấp có giấy phép (đổi `TILES_ROAD`/`TILES_SAT`).
- Giải đấu bản đồ 3D chọn được **Cảnh 3D / Bản đồ 2D / Vệ tinh**; mọi người chơi trong giải dùng chung kiểu hiển thị.
- Giao diện đã kiểm tra ở PC 1440×900, tablet 820×1180 và 1180×820, điện thoại 390×844 và 844×390 (HUD gọn, vùng chạm lớn, safe-area, FOV camera tự nới khi màn dọc).

## Trang quản trị (`/admin/`)
- Đăng nhập bằng tài khoản trong `admin.config.json` (đã `.gitignore`, **không commit**): `{"username":"...","password":"..."}` (xem `admin.config.example.json`); hoặc biến môi trường `ADMIN_USER`, `ADMIN_PASS`. Không cấu hình thì cổng quản trị tắt. Phiên 12 giờ, cookie `httpOnly`/`SameSite=Strict`, sai 6 lần khóa 10 phút theo IP. Nên chạy sau HTTPS.
- **Tổng quan**: đang truy cập, DAU/WAU/MAU, lượt truy cập và thiết bị duy nhất theo ngày, thời gian sử dụng (TB, trung vị, tổng giờ), giờ cao điểm, thiết bị, bản đồ phổ biến, km trong game/ngoài đời, giải đấu, xu lưu hành.
- **Người chơi**: tìm, sắp xếp, chi tiết từng người (lịch sử ngày, chuyến chạy, phiên truy cập, hoạt động, giải/huy chương, vật phẩm); cộng/trừ xu, đổi tên, đặt lại mật khẩu, khóa/mở khóa, xóa. **Khách**, **Giải đấu** (xóa), **Hoạt động** (luồng sự kiện), **Nhật ký** (mọi thao tác quản trị).
- Theo dõi truy cập: `public/js/track.js` gửi mở trang + nhịp 30 giây (chỉ tính lúc tab hiện) theo mã thiết bị ngẫu nhiên; IP lưu dạng băm có muối ngẫu nhiên (đổi mỗi lần khởi động), dữ liệu giữ 400 ngày. Nên nêu việc này trong chính sách quyền riêng tư của bạn.

## Triển khai
- **Cloudflare Workers (không container)**: `npm run deploy:worker` (xem `DEPLOY.md`, mục A). Kiểm thử tại chỗ: `npm run dev:worker`, rồi `node tools/smoke.mjs http://localhost:8787 <admin> <mật khẩu>`.
- **Máy cá nhân + Cloudflare Tunnel, chạy dịch vụ nền, không Docker** (`DEPLOY.md`, mục C): `npm run doctor`, rồi `deploy/windows|linux|macos/install-service.*`.
- Node/Docker: `npm start` hoặc `docker compose up -d` (mục B). Hai bản dùng chung `core.js`.
