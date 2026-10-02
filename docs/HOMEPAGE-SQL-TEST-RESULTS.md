# Kiểm thử trang chủ và SQL tổng hợp

28 kiểm tra bổ sung đạt trên PGlite 0.3.16 với btree_gist, ngoài 38 kiểm tra SQL nền tảng trước đó.

Đã xác nhận:
- Bootstrap bốn migration chạy trong một transaction trên database mới.
- Chạy lại bootstrap trên database đã có bảng dừng an toàn.
- Nâng cấp lần lượt 001–004 và chạy bootstrap tạo cùng các cột/bảng public.
- Ranking chỉ gồm dữ liệu đã công bố và có số kim cương xác định; tự đổi khi batch được công bố.
- RPC ranking không trả số kim cương; RLS số liệu gốc vẫn theo team.
- Idol, vận hành active dùng trang chủ; pending/suspended/anonymous bị chặn.
- Đồng điểm đồng hạng; kỳ không dữ liệu trả rỗng.
- Nội dung bản nháp/hẹn giờ/khác đối tượng không lộ ra người xem không có quyền.
- Chỉ Admin tạo nội dung/upload ảnh; poster công bố cần ảnh.
- Storage policy chỉ mở ảnh gắn với nội dung người dùng được xem.
- Sinh nhật chỉ hôm nay, không trả năm sinh; có tùy chọn ẩn.
- Nhắc trước ba ngày tới tất cả vận hành và Admin; chạy lặp không tạo trùng.
- Nhắc sinh nhật qua ranh giới năm đúng; người dùng thường không tự gọi hàm scheduler.
- Probe kết nối chỉ trả tên ứng dụng và phiên bản schema.

Chạy lại từ C:\EldenMedia:

```powershell
npm.cmd --prefix tests install
npm.cmd --prefix tests test
```

Giới hạn: PostgreSQL cục bộ, Auth/Storage schema giả lập. Chưa thực thi pg_cron engine,
chưa kiểm tra Supabase hosted, upload ảnh, OAuth, parser Excel, UI hoặc tải đồng thời.
Không truy cập .env.local hay thay đổi Supabase thật trong các bài kiểm thử này.
