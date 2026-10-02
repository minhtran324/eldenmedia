# Bắt đầu Supabase cho Elden Media

## Bạn sẽ có gì

`C:\EldenMedia\supabase\elden-bootstrap.sql` là file SQL tổng hợp cho project mới, gồm các migration 001–004, chạy trong một transaction.
Nó tạo toàn bộ schema đã thiết kế, ràng buộc lịch/tài sản, phân quyền, RPC onboarding, dữ liệu trang chủ, ranking và sinh nhật.
Không cần copy từng đoạn SQL trong chat. Đây là database để bắt đầu phát triển, không phải toàn bộ ứng dụng đã hoàn thiện.

SQL không tự tạo giao diện, bật Google OAuth, đọc Excel hoặc chụp ảnh. Các RPC phòng/máy chưa triển khai vẫn khóa quyền ghi client.
Không seed nhân sự giả hoặc tài khoản Admin mặc định vào database thật.

## 1. Chọn đúng cách cài đặt

| Tình trạng project | Cách chạy |
|---|---|
| Chưa chạy SQL nào, chưa có bảng Elden | Chỉ chạy `elden-bootstrap.sql` |
| Đã chạy 001 | Chạy 002, 003, 004 theo thứ tự |
| Đã chạy 001 và 002 | Chạy 003, 004 |
| Đã chạy 001–003 | Chỉ chạy 004 |
| Đã chạy bootstrap hoặc 001–004 | Không chạy lại; dùng migration mới ở các lần cập nhật sau |

Không chạy cả bootstrap lẫn các migration mà bootstrap đã chứa.
Bootstrap kiểm tra `public.profiles`; nếu phát hiện schema cũ sẽ dừng trước khi tạo dữ liệu.
Các migration cũ không có cơ chế chạy lặp; đừng chạy lại để “thử cho chắc”.

## 2. Tạo project và chạy file

1. Vào https://supabase.com/dashboard, tạo project phát triển, ví dụ `elden-management-dev`, dùng Free.
2. Chọn region gần Việt Nam (Singapore nếu có), lưu mật khẩu database riêng.
3. Đợi project sẵn sàng, mở **SQL Editor → New query**.
4. Trong VS Code mở `C:\EldenMedia\supabase\elden-bootstrap.sql`, Ctrl+A → Ctrl+C.
5. Dán vào SQL Editor, đặt tên `Elden initial setup`, bấm **Run**. Chạy đúng project mới.
6. Thành công thì kiểm tra **Table Editor**. Nếu lỗi, lưu thông báo lỗi; không xóa bảng hoặc chạy tiếp phần cuối của file.

Kiểm tra phiên bản ngay trong SQL Editor:

```sql
select public.app_connection_status();
select version, applied_at from private.app_schema_migrations order by version;
```

Kết quả mong đợi: `application = elden-media`, `schema_version = 202609290004`, bốn dòng migration.
Các bảng đã có RLS nên đăng nhập thành công chưa đồng nghĩa đọc được tất cả dữ liệu.

## 3. Lấy URL và key để kết nối web

Trong project Supabase, bấm **Connect** để lấy **Project URL** và **Publishable key**.
Cũng có thể tìm key trong **Project Settings → API Keys**.

- URL đúng dạng `https://<project-ref>.supabase.co`, không phải URL trang Dashboard.
- Dùng Publishable key (thường bắt đầu bằng `sb_publishable_`).
- Không dùng database password, `sb_secret_...` hoặc `service_role` ở phía trình duyệt.

Trong VS Code mở `C:\EldenMedia\.env.local`. Nếu chưa có file, tạo bản sao `.env.example`; nếu đã có thì chỉnh tại chỗ, không ghi đè mất cấu hình.

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT-REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_THAY_BANG_KEY_CUA_BAN
```

Lưu file. File này đã được Git bỏ qua; không gửi nguyên nội dung vào chat.

Trong PowerShell:

```powershell
cd C:\EldenMedia
npm.cmd run db:check
```

Lệnh đọc `.env.local`, gọi RPC kiểm tra vô hại và chỉ in trạng thái/schema version; không in key.
Nếu RPC chưa tồn tại: kiểm tra đã chạy 004 hoặc bootstrap chưa, và URL có đúng project không.
Nếu Node báo không có `.env.local`: tạo file đúng tên, không để thành `.env.local.txt`.
Nếu thiếu thư viện: chạy `npm.cmd install` trước.

Khởi động web bằng `npm.cmd run dev`. Nếu web đang chạy thì Ctrl+C rồi chạy lại để nạp env.
Mở http://localhost:3000. Giao diện hiện tại vẫn là bộ khung; kết nối thành công không tự thêm màn hình đăng nhập.

## 4. Bật nhắc sinh nhật tự động

Quy tắc đã chốt: sinh nhật hôm nay hiển thị trên trang chủ; tất cả vận hành nhận nhắc trước 3 ngày. Admin cũng nhận thông báo.
Chỉ xét idol/vận hành active có ngày sinh và bật birthday_visible. Không tiết lộ năm sinh/tuổi trên trang chủ.

1. Trong Supabase mở **Integrations → Cron**, bật extension `pg_cron`.
2. Mở `C:\EldenMedia\supabase\enable-birthday-cron.sql`, chạy trong SQL Editor.
3. Kết quả job `elden-birthday-reminders` phải có `active = true`.

Job chạy mỗi giờ, tính ngày theo giờ Việt Nam; mỗi người nhận chỉ có một thông báo cho một sinh nhật mỗi năm.
Nếu Cron đã bật trước bootstrap, job được tạo ngay trong bootstrap. File enable có thể chạy lại để cập nhật cùng tên job.
Nếu project bị pause hoặc job lỗi thì không có bảo đảm gửi đúng giờ; kiểm tra lịch sử job trong Cron Dashboard.
Sinh nhật 29/02 hiện dùng đúng ngày 29/02, chưa tự đổi sang 28/02 ở năm không nhuận.

## 5. Admin đầu tiên và đăng nhập

Admin dùng ở Supabase Dashboard khác với vai trò Admin trong ứng dụng Elden.
SQL không tự biến tài khoản đăng nhập Supabase Dashboard thành nhân sự Elden.

Sau khi có user trong **Authentication → Users** (tạo user thử ở Dashboard hoặc đăng ký qua luồng Auth khi được triển khai), sao chép UUID.
Trong SQL Editor thay UUID của chính chủ hệ thống:

```sql
update public.profiles
set role='admin',status='active'
where id='THAY-BANG-UUID-USER';
```

Auth user tạo SAU bootstrap sẽ tự có hồ sơ pending. Nếu tạo user trước bootstrap thì cần backfill hồ sơ riêng, đừng tự bỏ qua trigger.
Sau đó Admin duyệt/phân idol qua RPC `admin_assign_idol`, tạo user vận hành bằng Auth Admin API phía server rồi cấp quyền bằng `admin_activate_operator`.
Các RPC này cần JWT của người dùng Admin, không dùng Publishable key đơn lẻ để vượt quyền.
Google OAuth provider, redirect/callback và giao diện đăng nhập vẫn là bước phát triển kế tiếp.

## 6. Trang chủ và dữ liệu Excel

Trang chủ dành cho tài khoản active đã đăng nhập, có ở cả Admin, Vận hành, Idol.

- `homepage_posts`: poster, thông báo, sự kiện. Admin tạo/sửa, ghim, chọn thứ tự/đối tượng và hẹn ngày hiển thị.
- `homepage-media`: bucket riêng tư. Chỉ Admin upload; người dùng chỉ đọc ảnh gắn với bài họ được xem.
- `homepage_ranking()`: thứ hạng kim cương, tên hiển thị, ảnh, kỳ thống kê và mốc cập nhật. Không trả tổng kim cương.
- Mặc định xếp theo tháng; có thể chọn ngày/tuần/tháng. Đồng số kim cương đồng hạng, dùng dense rank (1,1,2).
- Chỉ lấy `daily_metrics.diamonds` có giá trị từ `import_batches.status = published`; không tự coi thiếu dữ liệu là 0.
- `homepage_birthdays_today()`: tên/ảnh/vai trò của người sinh nhật hôm nay; không trả ngày sinh đầy đủ.
- `mark_notification_read(id)`: mỗi người chỉ đánh dấu thông báo của mình.

Chưa có file Excel mẫu trong workspace nên chưa xây parser/mapping. Khi triển khai import, cần ghi đúng số kim cương vào cột diamonds và công bố batch.
Ranking tự tính lại từ dữ liệu đó, không cần Admin nhập tay vị trí. Hiện chưa nhập dữ liệu thì ranking trống là đúng.

## 7. Cập nhật database về sau

Có thể cập nhật bằng migration mà không tạo lại database.

Ví dụ thêm ghi chú phòng:

```sql
begin;
alter table public.rooms add column notes text;
-- Bổ sung policy/function và kiểm thử nếu thay đổi liên quan đến quyền.
insert into private.app_schema_migrations(version) values('202610010001');
commit;
```

Quy trình:
1. Viết file mới trong `supabase/migrations`, tên phiên bản mới; không sửa file đã chạy để áp dụng lại.
2. Kiểm thử trên database dev; thêm cột có default hoặc nullable để tương thích dữ liệu cũ.
3. Sao lưu trước thay đổi dữ liệu thật, nhất là xóa/đổi kiểu/chuyển dữ liệu.
4. Chạy migration mới một lần trên đúng project và cập nhật BE/FE tương ứng.
5. Giữ file SQL trong Git. Bootstrap chỉ phục vụ project mới, không phải công cụ nâng cấp.

`private.app_schema_migrations` là sổ phiên bản của dự án, không phải bảng migration nội bộ Supabase CLI.
Nếu sau này dùng CLI `db push`, phải đối chiếu/baseline lịch sử SQL đã chạy thủ công trước, tránh CLI chạy lại 001–004.

## Tài liệu chính thức
- Kết nối URL/key: https://supabase.com/docs/guides/api/creating-routes
- SQL/database: https://supabase.com/docs/guides/database/overview
- Bật Cron: https://supabase.com/docs/guides/cron/install
- Migration: https://supabase.com/docs/guides/local-development/database-migrations
