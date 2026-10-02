# Giai đoạn 3 — Nhận/trả máy và camera check-in/out

## Bật chức năng

1. Database phải có SQL 001–007. Supabase → SQL Editor → chạy `supabase/migrations/202609300008_live_operations.sql` một lần.
2. File này tạo RPC và bucket **private** `room-attendance`, cùng policy Storage. Không cần tự tạo bucket hoặc mở public.
3. Trong `C:\EldenMedia`, chạy `npm.cmd install`, `npm.cmd run db:check` (schema `202609300008`), khởi động lại `npm.cmd run dev`.
4. Mỗi vai trò có menu **Ca live & thiết bị** tại `/idol/operations`, `/operator/operations`, `/admin/operations`.

Chưa tự chạy SQL hoặc cấu hình Cron trên Supabase của bạn. Bootstrap vẫn là 004; dự án mới chạy bootstrap → 005 → 006 → 007 → 008.

## Idol nhận và trả máy

- Chọn **Nhận máy**, chọn đoạn phòng trong lịch đã duyệt hôm nay, mở camera quét QR dán trên máy.
- Máy được gán đúng phòng và đang trống: nhận ngay. Máy khác phòng/chưa gán phòng: tạo yêu cầu chủ máy duyệt, chưa được nhận trước khi được đồng ý.
- Một Idol chỉ giữ một máy. Máy chờ xác nhận trả vẫn đang bị giữ; không thể nhận máy khác.
- Trả: đặt máy tại bàn chung, chọn **Trả máy tại bàn chung**, quét QR máy. Vận hành hiện tại của Idol hoặc Admin kiểm tra rồi duyệt.
- Chủ máy chỉ có quyền duyệt mượn; không tự có quyền duyệt trả nếu không đồng thời quản lý Idol.
- Nếu bị từ chối trả, máy vẫn đang được giữ. Xem thông báo, xử lý lý do rồi quét trả lại.
- Không bắt buộc lấy máy công ty để check-in phòng. Hoàn tất ca không tự trả máy.

## Idol check-in/out phòng

- Có lịch được duyệt cho hôm nay. Mở **Check-in phòng**, chọn đoạn phòng rồi quét QR phòng tương ứng.
- Server ghi thời điểm quét, tạo phiên chụp có hiệu lực 5 phút; chưa tạo bản ghi vào ca ở bước này.
- Hướng camera vào toàn cảnh phòng, bấm **Chụp ảnh phòng**, kiểm tra ảnh rồi **Xác nhận ảnh & ghi nhận**.
- Ảnh tải lên thành công mới hoàn tất check-in. Thời gian bắt đầu là thời điểm server nhận lần quét QR, không phải lúc tải ảnh xong.
- UI chỉ chụp trực tiếp bằng camera, không có chọn ảnh thư viện. QR và ảnh trong ứng dụng web không phải bằng chứng chống giả mạo tuyệt đối; không có xác thực phần cứng cho camera/vị trí.
- Muộn được lưu bằng giây, giao diện và thông báo làm tròn lên phút. Có thể ghi chú như “trễ do đổi phòng”. Admin và vận hành hiện tại nhận thông báo.
- Checkout tương tự: chọn đoạn đang mở → quét QR phòng → chụp ảnh → ghi lý do → xác nhận. Sớm/trễ đều cần lý do. Không checkout bù và không nhập lại giờ quá khứ.
- Chuyển phòng theo lịch: checkout đoạn trước rồi check-in đoạn tiếp. Hoàn tất các đoạn mới hoàn tất ca; hoàn tất mọi ca mới hoàn tất ngày.
- Ca còn mở qua nửa đêm vẫn hiện để checkout. Đăng nhập lại cũng không mất trạng thái ca đã ghi nhận.
- Lỗi mạng: bấm xác nhận lại cùng phiên chụp không tạo bản ghi trùng. Nếu quá 5 phút, quét/chụp lại. Không thể thay ảnh đã xác nhận.

Camera cần quyền truy cập của trình duyệt. Trên máy tính dùng localhost được; trên điện thoại phải mở website bằng HTTPS. Mở địa chỉ LAN `http://192.168...` thường không có quyền camera; chưa coi đây là lỗi QR. Chưa kiểm thử Safari/iPhone hay Android bằng camera thật.

## Vận hành / Admin

- **Máy chưa xác nhận trả**: xem máy do mình quản lý hoặc do Idol của mình đang giữ; Admin xem toàn bộ.
- **Yêu cầu thiết bị cần duyệt**: chủ máy duyệt mượn khác phòng; vận hành Idol duyệt trả. Quyền được kiểm tra lại ở database lúc duyệt, kể cả sau khi đổi team/chủ máy.
- **Lịch sử vào/ra phòng**: giờ thực tế, số phút muộn, ghi chú và ảnh trong thời hạn lưu. RLS giới hạn theo team hiện tại; chủ phòng team khác không được xem ảnh chỉ vì sở hữu phòng.
- Mỗi lần xử lý cần tải lại để xem cập nhật từ người khác; chưa có realtime.

## Ảnh 30 ngày và tác vụ dọn Storage

**RLS chặn đọc ảnh hết 30 ngày ngay cả khi tác vụ dọn chưa chạy. Xóa file vật lý cần cấu hình tác vụ dưới đây.**

Ảnh đi qua `/api/attendance/photos/<id>` có kiểm tra phiên/quyền và `Cache-Control: private, no-store`; không tạo URL public. Metadata/giờ ca được giữ sau khi xóa ảnh.

Sau khi website có domain HTTPS hoạt động công khai:

1. Trong biến môi trường của **server**, thêm:

   ```env
   SUPABASE_SERVICE_ROLE_KEY=service_role_key_cua_project
   ATTENDANCE_CLEANUP_SECRET=chuoi_ngau_nhien_it_nhat_32_ky_tu
   ```

   Giữ key ngoài mã nguồn, không thêm tiền tố NEXT_PUBLIC_. Không cần hai biến này để thử nhận/trả và chụp ảnh; chúng chỉ dùng cho dọn Storage.

2. Có thể tạo secret trên máy bằng:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Supabase → Vault: tạo `elden_app_url` chứa domain HTTPS của web (không phải URL Supabase), và `elden_attendance_cleanup_secret` chứa cùng giá trị secret trên server.
4. Bật extensions `pg_cron`, `pg_net` trong Supabase.
5. Chạy `supabase/enable-attendance-cleanup-cron.sql`. Job gọi endpoint dọn ảnh mỗi giờ tại phút 15. Cloud Supabase không gọi được localhost trên máy bạn.
6. Theo dõi kết quả HTTP trong `net._http_response`; Cron báo gửi thành công chưa khẳng định HTTP trả 200. Endpoint cần trả 200 và bộ đếm xử lý. Chưa cấu hình service key trả 503; secret không khớp trả 401.

Job dùng Storage API để xóa file rồi đánh dấu `deleted_at`, không xóa trực tiếp bảng `storage.objects`. Mỗi lượt tối đa 1.000 ảnh hết hạn và 1.000 phiên chụp bỏ dở đã hết hạn hơn 24 giờ; lượt tiếp xử lý phần còn lại. Dọn ảnh vật lý diễn ra ở lượt chạy thành công sau mốc hết hạn, không cam kết đúng từng giây.

Tham khảo chính thức: [Supabase Cron](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [Vault](https://supabase.com/docs/guides/database/vault).

## Nghiệm thu

1. Admin tạo QR phòng/máy, có hai vận hành A/B và Idol thuộc A, lịch hôm nay đã duyệt.
2. Idol nhận máy đúng phòng → có máy đang giữ. Thử nhận thêm máy → bị chặn.
3. Quét trả → chưa giải phóng máy. A/Admin duyệt trả → mới được nhận máy tiếp.
4. Nhận máy do B quản lý, khác phòng → chờ B duyệt. A không duyệt mượn được; B không duyệt trả được nếu Idol vẫn thuộc A.
5. Check-in sai QR phòng → bị chặn. Đúng QR nhưng chưa tải ảnh → chưa vào ca.
6. Check-in thành công, mở lại trang → ca vẫn mở. Checkout thiếu lý do/ảnh → bị chặn.
7. Ca có hai phòng: checkout phòng đầu không hoàn tất toàn ca; ra phòng cuối mới hoàn tất. Máy chưa trả vẫn hiện độc lập.
8. Thử bằng hai trình duyệt/tài khoản và camera điện thoại thật. Kiểm tra các URL ảnh bằng tài khoản khác team.

Kiểm thử cục bộ: `node tests/operations-sql.mjs` sau `npm.cmd --prefix tests install`; `node tests/qr-roundtrip.mjs`; `node --experimental-strip-types tests/qr-parser.mjs`; lint/build. SQL PGlite mô phỏng Auth/Storage metadata; không xác minh file thật trên Supabase, camera thật, Cron thật hay nhiều kết nối đồng thời.

## Chưa thuộc phần này

- Điều phối đổi phương án phòng đột xuất khi ca đã bắt đầu: hiện hỗ trợ chuyển qua các đoạn đã duyệt, không sửa lại dấu vết ca đang live.
- Bảng Excel, giao diện trang chủ/ranking/poster/sinh nhật, kiểm thử tải và hoàn thiện PWA.
