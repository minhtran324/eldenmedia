# Giai đoạn 7 — Realtime hộp thư thông báo

## Mục tiêu

Chuông thông báo cập nhật ngay sau khi backend tạo thông báo cho người dùng. Hệ thống vẫn gọi endpoint đếm số chưa đọc lúc mở trang, khi quay lại tab và mỗi 60 giây để hoạt động ổn định khi Realtime không kết nối được.

## Thay đổi

- `NotificationBell` mở một Supabase Realtime channel riêng theo `profile.id`.
- Chỉ lắng nghe `INSERT` trên `public.notifications` với bộ lọc `recipient_id=eq.<profile_id>`.
- Khi có bản ghi mới, trình duyệt chỉ gọi lại endpoint đếm; không tải nội dung người khác và không ghi dữ liệu.
- Khi offline hoặc Realtime lỗi, polling/focus/visibility hiện có vẫn giữ nguyên.
- Hộp chuông hiển thị trạng thái `Cập nhật trực tiếp` hoặc `Tự kiểm tra mỗi phút`.
- SQL 018 bật `public.notifications` trong publication `supabase_realtime` và đặt `replica identity full`; RLS hiện hành không thay đổi.

## Cách áp dụng

Trong Supabase SQL Editor chạy sau SQL 017:

```sql
-- dán toàn bộ file supabase/migrations/202609300018_realtime_notifications.sql
```

Sau đó build/restart ứng dụng. Không cần thay đổi biến môi trường mới. Nếu chưa chạy SQL 018, giao diện vẫn dùng polling nên không mất thông báo.

## Kiểm tra

1. Đăng nhập hai trình duyệt bằng hai tài khoản khác nhau.
2. Tạo một request hoặc thao tác tạo thông báo từ trình duyệt thứ nhất.
3. Chuông của đúng người nhận phải tăng ngay; mở hộp thư kiểm tra đúng luồng.
4. Tắt mạng trình duyệt, thao tác nghiệp vụ phải bị chặn theo chính sách hiện có; bật mạng lại, chuông tiếp tục kiểm tra định kỳ.
