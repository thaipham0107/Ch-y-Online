# 🏃 Chạy Online — Đường lên Chùa

Game chạy bộ nhiều người chơi chạy trên trình duyệt. Số km Strava của bạn chính là **sức mạnh**,
hiển thị trên đầu nhân vật và quyết định tốc độ chạy trong game.

## Chạy thử nhanh (không cần Strava key)
```bash
npm install
npm run demo        # Strava giả lập, mở http://localhost:3000
```
Mở nhiều tab/trình duyệt để thấy nhiều người cùng chạy.

## Chạy thật với Strava
1. Vào https://www.strava.com/settings/api tạo app. **Authorization Callback Domain** = tên miền của game (dev: `localhost`).
2. `cp .env.example .env` rồi điền `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `BASE_URL`.
3. `npm start`

Lưu ý Strava: app mới chỉ cho 1 vận động viên (chính bạn) cho tới khi xin nâng giới hạn; hạn mức API 100 request/15 phút
(game giới hạn đồng bộ 1 lần/phút/người). Mặc định chỉ đọc hoạt động công khai; đặt `STRAVA_SCOPE=read,activity:read_all` để tính cả hoạt động riêng tư.

## Cách chơi
- Tự động chạy. `Space/↑` nhảy · `Shift` nước rút (tốn thể lực) · `R` nghỉ · `Enter` chat. Trên điện thoại có 3 nút.
- Nhảy qua chướng ngại (đá, vũng nước, chó, trâu…), nhặt 💧 hồi thể lực, 🪙 xu, 🪷 hoa sen.
- Đường dài 3 km qua 5 vùng cảnh, cuối đường là **chùa** — tới nơi nhận xu và quay lại vòng mới.
- **Sức mạnh = km Strava** (năm nay / 4 tuần / tổng, tự chọn). Km càng cao hạng càng cao (🐣→🥾→🏃→🔥→⚡→👑), có hào quang, tốc độ tăng tới +60%.
- Nhiệm vụ mỗi ngày (reset 0h giờ VN): chạy trong game, nhặt nước, nhảy chướng ngại, về chùa, và **chạy thật 5/10 km hôm nay** (lấy từ Strava).
- Xu mua mũ: nón lá, băng đô, mũ lưỡi trai, tai mèo, vương miện.

## Tin cậy dữ liệu
Dấu ✓ = km lấy từ Strava (xác thực). Dấu ✎ = người chơi tự khai. Server kiểm tra tốc độ di chuyển để chống teleport.

## Cấu trúc
`server.js` (Express + WebSocket, nhiệm vụ, lưu `data/db.json`) · `strava.js` (OAuth/số liệu) · `tiers.js` (hạng, dùng chung) · `public/` (giao diện + `game.js` canvas).
