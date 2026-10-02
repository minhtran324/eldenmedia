# Kết quả kiểm thử SQL — 29/09/2026

38 kiểm tra đạt trên PostgreSQL cục bộ qua PGlite 0.3.16, có extension btree_gist.
Chạy nguyên cả ba migration, không chỉ kiểm tra chuỗi SQL.
Auth và Storage được giả lập ở mức schema để thử ràng buộc và RLS, không phải Supabase thật.

Đã kiểm tra:
- Metadata đăng ký không cấp Admin; tài khoản pending không xem danh mục.
- Vận hành không tự cấp quyền; idol không tự đổi vai trò.
- Chuyển team: người cũ mất quyền hồ sơ, lịch sử phân công, thông báo; người mới đọc được toàn lịch sử phân công.
- Một máy được gán cho một phòng; một idol không giữ hai máy; trả chưa duyệt không giải phóng máy.
- Một hoặc hai ca phải đúng số lượng đã chọn và tổng 5 giờ; cấm thiếu/thừa giờ, lệch giờ tròn, chồng ca.
- Ca 19:00–24:00 hợp lệ; vượt giờ hoạt động bị chặn.
- Hủy riêng một ca không làm ngày đã gửi âm thầm mất tổng 5 giờ.
- Ca đã duyệt cần đủ phòng; hai đoạn phòng liên tiếp hợp lệ, vượt phạm vi hoặc trùng phòng bị chặn.
- Đi muộn được tính theo snapshot; checkout cần ảnh, lệch giờ cần lý do, không sửa lại checkout.
- Yêu cầu checkout bù mới bị từ chối.
- Đổi ID TikTok giữ lịch sử; không chuyển tài khoản sang idol khác.
- Audit được ghi; vận hành không đọc audit toàn hệ thống; anonymous không đọc dữ liệu.

Chạy lại từ C:\EldenMedia:

```powershell
npm.cmd --prefix tests install
npm.cmd --prefix tests test
```

Test sử dụng database trong bộ nhớ, không đọc .env.local và không kết nối Supabase.

Chưa xác minh: Supabase hosted, OAuth Google, Storage API/file thực tế, nhiều kết nối đồng thời,
hiệu năng, backend nghiệp vụ chưa viết. Chưa chạy migration trên project Supabase của người dùng.
