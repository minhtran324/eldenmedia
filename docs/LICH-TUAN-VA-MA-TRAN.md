# Đăng ký tuần và ma trận xếp phòng — SQL 014

## Bật trên dự án hiện tại

1. Kiểm tra Supabase đã chạy các migration đến SQL 013. Không chạy lại bootstrap hoặc xóa dữ liệu.
2. Mở `supabase/migrations/202609300014_weekly_scheduling.sql`, sao chép toàn bộ vào Supabase → SQL Editor → New query → Run bằng tài khoản quản trị database.
3. Chạy `npm.cmd run db:check` tại `C:\EldenMedia`. Kết quả mong đợi: schema `202609300014`.
4. Khởi động lại web bằng cách đang sử dụng. Nếu chạy production: dừng tiến trình web cũ, chạy `npm.cmd run build`, rồi `npm.cmd run start`. Giữ cấu hình Cloudflare Tunnel hiện có.

Migration bổ sung hai bảng có RLS, các RPC và thay phần tiếp nhận lịch ngày bằng một wrapper tương thích luồng Vận hành hiện có. Không xóa lịch, ca hoặc lịch sử đã lưu. Chưa áp dụng migration trên Supabase thật từ phiên phát triển này.

Nếu đã chạy SQL 014 trước đó, chạy tiếp `supabase/migrations/202609300015_room_availability_fix.sql`. SQL 015 sửa trường hợp check-in chưa checkout của một ngày làm các ngày tương lai bị tô kín. Nếu ma trận vẫn kín, kiểm tra mục Vận hành → Ca live & thiết bị: một phòng đang có lượt check-in mở vẫn phải được checkout trước khi dùng lại trong cùng ngày.

## Idol

- Vào **Lịch live → Đăng ký cả tuần**, đường dẫn `/idol/schedule/register`.
- Chủ nhật theo giờ Việt Nam mở đăng ký tuần kế tiếp, từ thứ Hai đến Chủ nhật.
- Chọn rõ cả 7 ngày: ngày làm hoặc nghỉ. Mỗi ngày làm chọn 1 ca 5 tiếng hoặc 2 ca tổng đúng 5 tiếng. Không bắt buộc làm cả 7 ngày.
- Chọn giờ bằng các nút; có nút áp dụng ca đang chọn cho các ngày chưa chọn, và nút cho các ngày chưa chọn nghỉ. Kiểm tra bảy thẻ ngày trước khi gửi.
- Gửi một lần cho cả tuần. Nếu bất kỳ ngày nào không hợp lệ, toàn bộ lần gửi được hoàn tác. Vận hành vẫn xếp phòng và duyệt từng ngày làm.
- Lỡ Chủ nhật: chọn **Xin đăng ký trễ**, nhập lý do cho tuần hiện tại. Vận hành phụ trách hoặc Admin duyệt, sau đó Idol mở lại đăng ký tuần và gửi đủ các ngày còn lại. Ngày đã qua không được đăng ký bù giờ; ngày đã có lịch/yêu cầu được giữ lại.
- Quyền đăng ký trễ chỉ áp dụng cho tuần được duyệt, dùng một lần khi gửi tuần thành công. Đổi Vận hành khiến quyền do người cũ duyệt mất hiệu lực; Idol có thể xin lại để người mới duyệt.
- Sau khi đã gửi tuần, dùng các nút **Đổi lịch** / **Hủy ngày**. Quy tắc trước ca ít nhất 1 giờ và không sửa ngày đã có nhận máy/check-in vẫn được giữ.
- Bản xác nhận tuần là nội dung lúc gửi ban đầu; xem lịch và trạng thái hiện tại ở trang Lịch live.

## Vận hành và Admin

- Vào **Lịch live** để xử lý mục **Yêu cầu đăng ký trễ**. Vận hành chỉ xử lý Idol hiện thuộc team; Admin xử lý toàn bộ. Có hai nút riêng cho phép/từ chối; từ chối cần lý do.
- Chọn **Mở ma trận xếp phòng**: `/operator/schedule/board` hoặc `/admin/schedule/board`.
- Chọn ngày, chọn yêu cầu Idol trong hàng chờ. Hàng của bảng là phòng, cột là giờ. Các giờ Idol đăng ký được tô nền; phòng bận bị khóa; phòng đang chọn có màu riêng.
- Lịch đã duyệt trong phạm vi đọc hiện có hiển thị tên Idol. Phòng team khác vẫn có trạng thái trống/bận mà không mở thêm quyền đọc hồ sơ.
- Bấm từng ô trống để chia phòng, hoặc **Gán ca 1**, **Gán ca 2**, **Gán cả ngày**. Khoảng nghỉ giữa hai ca không chiếm phòng.
- **Gợi ý xếp phòng** ưu tiên ít chuyển phòng trong mỗi ca; khi ngang nhau ưu tiên phòng cùng team. Đây là gợi ý cho yêu cầu đang chọn, không phải thuật toán tối ưu đồng thời toàn bộ lịch công ty.
- Các nút **Xóa lựa chọn**, **Tải lại phòng trống**, **Duyệt lịch**, **Gửi yêu cầu mượn phòng**, **Từ chối** tách riêng theo ngữ cảnh. Không dùng dropdown để chọn chức năng.
- Mượn phòng team khác vẫn cần chủ phòng chấp nhận theo luồng hiện có. Yêu cầu chờ không giữ chỗ; lần duyệt cuối luôn kiểm tra xung đột lại trong database.
- Thông báo đăng ký và quyết định nằm trong chuông → Lịch live. Không cần tạo Cron mới.

Username TikTok được hiển thị cạnh tên Idol trong lịch tuần, yêu cầu xếp phòng và danh sách team. Idol cập nhật username tại **Hồ sơ của tôi**; Admin xem username trong quản lý nhân sự và dữ liệu Excel. Chạy thêm migration 016 để bật đồng bộ này.

## Kiểm tra và giới hạn nghiệm thu

- Lint và production build; bộ SQL hồi quy gồm tài khoản, phòng/máy, lịch, vận hành ca, trang chủ, thông báo, Excel và đăng ký tuần. Kiểm tra thuật toán gợi ý phòng và chặn các URL mới khi chưa đăng nhập.
- SQL được kiểm thử trong PostgreSQL WASM/PGlite cục bộ; không thay thế kiểm thử nhiều kết nối trên Supabase thật.
- Sau khi chạy migration, dùng một tài khoản Idol và một Vận hành thử: xin trễ → duyệt → gửi tuần → mở ma trận → gán phòng → duyệt → Idol xem lịch. Thử thêm sai team, mượn phòng và hai người cùng chọn một phòng.
- Chưa kiểm thử trực tiếp giao diện bằng các phiên Google đăng nhập thật hoặc trên Safari/iPhone. Cần nghiệm thu sau khi áp dụng SQL.
- Điều phối lại phần còn lại của ca đã check-in vẫn là hạng mục riêng; bản này sắp xếp các lịch chưa bắt đầu theo các quy tắc hiện có.
