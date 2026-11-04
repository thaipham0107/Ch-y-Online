# Nguồn GPX đã tìm (chưa có file nào tải được công khai)

Ngày tìm: 2026-11-04. Yêu cầu: **GPX Track thật**, có nguồn và giấy phép. Thư mục này là nơi đặt `<id>.gpx` rồi chạy `npm run courses:gpx`.
Mã file: hoguom, saigon, danang, halong, trangan, mocchau, haivan, prenn, oquyho, mapileng.

## Kết quả
Không file nào tải được trực tiếp, công khai và có giấy phép rõ ràng. Các nền tảng Strava, Garmin Connect, Komoot, Bikemap, Wikiloc đều cần đăng nhập hoặc trả phí để xuất GPX, và file là của tác giả đường; không nên lấy vòng qua đăng nhập.

## Đầu mối theo địa danh
| Mã | Đầu mối | Tình trạng |
|---|---|---|
| halong | Ban tổ chức Halong Bay Heritage Marathon từng đăng GPX (thư mục Google Drive) và khóa học Garmin cho 42/21/10/5 km: https://halongmarathon.com/en/w/halong-bay-heritage-marathon-gpx-track-file-garmin-course | Trang trả 404 ngày 2026-11-04. Nên liên hệ ban tổ chức xin GPX |
| haivan | Komoot: https://blog.komoot.de/smarttour/33837762 (vòng Hải Vân từ Đà Nẵng, ~56 km, ~770 m leo); Bikemap: https://www.bikemap.net/en/r/3409202 | Cần tài khoản/trả phí để tải GPX; file của tác giả, kiểm tra điều khoản |
| mapileng | Bikemap: https://www.bikemap.net/en/r/4718810, https://www.bikemap.net/en/r/5380244 (Yên Minh – Đồng Văn) | Xuất GPX là tính năng trả phí |
| oquyho | Vietnam Mountain Marathon (Sa Pa), trang sự kiện nói có cấp GPX: https://trailrunner.com/event/vietnam-mountain-marathon/ ; vệt trên https://tracedetrail.fr (tìm "Vietnam Mountain Marathon") | Chưa xác nhận tải được, nên hỏi ban tổ chức |
| prenn | Dalat Ultra Trail: https://tracedetrail.fr/fr/event/dalat-ultra-trail-2026-2026 ; Lam Dong Trail nói sẽ cho tải GPX: https://www.asiatrailmaster.com/news/2025/5/12/lam-dong-trail-in-dalat-returns-on-8-november | Chưa thấy file; kiểm tra đoạn có đèo Prenn |
| danang | Ban tổ chức Danang International Marathon: https://rundanang.com/en/ ; trang bên thứ ba https://goandrace.com/en/map/2023/manulife-danang-international-marathon-2023-da-nang-city-course-map-1-3d.php | Trang bên thứ ba không có file tải |
| saigon | Techcombank Ho Chi Minh City International Marathon (qua Nguyễn Huệ, Bitexco); bản đồ trên ahotu.com | Chưa thấy GPX |
| hoguom | VPBank Hanoi International Marathon / VnExpress Marathon Hanoi Midnight (qua Hồ Gươm) | Chưa thấy GPX |
| trangan, mocchau | Chưa tìm thấy giải có GPX công bố | |

## Nguồn mở đã thử: vệt GPS công khai của OpenStreetMap
`https://api.openstreetmap.org/api/0.6/trackpoints?bbox=...` trả các vệt công khai không cần đăng nhập (có thời gian, **không có độ cao**, tối đa 5.000 điểm/trang). Quanh đèo Hải Vân có vài vệt thật của người dùng (ví dụ đường Huế – Hội An). Hạn chế: file gốc cần đăng nhập (401), vệt thường là đường dài nhiều chặng cần cắt, và **giấy phép của vệt chưa được trang wiki nêu rõ**, nên chưa dùng.

## Cách tiếp theo
1. Tải các GPX miễn phí từ tài khoản Komoot/Wikiloc/Strava của bạn (kiểm tra điều khoản), hoặc xin ban tổ chức giải.
2. Đặt `<id>.gpx` vào thư mục này, chạy `npm run courses:gpx`.

## Đã nhập (2026-11-04)
GPX tự vẽ trong Komoot (đường nền OpenStreetMap, có độ cao): `trangan` (13,4 km), `danang` (cắt còn 3,3 km: bản gốc đi tới biển rồi quay lại), `saigon` (12,7 km), `mocchau` (23,8 km).
Chưa dùng: file Hà Nội (xuất phát cách Hồ Gươm ~7 km, không đi qua hồ). Còn thiếu: `hoguom`, `halong`, `haivan`, `prenn`, `oquyho`, `mapileng`. File GPX gốc không commit (`gpx/*.gpx` nằm trong .gitignore), dữ liệu đã dựng nằm ở `public/courses/`.
