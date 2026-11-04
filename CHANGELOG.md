# Changelog
## 1.1.0
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
