# Giai đoạn 1 — Tài khoản, đăng nhập và phân quyền

## Đã triển khai
- Đăng nhập Google theo OAuth PKCE, đổi code qua callback phía server.
- Proxy refresh session cookie; server xác minh bằng Auth và đọc role/status hiện tại từ database.
- Lần đầu đăng ký idol: pending. Các lần sau nếu active: đi thẳng giao diện đúng vai trò.
- Chờ duyệt có form họ tên, nickname, SĐT, ngày sinh và nút kiểm tra lại trạng thái.
- Admin tìm kiếm/phân trang nhân sự, duyệt và phân idol, chuyển team, khóa/mở lại tài khoản đã duyệt.
- Admin cấp quyền vận hành trước theo email Google. Người đã có email xác thực/pending được kích hoạt ngay;
  người chưa đăng nhập có bản ghi chờ kích hoạt, chỉ nhận quyền khi xác thực đúng email.
- Có thu hồi quyền vận hành chưa kích hoạt; không có mật khẩu chung, không tự gửi email.
- Vận hành thấy đúng idol đang phụ trách; idol thấy tên vận hành của mình.
- Hồ sơ cá nhân không có quyền sửa role/status/ngày vào công ty/người quản lý.
- Tài khoản suspended bị chặn ở backend và RLS; đăng nhập lại không tự mở khóa.
- Mỗi mutation đều kiểm tra trên server và RPC, không dựa vào việc ẩn nút trên FE.

## 1. Chạy SQL 005

Bạn đã có schema 004. Trong Supabase SQL Editor chạy một lần:

`C:\EldenMedia\supabase\migrations\202609290005_phase1_accounts.sql`

Không chạy lại 001–004 hoặc bootstrap. File bootstrap hiện là bản nền 004; project hoàn toàn mới phải chạy bootstrap rồi 005.
Sau khi chạy, `npm.cmd run db:check` sẽ báo `202609290005`.
Chưa áp dụng migration lên Supabase của bạn tự động.

## 2. Bật Google OAuth

Có HAI địa chỉ callback khác nhau, không nhập nhầm:

| Nơi cấu hình | Địa chỉ |
|---|---|
| Google Cloud → OAuth client → Authorized redirect URIs | Callback do Supabase cung cấp, dạng `https://PROJECT-REF.supabase.co/auth/v1/callback` |
| Supabase → Authentication → URL Configuration → Redirect URLs | `http://localhost:3000/auth/callback` lúc phát triển |

Các bước:
1. Trong Google Cloud Console tạo/chọn project và cấu hình màn hình đồng ý OAuth (Google Auth Platform/Branding).
2. Nếu ứng dụng đang ở chế độ Testing, thêm email thử nghiệm vào Test users.
3. Tạo OAuth client loại Web application. Authorized JavaScript origins dùng `http://localhost:3000` lúc dev.
4. Authorized redirect URI dùng đúng URL lấy từ Supabase Google provider, KHÔNG dùng callback Next.js ở mục này.
5. Supabase → Authentication → Sign In / Providers → Google: bật provider, điền Client ID/Client Secret từ Google, lưu lại.
6. Supabase → Authentication → URL Configuration: Site URL `http://localhost:3000`, thêm Redirect URL `http://localhost:3000/auth/callback`.
7. Khi triển khai thật, thêm domain HTTPS và callback tương ứng; cập nhật Site URL và APP_URL. Không dùng wildcard rộng cho production.

Client Secret chỉ nhập trong Supabase Dashboard; không đưa vào biến NEXT_PUBLIC_ hoặc chat.

## 3. Cấu hình máy phát triển

Giữ hai biến Supabase đã có trong `.env.local`, thêm:

```env
APP_URL=http://localhost:3000
```

Đây là địa chỉ gốc được tin cậy cho callback. Không lấy đích redirect từ query string hoặc Host header.
Chạy:

```powershell
cd C:\EldenMedia
npm.cmd run dev
```

Mở http://localhost:3000/login. Nếu đổi port, cập nhật APP_URL và Supabase Redirect URLs cùng lúc.
Production phải khai báo APP_URL; HTTPS bắt buộc trừ địa chỉ localhost/127.0.0.1 để thử bản build.

## 4. Tạo Admin đầu tiên

1. Chạy SQL 005 và cấu hình Google xong.
2. Đăng nhập Google bằng email chủ hệ thống. Lần đầu thấy trang chờ duyệt.
3. Trong Supabase → Authentication → Users, lấy UUID của chính email đó.
4. Trong SQL Editor, thay UUID rồi chạy:

```sql
update public.profiles
set role='admin',status='active'
where id='UUID-CUA-CHU-HE-THONG';
```

5. Bấm Kiểm tra trạng thái hoặc mở lại `/`. Hệ thống đưa đến `/admin`.

Không có endpoint công khai tạo Admin. Chỉ làm bước bootstrap này cho tài khoản chủ hệ thống đã xác minh.

## 5. Cấp quyền Vận hành và duyệt Idol

- Admin → Cấp quyền Vận hành → điền họ tên, email Google.
- Nếu email chưa đăng nhập, xuất hiện trong danh sách chờ; Admin tự cung cấp địa chỉ web cho nhân sự.
- Khi vận hành xác thực đúng email, database nhận quyền đã được Admin cấp; không phải duyệt lại.
- Idol đăng nhập, hoàn thiện họ tên; Admin chọn vận hành đang active rồi Duyệt & phân công.
- Để chuyển team, Admin đổi vận hành. Người cũ mất quyền hồ sơ/lịch sử; người mới xem toàn bộ theo quy tắc đã chốt.
- Người bị khóa cần Admin mở lại; đăng nhập hoặc còn cookie không vượt qua trạng thái khóa.

## Cấu trúc để phát triển tiếp

```text
src/proxy.ts                       Refresh và xác minh cookie session
src/lib/auth/server.ts             Guards requireUser / requireActive(role)
src/lib/auth/actions.ts            Google login, logout, kiểm tra lại quyền
src/lib/auth/routing.ts            Điều hướng vai trò và kiểm tra APP_URL
src/app/auth/callback/route.ts     PKCE callback cố định về APP_URL
src/features/accounts/actions.ts  Server Actions nhập liệu và gọi RPC
src/components/account-forms.tsx  Form có pending/success/error, chống bấm gửi lặp
src/types/database.ts             Typed contract giai đoạn 1
src/app/admin|operator|idol/       Dashboard theo vai trò
```

Guards dùng React cache trong cùng request, không cache dữ liệu người dùng giữa các request.
Các trang auth/private có Cache-Control private, no-store. Next Server Actions giữ cơ chế kiểm tra Origin mặc định.
Không có đường tắt đăng nhập giả hoặc secret/service_role key trong FE.

## Kiểm thử và giới hạn

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:auth
npm.cmd --prefix tests install
node tests/accounts-sql.mjs
# Khi server kiểm thử đang chạy ở port 3100:
node tests/auth-http.mjs http://localhost:3100
```

- SQL test giả lập Auth/Storage bằng PGlite, không kết nối hoặc tạo tài khoản trên Supabase thật.
- Đã kiểm tra onboarding, email chưa xác thực, chống nâng quyền, chuyển team, khóa/mở khóa, lặp đăng nhập và quyền RPC.
- Đã kiểm tra build/lint/điều hướng, trang login desktop/mobile và chặn truy cập chưa đăng nhập.
- Chưa xác nhận Google OAuth thật hoặc thao tác Admin qua browser với tài khoản thật; cần cấu hình provider và chạy 005 trước.
- Avatar upload, TikTok username/account management, lịch, QR, Excel và giao diện trang chủ nội dung thuộc giai đoạn sau.
- Profile ở tab đã mở không tự biến mất ngay khi bị khóa; request mới/backend/RLS sẽ chặn. Có thể bổ sung realtime thông báo trạng thái sau.

Tài liệu: https://supabase.com/docs/guides/auth/social-login/auth-google
và https://supabase.com/docs/guides/auth/server-side/creating-a-client
