# Elden Media — Quản lý nội bộ

Next.js + TypeScript + PostgreSQL/Supabase. Giao diện tiếng Việt responsive.
Đã có các luồng chính; cần nghiệm thu nhiều tài khoản và thiết bị thật trước khi vận hành chính thức.
Trang đăng nhập có thể mở để kiểm tra; các trang nội bộ yêu cầu tài khoản đã được duyệt.
Đã triển khai Google login, tài khoản theo vai trò, lịch tuần/ma trận phòng, QR/camera, nhận trả máy, bảng tin, thông báo và nhập kim cương theo tháng. SQL hiện đến 017. Giai đoạn 6 bổ sung PWA để cài lên điện thoại; xem docs/GIAI-DOAN-6-PWA.md.

## Chạy trên Windows / VS Code

1. Cài Node.js LTS (22 trở lên) và Git, mở lại VS Code.
2. File → Open Folder → chọn thư mục Elden Media này.
3. Mở Terminal, chạy:

```powershell
npm install
npm run dev
```

Mở http://localhost:3000. Dừng server bằng Ctrl+C.
Kho có pnpm-lock.yaml từ lần kiểm tra ban đầu. Để cài đúng các phiên bản đã kiểm tra,
có thể dùng pnpm install --frozen-lockfile và pnpm dev nếu máy đã có pnpm.
Nếu chọn npm để phát triển lâu dài, giữ package-lock.json do npm tạo làm lockfile chính.
Nếu PowerShell chặn npm.ps1, dùng npm.cmd thay cho npm; không cần đổi execution policy.

## Kết nối Supabase khi bắt đầu làm Auth

```powershell
Copy-Item .env.example .env.local
```

Điền Project URL và Publishable key từ project Supabase vào .env.local.
Không commit file này. Không đặt secret/service_role key trong biến NEXT_PUBLIC_.
Làm theo supabase/README.md để chạy migration trên project phát triển mới.
Giao diện gọi Supabase qua session và RPC. Cần chạy các migration còn thiếu, bật Google Auth và cấu hình APP_URL/redirect đúng địa chỉ đang dùng.

## Cấu trúc

```text
src/
  app/                  Trang, layout, CSS, manifest và API Next.js
    api/health/         API kiểm tra web
    modules/[slug]/     Trang phạm vi của 6 phân hệ
  features/             Nơi phát triển từng phân hệ nghiệp vụ
  lib/
    modules.ts          Nội dung các phân hệ
    supabase/           Client trình duyệt và phía máy chủ
  types/                Kiểu dữ liệu dùng chung
public/                 Biểu tượng và tài nguyên tĩnh
supabase/
  migrations/           SQL có phiên bản
docs/                   Lộ trình và các bước còn thiếu
.vscode/                Gợi ý extension VS Code
.env.example            Mẫu cấu hình, không chứa khóa thật
```

## Kiểm tra

```powershell
npm run lint
npm run typecheck
npm run build
```

Nếu typecheck trước lần chạy Next.js đầu tiên báo thiếu file sinh tự động, chạy npm run build rồi thử lại.
SQL có bộ kiểm thử tại tests/sql-foundation.mjs. Xem docs/SQL-TEST-RESULTS.md để chạy và xem giới hạn kiểm chứng.

## Mốc tiếp theo

Nghiệm thu các luồng trên Supabase thật và iPhone/Android; bổ sung điều phối đổi phòng đột xuất trong ca, kiểm thử tải và phục hồi dữ liệu theo roadmap.
Đọc docs/ROADMAP.md trước khi mở quyền ghi database hoặc triển khai dữ liệu thật.

## Tài liệu chính thức
- https://nextjs.org/docs/app/getting-started/installation
- https://supabase.com/docs/guides/auth/server-side/creating-a-client
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Đặc tả đã chốt và SQL mới

- [Ghi chú toàn bộ hệ thống](docs/HE-THONG-ELDEN-NOTE.md)
- [Thứ tự chạy SQL](supabase/README.md)
- [Kết quả kiểm thử SQL](docs/SQL-TEST-RESULTS.md)


## Supabase — bắt đầu bằng một file SQL

Xem [hướng dẫn đầy đủ](docs/SUPABASE-BAT-DAU.md). Project mới chạy supabase/elden-bootstrap.sql một lần. Project cũ chỉ chạy migration còn thiếu.

Điền .env.local rồi chạy: npm.cmd run db:check.


## Giai đoạn 1

Xem [hướng dẫn kích hoạt và kiểm thử](docs/GIAI-DOAN-1.md). Schema 004 đang có chỉ cần nâng cấp bằng migration 005.

## Cài web lên điện thoại (PWA)

```powershell
npm.cmd run build
npm.cmd start
```

Giữ Cloudflare Tunnel chạy, mở web qua HTTPS rồi chọn **Cài ứng dụng**. Giai đoạn này không có SQL mới. `build` tự tạo worker có phiên bản mới; sau khi cập nhật code cần build và khởi động lại server. Xem [hướng dẫn PWA](docs/GIAI-DOAN-6-PWA.md).

