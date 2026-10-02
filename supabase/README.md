# Database Elden Media

## Project mới — chỉ chạy một file

Chạy `elden-bootstrap.sql` trong Supabase SQL Editor. File tổng hợp migration 001–004, có transaction và kiểm tra project đã có bảng.
Không chạy tiếp các migration 001–004 sau bootstrap.

## Project đã có bảng

Giữ nguyên dữ liệu; chỉ chạy các file chưa áp dụng trong `migrations/`, theo thứ tự.
Nếu đã chạy 001–003, chỉ chạy `202609290004_homepage.sql`.

## Hướng dẫn

- [Hướng dẫn tạo project, chạy SQL, kết nối web, bật nhắc sinh nhật và cập nhật về sau](../docs/SUPABASE-BAT-DAU.md)
- [Đặc tả toàn hệ thống](../docs/HE-THONG-ELDEN-NOTE.md)
- [38 kiểm tra nền tảng](../docs/SQL-TEST-RESULTS.md)
- [28 kiểm tra trang chủ/bootstrap](../docs/HOMEPAGE-SQL-TEST-RESULTS.md)

Chỉ cấu hình URL và Publishable key trong `.env.local`. Chạy `npm.cmd run db:check` để kiểm tra kết nối.
Google OAuth, backend đặt lịch/QR/camera và parser Excel chưa hoàn thiện; SQL không tự triển khai các màn hình đó.

## Cron

Vào Integrations → Cron bật pg_cron, rồi chạy `enable-birthday-cron.sql`.
Nếu pg_cron đã bật trước bootstrap, job được đăng ký tự động.
Job nhắc sinh nhật chạy mỗi giờ, gửi một lần/người nhận/sinh nhật/năm; ngày tính theo giờ Việt Nam.

## Bảo trì

Không sửa migration đã chạy để áp dụng lại. Mỗi thay đổi mới là một migration mới, có kiểm thử và kế hoạch tương thích dữ liệu cũ.
`private.app_schema_migrations` là sổ phiên bản riêng, không phải lịch sử migration của Supabase CLI.
Chuyển sang CLI cần baseline/đối chiếu lịch sử trước khi db push.

Khi cần tái tạo bootstrap 001–004 cho project mới:

```powershell
node scripts/build-bootstrap.mjs
```

Script này chỉ ghép file SQL trên máy, không chạy SQL lên database.

## Giai đoạn 1 — migration 005

Sau schema 004, chạy 202609290005_phase1_accounts.sql một lần. Bootstrap là snapshot 004; project mới chạy bootstrap rồi 005. Xem [hướng dẫn](../docs/GIAI-DOAN-1.md).

