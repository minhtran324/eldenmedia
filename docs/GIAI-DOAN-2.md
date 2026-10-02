# Giai đoạn 2A — Danh mục phòng và điện thoại

Đã có code quản lý tài nguyên. Chưa tự áp dụng SQL lên Supabase.

## Kích hoạt

1. Đảm bảo đã chạy 005 và đăng nhập được Admin.
2. Supabase → SQL Editor → chạy toàn bộ `supabase/migrations/202609290006_resources.sql` một lần.
3. Trong `C:\EldenMedia`, chạy `npm.cmd install`, `npm.cmd run db:check` (schema 006), rồi `npm.cmd run dev`.
4. Admin → **Phòng & điện thoại** (`/admin/resources`). Vận hành xem tại `/operator/resources`.

Không chạy lại bootstrap/001–005. Migration 006 thêm version, chỉ mục mã không phân biệt hoa thường và RPC; không xóa dữ liệu.
Nếu chỉ mục phát hiện mã cũ trùng nhau khi bỏ khoảng trắng/chuyển hoa, toàn bộ migration rollback. Kiểm tra và sửa dữ liệu trùng trước, không reset database.

## Thứ tự nhập dữ liệu

- Cấp quyền vận hành tại trang Admin; vận hành đăng nhập Google để kích hoạt.
- Có sẵn 3 tầng; sửa tên, mã, thứ tự hoặc thêm tầng.
- Tạo phòng: mã, tên, tầng, Studio/Live thường, vận hành phụ trách, trạng thái.
- Tạo máy: mã máy, phòng được gán (có thể để trống), vận hành phụ trách, trạng thái.
- Tải PNG QR phòng/máy, in và dán đúng tài nguyên. In kèm mã hiển thị trên nhãn để tránh nhầm.

## Quy tắc

- Admin tạo/sửa qua RPC có kiểm tra quyền tại database. Operator chỉ tra cứu; không mở quyền ghi trực tiếp.
- Mỗi phòng tối đa một máy được gán. Bỏ gán máy cũ trước khi gán máy khác.
- Hoạt động/Bảo trì/Ngừng sử dụng là tình trạng tài nguyên, không phải thông tin còn trống theo khung giờ.
- Máy chưa được xác nhận trả không sửa được, kể cả đã gửi yêu cầu trả.
- Phòng còn ca chưa checkout hoặc lịch được duyệt chưa kết thúc không sửa được.
- Không có xóa cứng; dùng Ngừng sử dụng để giữ lịch sử.
- Người phụ trách phải là vận hành đang hoạt động. Phòng nhận gán máy phải hoạt động.
- Sửa dữ liệu giữ nguyên QR. Form cũ bị từ chối nếu tài nguyên đã đổi ở tab khác; tải lại trước khi tiếp tục.
- Tầng/phòng/máy có audit. Danh mục khác team không mở quyền xem hồ sơ nhân sự; operator chỉ thấy tên team mình, các team còn lại ghi Team khác.

## QR và phần sẽ triển khai tiếp

Nội dung QR: `elden:v1:room:<uuid-token>` hoặc `elden:v1:device:<uuid-token>`.
Token sinh trong database và không phụ thuộc domain. Đây là định danh, KHÔNG phải mật khẩu hay bằng chứng đã có mặt; QR có thể được sao chép.
API tải PNG chỉ cho Admin. Máy quét nghiệp vụ sau này phải xác thực tài khoản, lịch/phòng, quyền mượn và ảnh theo yêu cầu.
Chưa có chức năng nhận/trả máy, quét check-in/out, đặt lịch, duyệt mượn phòng hoặc xoay vòng QR trong phần này.

RPC tài nguyên sử dụng advisory lock `(20260929,6)`. Các RPC đặt lịch/nhận máy trong giai đoạn tiếp phải lấy cùng lock trước khi kiểm tra và ghi tài nguyên; không mở DML trực tiếp để bỏ qua quy tắc này.

## Kiểm thử

`npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`.

SQL giả lập cục bộ: `npm.cmd --prefix tests install`, sau đó `node tests/resources-sql.mjs`.
Bao gồm kiểm thử nền tài khoản và quyền tài nguyên, QR giữ nguyên, mã trùng, một máy/phòng, version cũ, ca đang dùng và máy chưa trả.
Không thay thế kiểm thử OAuth, RLS trên Supabase thật hoặc nhiều kết nối đồng thời.

Tiếp theo: đăng ký lịch 1–2 ca đủ 5 tiếng/ngày, phân phòng, duyệt mượn phòng; sau đó nhận/trả máy và camera check-in/out.
