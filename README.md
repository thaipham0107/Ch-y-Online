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
- **Space = 1 bước = 2 m** (tối đa 4 bước/giây), **J = nhảy**, **← →** đổi làn (4 làn), **1–5** dùng vật phẩm, **A** bật/tắt tự động, cuộn/chụm để zoom, kéo (khi zoom xa) để xoay 360°.
- **Tự động**: 1 bước/giây, tự nhảy qua chướng ngại trong làn của bạn. Chó đuổi vẫn bắt kịp nếu không dùng ⚡. Đổi giữa thủ công/tự động bất cứ lúc nào.
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
