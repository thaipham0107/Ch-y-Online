# Changelog
## 1.2.0
- Nhanh hơn: bước dài 4 m, tự động 4,5 bước/giây (5 km ≈ 5 phút), thủ công tối đa 5 bước/giây; chó 19 m/s, đuổi 16 giây và cắn lặp lại có hồi chiêu.
- Chướng ngại đẹp hơn (đá có rêu, cành cây, khúc gỗ), xe máy ngược chiều, đội cổ vũ 1–5 người với cảm xúc trên đầu nhân vật, nhân vật chibi hơn.
- Kiểu Temple Run: trượt dưới chướng ngại cao, 🧲 nam châm, 🛡️ khiên, tốc độ tăng dần, đoạn thưởng xu, thêm tia sét.
- Xu vàng tự vẽ (iPhone), nhặt vật phẩm chắc hơn + xử lý túi đầy, ảnh vệ tinh nét hơn (z19) và nút xem toàn tuyến, chuyển động mượt hơn, độ nét tự điều chỉnh theo FPS.
## 1.1.0
- Nhân vật có chân/tay khớp hông-gối-vai-khuỷu, bước chạy tự nhiên (không còn như nhảy); chó vẽ lại và có hoạt họa phi; âm thanh tổng hợp (bước, nhảy, xu, vật phẩm, chó sủa, cắn, về đích...) với nút bật/tắt; giữ Space/chuột/chạm/nút BƯỚC để chạy tốc độ tối đa; chuyển động mượt hơn.
- Chạy dịch vụ nền trên máy cá nhân (Windows/Linux/macOS) + Cloudflare Tunnel, `npm run doctor`, lấy IP thật qua CF-Connecting-IP, `npm run demo` chạy được trên Windows.
- Bản Cloudflare Workers + Durable Object (SQLite, WebSocket) không dùng container: `wrangler.jsonc`, `worker/`, `scripts/build-assets.mjs`.
- Tách lõi dùng chung `core.js` (Node và Worker), `node-tiles.js`, `lite-express.js`; thêm `tools/smoke.mjs`.
## 1.0.0
- 10 bản đồ Việt Nam từ GPX thật, 4 làn, camera zoom/xoay 360°, thể lực, chó đuổi, vật phẩm, chế độ tự động.
- Tài khoản (SQLite) và khách (trình duyệt), gộp dữ liệu khách; xu và cửa hàng.
- Strava tùy chọn (km ngoài đời, bảng xếp hạng, lịch sử).
- Giải đấu công khai/riêng tư, huy chương tự thiết kế, chọn hiển thị 3D/2D/vệ tinh; GPS chạy ảo.
- Kho ảnh bản đồ trên server + Service Worker; giao diện PC/tablet/điện thoại.
- Cổng quản trị `/admin/`.
