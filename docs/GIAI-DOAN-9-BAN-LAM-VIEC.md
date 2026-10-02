# Bàn làm việc 3D, hồ sơ bắt buộc và quyền kim cương

## Kích hoạt database

**Nếu Supabase đang ở schema 021 (đã kiểm tra trên project hiện tại):** chạy một lần toàn bộ file `supabase/updates/202610020023_upgrade_from_021.sql`. File này gộp 022 và 023 trong cùng một transaction. Không cần chạy lại hai file lẻ sau đó.

Mã nguồn dùng migration `supabase/migrations/202610020023_workspaces_profiles_diamond_access.sql` sau các migration 001–022. Mở Supabase Dashboard → SQL Editor → New query, dán toàn bộ file 023 và Run. File dùng transaction, không xóa dữ liệu. Không tắt RLS.

Kiểm tra sau khi chạy:

```sql
select public.app_connection_status();
```

Kết quả cần có `schema_version = 202610020023`. Mã SQL đã được kiểm thử trong PostgreSQL cục bộ; việc áp dụng trên Supabase thật cần thực hiện riêng.

## Hồ sơ sau khi được duyệt

- Idol/Vận hành đang hoạt động nhưng thiếu thông tin được chuyển tới `/complete-profile`.
- Bắt buộc: họ tên, số điện thoại, ngày sinh. Idol cần thêm username TikTok.
- Ngày gia nhập do hệ thống ghi nhận khi duyệt; ảnh đại diện không bắt buộc.
- Hồ sơ đã đầy đủ được vào thẳng bàn làm việc. Admin được miễn bước này để tài khoản khởi tạo không bị khóa khỏi màn hình quản lý.
- Sau khi lưu đủ thông tin, chuyển về đúng bàn làm việc. Không được xóa trống trường bắt buộc của tài khoản đang hoạt động.
- Kiểm tra thực hiện ở trang, server action và database. RPC ghi lịch/check-in dùng chung kiểm tra hồ sơ, không thể bỏ qua bằng cách gọi trực tiếp.
- Các tài khoản đang dùng nhưng còn thiếu hồ sơ cũng phải hoàn thiện khi triển khai SQL 023. Nên triển khai giữa các ca và báo nhân sự chuẩn bị số điện thoại, ngày sinh, username TikTok.

## Quyền số liệu

Trong **Số liệu kim cương**, Admin có hai công tắc chung theo vai trò và nút **Lưu quyền xem**:

| Người xem | Quyền cơ bản | Khi Admin bật quyền mở rộng |
|---|---|---|
| Idol | Số kim cương của mình; thứ hạng Idol khác | Xem số kim cương Idol khác |
| Vận hành | Số kim cương team đang phụ trách; thứ hạng toàn công ty | Xem số kim cương ngoài team |
| Admin | Toàn bộ số liệu, tổng công ty, tổng mỗi team | Luôn có quyền |

- Giá trị cài đặt trước đó trong SQL 022 được giữ lại. Admin có thể đổi hai công tắc sau khi triển khai.
- Giá trị không có quyền xem trả về `NULL` ngay từ database, bao gồm RPC báo cáo cũ và bảng tin; không chỉ ẩn bằng CSS.
- Mở quyền số liệu không mở quyền đọc số điện thoại, hồ sơ, lịch live của người khác. Bảng số liệu thô vẫn giữ RLS theo cá nhân/team.
- Vận hành mặc định lọc **Team của tôi**, có nút **Toàn công ty**. Ngoài phạm vi được cấp vẫn chỉ thấy thứ hạng.
- Admin bấm thẻ team Vận hành để lọc Idol; mỗi thẻ có tổng ngày, tổng tháng và số Idol có dữ liệu.
- Phân team theo người phụ trách **hiện tại**; đổi phân công sẽ chuyển cả số liệu lịch sử của Idol sang nhóm team mới khi xem báo cáo. Tổng chỉ tính Idol đang hoạt động, thống nhất với bảng xếp hạng hiện tại.
- Lũy kế tháng chỉ tính từ đầu tháng đến ngày được chọn. Không tự lấy tháng trước để điền vào một ngày không có số liệu.
- Thứ hạng công ty được giữ nguyên khi lọc/tìm kiếm, đồng điểm cùng hạng. Ngày chưa có dữ liệu khác với kim cương bằng 0. Số lớn xử lý bằng chuỗi/BigInt.

## Bàn làm việc

- `/operator`: team, trạng thái sử dụng phòng, yêu cầu chờ, kim cương team, ca live hôm nay; nút riêng mở ma trận, lịch, hoạt động và số liệu.
- `/idol`: ca đang diễn ra/ca kế tiếp, nút vào ca hoặc tiếp tục check-out, lịch tuần, kim cương cá nhân, Vận hành phụ trách.
- Three.js dựng hình khối riêng, không dùng gói icon, mô hình tải ngoài hoặc texture cho phần bàn làm việc mới. Thanh điều hướng dùng thiết kế sẵn có của ứng dụng.
- Có nút tạm dừng chuyển động; tuân thủ `prefers-reduced-motion`, dừng render khi tab ẩn hoặc cảnh ra khỏi màn hình. Giới hạn khoảng 30 khung hình/giây, pixel ratio tối đa 1.5. Có hình CSS dự phòng khi WebGL không khả dụng.
- Dữ liệu bàn làm việc làm mới mỗi phút khi trang đang mở; check-in là ghi nhận sử dụng phòng, không được suy thành thời gian live TikTok.

## Kiểm tra

Đã kiểm thử SQL 001–023 cục bộ, quyền theo vai trò, hoàn thiện hồ sơ, bộ lọc/rank, TypeScript, ESLint và giao diện mẫu desktop/mobile. Kiểm thử trình duyệt dùng dữ liệu mẫu, không đại diện cho việc đăng nhập thật trên Supabase.

Sau khi chạy SQL thật, thử một tài khoản Idol thiếu hồ sơ, một Vận hành và một Admin: hoàn thiện hồ sơ, bật/tắt quyền, lọc team, xem tổng ngày/tháng và mở check-in/out. Không cần thay `.env.local`, Google OAuth hoặc APP_URL cho đợt cập nhật này.

Kiểm thử cục bộ (cần cài dependency trong `tests/package.json` cho PGlite):

```powershell
cd C:\EldenMedia
node tests/workspace-access-sql.mjs
node --experimental-strip-types tests/workspace-access-ui.mjs
npm.cmd run typecheck
```
