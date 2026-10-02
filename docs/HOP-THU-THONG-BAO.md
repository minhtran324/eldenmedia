# Hộp thư thông báo — SQL 011

## Kích hoạt

1. Chạy `supabase/migrations/202609300011_notification_inbox.sql` trong Supabase SQL Editor sau SQL 010. Không chạy lại bootstrap.
2. `npm.cmd run db:check` phải báo schema `202609300011`.
3. Khởi động lại web; giữ Tunnel đang chạy. Bấm chuông góc trên bên phải hoặc menu **Hộp thư thông báo**.

## Cách sử dụng

- Sáu hộp thư độc lập: Lịch live, Mượn phòng, Điện thoại, Check-in/out, Sinh nhật, Hệ thống. Không có danh sách gộp tất cả.
- Chuông hiển thị tổng chưa đọc; mở chuông để thấy số chưa đọc theo từng luồng và chọn hộp thư.
- Mỗi mục có lọc chưa đọc, đánh dấu từng thông báo đã đọc, thời gian Việt Nam, phân trang 20 thông báo và liên kết đến màn hình nghiệp vụ.
- Chuông tải số mới mỗi 60 giây khi tab đang hiển thị, khi quay lại tab/mở chuông hoặc đánh dấu đã đọc. Đây là polling, chưa dùng Supabase Realtime. Danh sách hộp thư tải mới khi điều hướng/tải lại trang.
- Đã bỏ danh sách thông báo gộp trong Lịch live và Ca live & thiết bị. Các yêu cầu cần duyệt trên hai màn hình vẫn giữ nguyên.
- Thông báo là hộp thư cá nhân: kể cả Admin chỉ thấy các thông báo gửi cho mình tại đây. Đây không phải trang quản lý tất cả yêu cầu của công ty.

## Dữ liệu và quyền

- Giữ nguyên ID, nội dung, thời gian, trạng thái đã đọc và khóa chống trùng sinh nhật.
- SQL chuyển thông báo vận hành cũ sang nhóm thiết bị/điểm danh dựa trên mẫu nội dung đã phát sinh; thông báo mới được phân loại ở hàm tạo trước khi gắn tên Idol.
- `category` là cột generated từ event_type. Những loại chưa ánh xạ được đưa vào Hệ thống; không làm mất thông báo.
- Count RPC dùng security invoker và recipient hiện tại, tuân thủ RLS kể cả khi chuyển team hoặc khóa tài khoản. Dùng SQL aggregate để không bị giới hạn 1.000 bản ghi.
- RPC đánh dấu đã đọc hiện có chỉ sửa thông báo thuộc chính người nhận. Không mở quyền ghi bảng cho frontend.
- API counts và các trang hộp thư bảo vệ bằng phiên đăng nhập, không cache công khai. Không cần service key, biến môi trường mới, hoặc thay job Cron.

## Kiểm tra

- Lint/build, 169 kiểm thử SQL tích hợp (`node tests/notification-inbox-sql.mjs`), kiểm tra HTTP đường dẫn chưa đăng nhập.
- Kiểm thử gồm phân loại cũ/mới, số riêng từng nhóm, Admin chỉ đếm hộp thư của mình, đánh dấu không sửa người khác, hơn 1.000 thông báo, đổi team, tài khoản khóa.
- Chưa áp dụng migration hoặc nghiệm thu giao diện bằng tài khoản thật trên Supabase. Sau khi chạy SQL, thử bằng Admin và Vận hành: chuông → Sinh nhật, đánh dấu đã đọc, xem số giảm; thông báo nhóm khác không xuất hiện trong mục Sinh nhật.

## Hiển thị theo vai trò

- Admin/Vận hành: cả 6 mục. Idol: Lịch live, Điện thoại, Check-in/out, Sinh nhật, Hệ thống.
- Chuông, tab hộp thư và API số chưa đọc dùng chung quy tắc hiển thị. Mục ẩn không cộng vào huy hiệu của Idol.
- Idol nhập URL mục Mượn phòng sẽ xem mục Lịch live thay thế.
- Đây là cập nhật hiển thị ở ứng dụng; RLS dữ liệu hiện hành vẫn được giữ. Không cần migration mới sau 011. Sinh nhật hôm nay trên Trang chủ vẫn hiển thị cho Idol.

## SQL 012 — Idol nhận nhắc sinh nhật

Chạy migration 202609300012_idol_birthday_notifications.sql sau 011. Idol hoạt động nhận nhắc sinh nhật toàn công ty như Admin/Vận hành, gồm chính mình nếu phù hợp. Giữ khoảng hôm nay đến 3 ngày tới và chống trùng. RLS chỉ cho Idol xem thông báo gửi cho mình, không mở hồ sơ người khác. Giữ nguyên Cron; có thể gọi `select private.send_birthday_reminders();` để tạo thông báo ngay. Không phát lại sinh nhật đã qua. Agent chưa áp dụng SQL trên Supabase thật.
