# Giai đoạn 8 — Check-in/out và theo dõi theo Idol

## Cài đặt

1. Mã ứng dụng nằm ở `C:\EldenMedia`. Bản cập nhật có sao lưu trước khi thay file; không thay `.env.local`.
2. Trong Supabase → SQL Editor → New query, chạy toàn bộ `supabase/migrations/202610010019_idol_attendance_flow.sql` **một lần**, sau SQL 018. Đây là migration nâng cấp, không chạy lại bootstrap và không xóa dữ liệu.
3. Kiểm tra:

   ```sql
   select public.app_connection_status();
   ```

   Kết quả cần có `schema_version: 202610010019`.
4. Khởi động lại ứng dụng (`Ctrl+C`, rồi `npm.cmd run dev`). Khi chạy production, build lại trước khi `npm.cmd run start`. Mở **Ca live & Thiết bị**.
5. Nên cập nhật vào lúc không có người đang quét/chụp ảnh. Lịch sử cũ được giữ; máy đang giữ từ phiên cũ vẫn phải được Idol quét trả. Ticket ảnh đang mở trước SQL 019 cần quét/chụp lại.

Migration SQL 019 chưa được tự chạy lên Supabase thật từ môi trường kiểm thử này. Cron sinh nhật và dọn ảnh hiện có không cần đổi lịch.

## Quy tắc đã triển khai

| Tình huống | Xử lý |
| --- | --- |
| Lượt đầu trong phòng/ngày | Đúng giờ lịch; sau hạn bắt đầu ghi trễ |
| Lượt sau | Hạn = `max(giờ lịch, giờ bàn giao thực tế) + 5 phút` |
| Lượt trước chưa checkout / phòng tạm ngừng bàn giao | Chờ phòng, chưa tính trễ lượt sau |
| Phòng trả trước giờ | Có thể vào sớm tối đa 30 phút, không bắt ca sau phải đến sớm |
| Đủ 5 phút sau mốc bàn giao | Chưa trễ; hơn 5 phút bắt đầu tính 1 phút trễ, làm tròn lên |
| Checkout quá giờ dự kiến | Lưu giờ thực tế và ghi chú nếu có, không phạt checkout trễ |
| Máy đúng phòng, dù khác người quản lý | Nhận tự động nếu máy trống |
| Máy khác phòng hoặc chưa gắn phòng | Người quản lý máy hoặc Admin duyệt |
| Không dùng máy công ty | Idol bấm nút ở bước nhận máy; lưu lựa chọn theo lượt phòng |
| Trả máy | Đặt máy tại bàn chung và quét QR; xác nhận tự động |
| Nghỉ giữa ca | Không cần checkout nếu vẫn giữ phòng; không tự tính thời lượng live TikTok từ check-in/out |

Ví dụ: ca trước có lịch đến 14:00 nhưng xác nhận checkout lúc 14:20. Ca sau có hạn 14:25; quét lúc 14:25:01 ghi trễ 1 phút. Nếu ca trước trả lúc 13:50, ca sau có lịch 14:00 thì hạn là 14:05.

Mốc nhận phòng dựa trên giờ server quét QR; ảnh check-in phải tải lên và xác nhận trong 5 phút để hoàn tất. Giờ bàn giao cho lượt sau dựa trên lúc xác nhận ảnh checkout, tránh giải phóng phòng khi ảnh chưa gửi thành công. Hai mốc được lưu riêng. Nếu lịch/bàn giao đổi trong lúc chụp thì phải quét lại.

## Giao diện

- Idol: ba bước và nút riêng; “Checkout ca” dẫn qua trả máy nếu đang giữ, rồi checkout phòng. Có thể “Chỉ trả phòng trước”, máy vẫn hiện chưa trả cho đến khi quét.
- Admin/Vận hành: bảng theo **Idol + ngày**, gồm mọi lượt phòng/đổi phòng, giờ lịch, hạn nhận, giờ thực tế, máy và nhật ký. Bộ lọc: Tất cả, Đang trong phòng, Chưa check-in, Vi phạm trễ.
- “Bỏ qua lượt này”: chỉ lượt chưa bắt đầu, bắt buộc lý do. Lượt được đánh dấu bỏ qua, không giả lập giờ vào/ra hay thời lượng live.
- “Phòng chưa sẵn sàng”: tạm dừng bàn giao có lý do; “Phòng đã sẵn sàng”: mở lại và tính hạn nhận mới. Chỉ Admin/Vận hành có quyền với Idol của lượt tương ứng. Lượt/hold còn mở qua ngày vẫn xuất hiện.
- Thông báo check-in/out và máy nằm ở hai luồng tương ứng trong chuông; trễ có nhãn QUAN TRỌNG, cảnh báo nổi và số chưa đọc nổi bật. Liên kết thông báo mở đúng Idol và ngày làm việc.
- Vận hành xem nhật ký team hiện tại; chủ phòng mượn không được mở rộng quyền xem thông tin cá nhân của Idol khác team. Chủ máy vẫn xem/duyệt yêu cầu mượn máy của mình theo quyền tài sản.

## Giới hạn và nghiệm thu thật

Lịch đăng ký vẫn giữ nguyên số giờ dự kiến (tổng 5 giờ/ngày), không kéo dài lịch đã duyệt để ghi đè lịch sử. Bàn giao trễ được xử lý ở luồng thực tế. Đổi phòng giữa ca theo các đoạn phòng đã duyệt; sửa lại phần lịch còn lại sau khi ca đã bắt đầu là chức năng điều phối riêng chưa triển khai trong bản này.

Kiểm tra trên Supabase thật với ba tài khoản Idol/Vận hành/Admin và điện thoại HTTPS:

1. Quét phòng, chụp ảnh; chọn máy đúng phòng hoặc không dùng máy.
2. Mượn máy khác phòng: đúng chủ máy được duyệt, Vận hành khác bị từ chối.
3. Checkout ca trước trễ; ca sau chờ phòng, sau đó có 5 phút. Xác nhận thông báo quan trọng chỉ khi check-in sau hạn.
4. Trả máy và phòng độc lập; ảnh chỉ người đúng quyền xem được, hết 30 ngày không xem được.
5. Thử hai người thao tác đồng thời và mất mạng lúc tải ảnh. Cùng ticket xác nhận lại không tạo hai lượt.

SQL được kiểm thử trên PostgreSQL cục bộ qua PGlite (có RLS và đồng hồ giả lập chỉ trong bài kiểm thử). Kiểm thử này không thay thế camera iPhone/Android, Realtime Supabase và cạnh tranh giữa nhiều kết nối thật.

Chạy lại các bài kiểm thử từ thư mục dự án:

```powershell
node --experimental-strip-types tests/attendance-flow-ui.mjs
node tests/attendance-flow-sql.mjs
```

Bài SQL dùng gói `@electric-sql/pglite` trong `tests/node_modules`, cài theo `tests/package.json` nếu chưa có. Không gọi Supabase thật và không đọc `.env.local`.
