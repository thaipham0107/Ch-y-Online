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
- **10 bản đồ**: Hồ Gươm, Nguyễn Huệ, Cầu Rồng – Mỹ Khê, Bãi Cháy – Hạ Long, Tràng An, đồi chè Mộc Châu, đèo Hải Vân, đèo Prenn, đèo Ô Quy Hồ, Mã Pí Lèng (độ cao/độ dốc là xấp xỉ, `maps.js`).

## Tài khoản, khách, Strava
- **Tài khoản**: lưu trên server (SQLite `data/chay.db`). **Khách**: lưu trong trình duyệt. Khi đăng ký/đăng nhập trên máy có dữ liệu khách, game hỏi có **gộp** vào tài khoản không (một lần; server kiểm tra hợp lý; km gộp không tính vào xếp hạng chung).
- **Strava (tùy chọn, chỉ tài khoản)**: thêm cột **km chạy ngoài đời** và **tổng** vào lịch sử, xếp hạng. Không kết nối thì ngoài đời = 0.
  Strava thật: tạo app tại https://www.strava.com/settings/api, `cp .env.example .env`, điền khóa, `npm start`.

## Giải đấu
Tạo giải (tài khoản): thông tin, thể thức (bản đồ 3D hoặc tuyến GPS, tối đa 4 cự ly), thiết kế huy chương nhất/nhì/ba/phong trào, xuất bản và gửi link `/?t=MÃ`.
Công khai (hiện trong danh sách) hoặc riêng tư (chỉ người có link). Chạy khác giờ hoặc cùng giờ G (thấy nhau). Bấm tay và tự động chung một bảng. Server đo thời gian, khóa kết quả và phát huy chương khi hết giờ.

## GPS chạy ảo
Chọn điểm xuất phát (vị trí của tôi / địa chỉ / ghim), điểm đến, đồ họa 2D hoặc vệ tinh. Nhân vật chạy dọc tuyến đi bộ thật; vị trí chỉ dùng để lấy điểm xuất phát.
Mặc định dùng OpenStreetMap, Esri World Imagery, Valhalla, Nominatim (đều có giới hạn sử dụng; cho môi trường thật hãy đổi bằng `TILES_ROAD`, `TILES_SAT`, `GEO_SEARCH_URL`, `GEO_ROUTE_URL`).

## Cấu trúc
`server.js` (Express, WebSocket, SQLite, giải đấu, bản đồ) · `strava.js` · `maps.js` (luật, bản đồ, cửa hàng; dùng chung) · `public/js/`: `world.js` (cảnh 3D), `gpsworld.js` (cảnh GPS), `game.js` (engine), `store.js` (hồ sơ tài khoản/khách), `tournaments.js`, `gpspicker.js`, `medal.js`, `main.js`.
