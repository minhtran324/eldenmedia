# Lộ trình hiện hành

Nguồn yêu cầu: HE-THONG-ELDEN-NOTE.md. Các quyết định trong file đó thay thế thiết kế cũ.

## Đã triển khai trong code

- SQL 001–004: cấu trúc nền, quy tắc nghiệp vụ, RLS, trang chủ/ranking/sinh nhật.
- Giai đoạn 1 / SQL 005: Google OAuth, session, hồ sơ pending, Admin duyệt/phân Idol, cấp quyền vận hành theo email, khóa tài khoản. Xem GIAI-DOAN-1.md.
- Giai đoạn 2A / SQL 006: Admin tạo/sửa tầng, phòng, máy; vận hành tra cứu; tải PNG QR; audit, version chống ghi đè, chặn thay đổi tài nguyên đang dùng. Xem GIAI-DOAN-2.md.
- Giai đoạn 2B / SQL 007: đăng ký/đổi/hủy nguyên ngày 5 tiếng, lịch tuần, kéo thả hoặc chọn phòng theo giờ, gợi ý ít chuyển phòng, duyệt mượn chéo team, thông báo và kiểm tra xung đột khi duyệt cuối. Xem GIAI-DOAN-2B-LICH-LIVE.md.
- Giai đoạn 3 / SQL 008: QR nhận/trả máy, duyệt đúng chủ máy/vận hành Idol, camera check-in/out theo đoạn phòng, ảnh private 30 ngày, thông báo lệch giờ và endpoint/Cron mẫu dọn ảnh. Xem GIAI-DOAN-3.md.

SQL 008 cần chạy sau 007 trong Supabase SQL Editor trước khi dùng ca live. Agent chưa áp dụng migration từ máy này. Bootstrap vẫn là bản nền 004: dự án mới chạy bootstrap, sau đó 005–008 theo thứ tự. Dọn ảnh vật lý cần bật job và cấu hình server/Vault.

- Giai đoạn 4 / SQL 009: Trang chủ nội bộ `/home`, quản trị poster/thông báo/sự kiện `/admin/content`, ảnh private, lịch công bố, phạm vi xem, revision, ranking và sinh nhật từ RPC. Xem GIAI-DOAN-4-TRANG-CHU.md.

SQL 009 cần chạy sau 008; agent chưa áp dụng trên Supabase thật. Nhắc sinh nhật cần bật Cron theo tài liệu.

- SQL 010: nhắc sinh nhật từ hôm nay đến 3 ngày tới để bắt kịp khi mới bật hoặc Cron gián đoạn; giữ chống trùng và job hiện có. Cần áp dụng migration sau 009.

- SQL 011: chuông và hộp thư `/notifications` theo sáu luồng, số chưa đọc cá nhân, phân trang/đánh dấu đã đọc; bỏ thông báo gộp ở lịch/ca. Xem HOP-THU-THONG-BAO.md.

- SQL 012: Idol nhận nhắc sinh nhật toàn công ty.
- Giai đoạn 5 / SQL 013: nhập username + kim cương từ .xlsx, đối chiếu Idol, công bố/thay thế/thu hồi nguyên ngày; báo cáo theo ngày và ranking. Xem GIAI-DOAN-5-EXCEL.md.

- SQL 014: đăng ký đủ tuần, xin phép đăng ký trễ, ma trận phòng × giờ và nút chức năng riêng. Xem LICH-TUAN-VA-MA-TRAN.md. Cần chạy migration trên Supabase trước khi dùng.
- SQL 015: sửa khóa phòng do check-in mở của ngày khác; chạy sau SQL 014 nếu đã áp dụng 014.
- SQL 016: hồ sơ TikTok dùng `username` làm định danh đối chiếu Excel; hiển thị username trong hồ sơ, lịch live, ma trận phòng, danh sách team và Admin.
- SQL 017: cộng kim cương từng ngày theo tháng, xem tổng tháng dự kiến trước công bố, bảng tin trả tổng cho Admin/Vận hành và chỉ hạng cho Idol; xem tháng cũ và báo cáo lũy kế tháng trong phạm vi cá nhân/team.
- Giai đoạn 6 / PWA: trang cài app, biểu tượng chuẩn, màn hình mất mạng, bảo vệ dữ liệu khỏi cache offline và cập nhật chủ động. Không cần SQL mới. Xem GIAI-DOAN-6-PWA.md.
- Giai đoạn 7 / SQL 018: Realtime cho chuông thông báo theo đúng người nhận, giữ polling dự phòng và không mở thêm quyền đọc/ghi. Xem GIAI-DOAN-7-REALTIME.md.

## Làm tiếp

Giai đoạn 8 / SQL 019 đã có: tiến trình Idol check-in phòng → nhận máy hoặc dùng máy riêng → checkout; bàn giao phòng theo lượt, ân hạn 5 phút sau lượt đầu; trả máy tự xác nhận; bảng nhật ký theo Idol/ngày và thông báo vi phạm quan trọng. Quy tắc này thay phần nhận/trả và tính trễ cũ của giai đoạn 3. Xem GIAI-DOAN-8-CHECKIN.md. Cần chạy migration trên Supabase thật sau 018.

1. Nghiệm thu lịch/duyệt mượn phòng trên Supabase thật theo tài liệu 2B; kiểm thử nhiều kết nối và thiết bị di động.
2. Bổ sung điều phối phần còn lại của ca đang live khi triển khai check-in/out, giữ nguyên snapshot và đoạn đã diễn ra.
3. Nghiệm thu nhận/trả máy và ảnh trên Supabase thật, camera iPhone/Android; cấu hình HTTPS và dọn ảnh.
4. Bổ sung realtime khi cần; kiểm thử công việc đang mở qua nửa đêm và lỗi mạng trên thiết bị thật.
5. Nghiệm thu nhập Excel/công bố số liệu trên Supabase thật; mở rộng tổng theo khoảng thời gian khi cần.
6. Nghiệm thu PWA trên iPhone/Android thật, kiểm thử tải và phục hồi dữ liệu. Nền tảng PWA đã có trong code giai đoạn 6.

Không mở quyền ghi rộng để thay thế RPC. Kiểm thử SQL cục bộ không thay thế OAuth/RLS/storage và nhiều kết nối thực tế.
