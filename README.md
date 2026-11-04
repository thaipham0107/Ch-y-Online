# 🏃 Chạy Online 3D

Game chạy bộ nhiều người chơi trên trình duyệt. Chạy trên 10 cung đường nổi tiếng Việt Nam (độ dốc và độ khó khác nhau),
nhân vật chibi nhìn từ góc cao nghiêng, tên + cấp + tổng km hiển thị trên đầu.

## Chạy thử
```bash
npm install
npm run demo        # Strava giả lập, mở http://localhost:3000
```
Yêu cầu Node 22.5 trở lên (dùng SQLite có sẵn của Node, không cần cài thêm).
Mở nhiều tab để thấy nhiều người cùng chạy trên một bản đồ.

## Luật chơi
- **Space = 1 bước = 2 m** (500 bước = 1 km). Tối đa 4 bước/giây. **J = nhảy** qua chướng ngại.
- **Tự động**: 1 bước/giây (7,2 km/h), tự nhảy qua chướng ngại tĩnh. Bật/tắt bất cứ lúc nào (phím A).
- **Thể lực**: mỗi bước tốn thể lực, lên dốc tốn nhiều hơn. Hết thể lực thì dừng lại. Nhặt 💧 nước (+15), 🍌 chuối (+25), 🍉 dưa hấu (+35), 🧂 điện giải (+50, xóa trạng thái chậm) vào túi 5 ô, bấm ô hoặc phím 1–5 để dùng.
- **⚡ Tia sét**: bước dài 3 m trong 8 giây (nhanh hơn) nhưng tốn thể lực hơn.
- **Chướng ngại** ngẫu nhiên. **Chó đuổi**: bị cắn thì -20 thể lực và chậm một nửa 4 giây. Chế độ tự động giữ tốc độ cố định nên cần ⚡ để thoát chó.
- 10 bản đồ: Hồ Gươm, Nguyễn Huệ (TP.HCM), Cầu Rồng – Mỹ Khê, Bãi Cháy – Hạ Long, Tràng An, đồi chè Mộc Châu, đèo Hải Vân, đèo Prenn, đèo Ô Quy Hồ, Mã Pí Lèng. Độ dốc càng cao càng tốn thể lực; mặt đường chuyển đỏ khi dốc.
  Độ cao/độ dốc là xấp xỉ; cấu trúc dữ liệu (`maps.js`) cho phép thay bằng GPX thật sau.

## Tài khoản và dữ liệu
- **Tài khoản**: lưu trên server (SQLite, `data/chay.db`): hồ sơ, lịch sử từng ngày, vật phẩm, túi đồ.
- **Khách**: lưu trong trình duyệt (localStorage), vào lại vẫn còn. Khách không có xếp hạng và không kết nối Strava.
- **Strava (tùy chọn, chỉ tài khoản)**: thêm cột **km chạy ngoài đời** vào lịch sử và xếp hạng; **tổng = game + ngoài đời**. Không kết nối thì cột ngoài đời = 0.
- Server kiểm tra nhịp bước (≤ 4 bước/giây) khi quy đổi ra km.

## Strava thật
1. Tạo app tại https://www.strava.com/settings/api (Authorization Callback Domain = tên miền của game).
2. `cp .env.example .env`, điền `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `BASE_URL`, rồi `npm start`.

## Cấu trúc
`server.js` (Express, WebSocket, SQLite) · `strava.js` · `maps.js` (luật chơi + 10 bản đồ, dùng chung) · `public/js/` (`world.js` dựng cảnh, `game.js` engine, `store.js` lưu hồ sơ, `main.js` giao diện).

## Chưa làm (giai đoạn sau)
Giải đấu (huy chương riêng, link mời công khai/riêng tư), chế độ GPS (chạy ảo dọc tuyến, lấy vị trí xuất phát), bản đồ vệ tinh.
