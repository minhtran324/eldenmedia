# Giai đoạn 2B — Lịch live và phân phòng

## Kích hoạt

1. Database phải có 001–006. Nếu chưa chạy 006, chạy 006 trước.
2. Supabase → SQL Editor → chạy toàn bộ `supabase/migrations/202609290007_scheduling.sql` một lần.
3. Trong C:\EldenMedia, chạy `npm.cmd run db:check` (schema 202609290007), khởi động lại `npm.cmd run dev`.
4. Mỗi vai trò có mục **Lịch live** trên menu.

Không chạy lại bootstrap. Bootstrap vẫn ở 004; project mới chạy bootstrap → 005 → 006 → 007. Chưa tự áp dụng SQL lên Supabase thật.

## Idol

- Mở `/idol/schedule`, chọn tuần và ngày làm việc.
- Đăng ký ngày mới vào Chủ nhật, cho Thứ hai–Chủ nhật tuần tiếp theo; không bắt buộc làm đủ bảy ngày.
- Gửi từng ngày: 1 hoặc 2 ca theo giờ tròn, mỗi ca 1–5 tiếng, tổng đúng 5 tiếng; không trùng giờ.
- Không chọn phòng. Ngày mới chưa chiếm lịch/phòng khi đang chờ duyệt.
- Đổi nguyên ngày hoặc yêu cầu hủy ngày đã duyệt ít nhất 1 giờ trước cả ca cũ và ca mới sớm nhất. Hủy cần lý do.
- Lịch đã duyệt vẫn giữ trong lúc chờ thay đổi. Yêu cầu bị từ chối không ảnh hưởng lịch cũ.

## Vận hành và Admin

- Mở `/operator/schedule` hoặc `/admin/schedule`. Vận hành chỉ thấy Idol hiện tại; Admin thấy toàn công ty.
- Có thể gửi lịch ngoài Chủ nhật cho Idol phụ trách. Sau khi gửi, chọn tuần chứa ngày vừa gửi để mở yêu cầu.
- Bấm **Xếp phòng / xử lý** trên yêu cầu.
- **Gợi ý phòng trống** tìm phương án ít chuyển phòng nhất cho từng ca; trong phương án ngang nhau, ưu tiên cùng team. Nếu có một phòng phủ cả ca, luôn ưu tiên hơn ghép phòng.
- Có thể kéo thẻ phòng vào ô giờ bằng chuột hoặc chọn phòng ở từng ô trên di động. Các giờ liên tục cùng phòng được gộp thành một đoạn, không tạo checkout giữa từng giờ.
- Bấm **Duyệt / gửi mượn phòng**. Nếu toàn bộ cùng team, lịch được duyệt ngay. Phòng khác team cần chủ phòng duyệt. Admin có quyền duyệt thay.
- Chủ phòng thấy yêu cầu trong **Yêu cầu mượn phòng cần bạn duyệt**, gồm mã phòng/ngày/giờ; không được xem hồ sơ riêng của Idol team khác.
- Khi chủ phòng cuối cùng đồng ý, hệ thống kiểm tra lại toàn bộ phòng rồi mới cập nhật lịch. Các yêu cầu chờ không giữ chỗ.
- Nếu phòng vừa bị đặt, quyết định cuối rollback; lịch cũ giữ nguyên. Người xếp phòng mở lại yêu cầu, tải lại và chọn phương án khác.
- Từ chối cần lý do; từ chối một yêu cầu mượn sẽ từ chối phương án cả ngày, hủy các yêu cầu con còn chờ. Người đăng ký có thể gửi lại.
- Gửi lại phương án phòng thay thế các yêu cầu mượn phòng cũ. Version/revision ngăn tab cũ ghi đè quyết định mới.

## Ranh giới và bảo vệ dữ liệu

- Toàn bộ thay đổi nguyên ngày nằm trong một transaction, giữ phiên/đoạn cũ ở trạng thái cancelled và có audit. Không xóa lịch sử.
- Đã có bất kỳ nhận máy/check-in trong ngày thì khóa thay lịch nguyên ngày. Chuyển phòng theo kế hoạch đã duyệt được hỗ trợ qua nhiều đoạn; thao tác điều phối một ca đang live cần RPC riêng ở giai đoạn check-in, chưa có trong phần này.
- Khi đổi team, vận hành cũ mất quyền xử lý; phương án cũ không tự được duyệt. Vận hành mới xếp lại hoặc từ chối/gửi lại.
- SQL 007 sửa quyền của deferred validation triggers để kiểm tra cuối transaction hoạt động qua RPC authenticated, không mở quyền gọi hàm private.
- Các RPC lịch dùng cùng khóa tài nguyên `(20260929,6)` với SQL 006 và kiểm tra trùng phòng tại thời điểm áp dụng. Constraint exclusion của PostgreSQL tiếp tục là lớp bảo vệ cuối.
- Trang tuần phân trang yêu cầu; đọc các đoạn phòng theo lô để tránh mất dữ liệu do giới hạn trả về mặc định 1.000 dòng.
- Thông báo trong web hiển thị 10 mục gần nhất. Chưa có chuông realtime/đánh dấu đã đọc.
- Không giữ chỗ, không tự hết hạn hoặc tự duyệt; chưa có thao tác hàng loạt cả tuần, nhận/trả máy hay camera trong bản này.

## Kiểm thử

- `npm.cmd run lint`, `npm.cmd run build` (gồm TypeScript).
- `node --experimental-strip-types tests/scheduling-algorithm.mjs`: ngày/tuần và thuật toán phân phòng.
- `npm.cmd --prefix tests install`, `node tests/scheduling-sql.mjs`: SQL PGlite với vai trò authenticated, kế thừa kiểm thử tài khoản và tài nguyên.
- `node tests/auth-http.mjs http://localhost:3100`: dùng khi server kiểm thử chạy cổng 3100 và APP_URL đồng bộ.
- SQL cục bộ kiểm tra phân quyền, 5 tiếng/ngày, lịch chờ không giữ chỗ, kiểm tra xung đột khi duyệt cuối, rollback, thay team, bảo toàn lịch cũ, hủy ngày, khóa sau check-in.
- Chưa kiểm thử browser với tài khoản Google thật, thao tác kéo thả trên thiết bị thật hoặc nhiều kết nối PostgreSQL đồng thời. Cần áp dụng 007 và chạy nghiệm thu bên dưới.

## Nghiệm thu trên Supabase

1. Admin có hai vận hành A/B, mỗi người có phòng; Idol được gán cho A.
2. A gửi ngày tương lai cho Idol, chọn 1 ca 5 tiếng, xếp phòng A → Idol thấy lịch đã duyệt.
3. A gửi đổi ngày đó sang phòng B → lịch cũ còn nguyên, B thấy yêu cầu mượn.
4. B duyệt → Idol thấy phòng mới; A không còn giữ phòng cũ.
5. Lặp lại với hai ca 2+3 tiếng và phương án ghép nhiều phòng.
6. Tạo một lịch khác chiếm phòng trong lúc yêu cầu mượn chờ → duyệt mượn phải báo xung đột, lịch cũ không đổi.
7. Idol yêu cầu hủy trước hạn → A duyệt → cả ngày được hủy; không cho hủy một ca làm thiếu 5 tiếng.

Phần tiếp theo: nhận/trả máy bằng QR, duyệt chủ máy, ảnh camera và check-in/out theo từng đoạn phòng.
