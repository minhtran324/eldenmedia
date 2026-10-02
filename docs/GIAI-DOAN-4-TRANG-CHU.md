# Giai đoạn 4 — Trang chủ nội bộ

## Kích hoạt

1. Database đang ở SQL 008. Mở Supabase → SQL Editor → chạy toàn bộ `supabase/migrations/202609300009_homepage_workspace.sql` một lần.
2. Không chạy lại bootstrap. Dự án mới: bootstrap 004 → 005 → 006 → 007 → 008 → 009.
3. Chạy `npm.cmd run db:check`: schema mong đợi `202609300009`.
4. Khởi động lại `npm.cmd run dev`, giữ Cloudflare Tunnel hiện tại chạy.
5. Đăng nhập, chọn **Trang chủ công ty** (`/home`). Admin có thêm **Quản lý bảng tin** (`/admin/content`). Các trang tổng quan vai trò vẫn giữ nguyên.

Agent chưa chạy migration trên Supabase thật. Không cần thêm biến môi trường hoặc service key cho trang chủ.

## Nội dung

- Admin tạo/sửa poster, thông báo, sự kiện. Có bản nháp, công bố và ẩn/lưu trữ; không xóa lịch sử bài.
- Ảnh JPG/PNG/WebP tối đa 10 MB, tải trực tiếp lên bucket private `homepage-media` bằng phiên Admin. Không đưa file vào Server Action.
- Poster công bố cần ảnh đã tồn tại; sự kiện cần thời điểm bắt đầu. Có địa điểm, liên kết HTTPS, ghim và phạm vi Admin/Vận hành/Idol.
- Các trường ngày giờ đều theo giờ Việt Nam, kể cả khi thiết bị dùng múi giờ khác. Hẹn giờ bắt đầu/kết thúc hiển thị được kiểm tra khi tải trang. Trang đang mở cần tải lại để phản ánh thay đổi.
- Bảng tin phân trang 12 bài; quản trị phân trang 10 bài. Có trạng thái lỗi và trống riêng.
- RPC kiểm tra quyền Admin và revision; hai tab sửa cùng bài thì lần lưu bằng revision cũ bị từ chối. Ghi trực tiếp bảng bằng authenticated đã bị thu hồi. Audit hiện hành vẫn lưu thay đổi.
- Ảnh phục vụ qua `/api/homepage/media/[id]`, kiểm tra cả RLS bài lẫn Storage dưới phiên người xem; không dùng public URL, service role hoặc cache dùng chung.
- Ảnh bỏ khỏi bài và ảnh tải lên nhưng chưa lưu vẫn ở Storage; chưa có job xóa ảnh homepage mồ côi. Không dùng job ảnh phòng 30 ngày để xóa poster.

## Ranking và sinh nhật

- Admin đổi kỳ ngày/tuần/tháng. Mặc định giữ cấu hình hiện tại (ban đầu tháng).
- Ranking sử dụng RPC đã có từ SQL 004, chỉ số liệu kim cương của import đã công bố, cùng tổng có cùng hạng. Không trả tổng kim cương ra trang chủ.
- Chưa có file Excel đã công bố thì hiển thị chưa có dữ liệu. Giao diện nhập Excel chưa được triển khai ở giai đoạn này.
- Sinh nhật hôm nay dành cho Idol/Vận hành đang hoạt động và bật hiển thị; không lộ năm sinh. Hiển thị tên và chữ cái đại diện, chưa nối luồng ảnh avatar.
- Nhắc trước 3 ngày đến mọi vận hành và Admin, không giới hạn team. SQL 009 cố định cấu hình nhắc toàn công ty theo yêu cầu.
- Muốn gửi nhắc tự động: Supabase → Integrations → Cron, bật `pg_cron`, rồi chạy `supabase/enable-birthday-cron.sql`. Job chạy trong database nên không phụ thuộc Cloudflare Tunnel hoặc máy tính bật. Script hiện có cũng chạy kiểm tra nhắc ngay một lần; có chống trùng mỗi người nhận/ngày sinh nhật.
- Chưa xác nhận Cron đã bật trên project thật. Thông báo được đọc qua các màn hình hiện hành, chưa có realtime.

## Nghiệm thu

1. Admin tạo bản nháp → Admin xem được, Idol/Vận hành không thấy.
2. Tải ảnh, công bố poster cho cả ba vai trò → mở Trang chủ, ảnh hiển thị trên điện thoại.
3. Giới hạn bài cho vận hành → Idol không đọc được bài hoặc URL ảnh.
4. Mở cùng bài ở hai tab, lưu tab một rồi tab hai → tab hai báo dữ liệu cũ.
5. Ẩn bài, hẹn giờ tương lai, hoặc đặt hết hạn → tài khoản thường không thấy nội dung sau khi tải lại.
6. Tạo sự kiện và kiểm tra giờ hiển thị Việt Nam.
7. Đổi kỳ ranking. Khi chưa nhập dữ liệu, không hiển thị thứ hạng giả.
8. Kiểm tra sinh nhật hôm nay và nhắc trước 3 ngày bằng tài khoản thử; khôi phục ngày sinh thật sau khi thử.

## Kiểm tra tự động

- `npm.cmd run lint`, `npm.cmd run build`.
- `node --experimental-strip-types tests/homepage-dates.mjs`.
- `npm.cmd --prefix tests install` nếu chưa cài bộ kiểm thử.
- `node tests/homepage-workspace-sql.mjs`: migrations 001–009 và kiểm thử quyền/revision/lịch/ca/ảnh.
- `node tests/homepage-sql.mjs`: ranking, sinh nhật, chống trùng và quy tắc hiển thị nền 004.
- `node tests/auth-http.mjs http://localhost:3100`: server kiểm thử phải chạy cổng 3100 với APP_URL tương ứng.

PGlite dùng Storage metadata giả lập. Chưa kiểm thử ảnh thật, OAuth với tài khoản thật, nhiều kết nối PostgreSQL đồng thời hoặc bố cục trên thiết bị thật của giai đoạn này.

## Tiếp theo

- Nhận file Excel mẫu, xác định cột ngày/TikTok ID/kim cương và quy tắc trùng; triển khai đối soát và công bố số liệu.
- Điều phối đổi phòng đột xuất trong ca đang live vẫn chưa triển khai; các đoạn chuyển phòng đã xếp trước vẫn hoạt động theo giai đoạn 3.
- Hoàn thiện hồ sơ TikTok/avatar, giờ công ty, hộp yêu cầu Admin thống nhất, thông báo và PWA theo roadmap.

## Cập nhật SQL 010 — Nhắc sinh nhật khi mới bật hệ thống

- Chạy `supabase/migrations/202609300010_birthday_catchup.sql` sau 009. Schema mới: `202609300010`. Agent chưa áp dụng trên Supabase thật.
- Giữ nguyên job `elden-birthday-reminders`; không cần tạo lại hoặc đổi lịch.
- Kiểm tra từ hôm nay đến 3 ngày tới theo ngày Việt Nam. Tiêu đề tương ứng hôm nay/ngày mai/sau 2 ngày/sau 3 ngày.
- Giữ khóa chống trùng theo người nhận, người sinh nhật và ngày sinh nhật trong năm; các thông báo đã gửi bởi phiên bản trước không bị gửi lại.
- Chỉ người có tài khoản hoạt động và bật hiển thị sinh nhật được nhắc; mọi Admin/Vận hành hoạt động là người nhận.
- Để kiểm tra ngay trong SQL Editor: `select private.send_birthday_reminders();`. Kết quả là số thông báo mới tạo; 0 không phải lỗi. Thao tác này thực sự tạo thông báo nội bộ nếu có người phù hợp.
- Sinh nhật 29/02 chỉ khớp đúng ngày 29/02 của năm nhuận; chưa có quy tắc chuyển sang 28/02 ở năm thường.
- Đã qua 157 kiểm thử SQL tích hợp, gồm ngày mai khi khởi tạo, nhập ngày sinh muộn, chống trùng, qua năm và quyền gọi hàm. Chưa xác nhận lần chạy Cron trên Supabase thật.
- Kiểm thử: `node tests/birthday-catchup-sql.mjs` sau khi cài dependency của tests.
