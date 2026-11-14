# Mô hình 3D (GLB) cho địa danh

**Xem thử một mô hình:** mở `/viewer.html`, chọn file `.glb` hoặc kéo-thả vào trang. Trang báo dung lượng, số mặt tam giác, số texture và đánh giá "nhẹ/nặng cho điện thoại".

**Đưa vào game:**
1. Chép file vào `public/models/` (thêm tên vào `public/models/index.json` nếu muốn hiện trong danh sách viewer).
2. Khai báo vị trí trong `public/props/<mã-bản-đồ>.json` (mã: hoguom, saigon, danang, halong, …):
   `{ "model":"duc-ba.glb", "name":"Nhà thờ Đức Bà", "s":800, "lat":28, "scale":1.6, "rotY":90, "sea":false, "checkin":true }`
   - `s` mét dọc đường · `lat` khoảng cách ngang · `sea:true` đặt trên mặt nước (tự đẩy ra tới khi là nước) · `checkin:true` chạy ngang thì hiện "📍 Đã check-in".
3. Mô hình tải nền, lỗi/không có file thì game vẫn chạy bình thường.

**Đo hiệu năng:** thêm `?perf=1` vào địa chỉ để hiện FPS, draw call, số tam giác ở góc trái dưới.

**Ngân sách khuyến nghị (điện thoại/iPad cũ):** mỗi địa danh ≤ 15–30k tam giác, texture ≤ 1024², ≤ 3 MB/file (nén Meshopt/Draco được; Meshopt đã hỗ trợ sẵn), tổng cảnh ≤ ~150k tam giác.

**Sinh lại 5 mô hình mẫu:** `node tools/make-models.cjs` (cần server chạy ở BASE, mặc định http://localhost:3999).

**Giấy phép:** ghi nguồn + điều khoản của công cụ AI/asset cho từng file vào `public/models/CREDITS.md` trước khi phát hành.
