# Đăng ký lịch Idol test live — SQL 024

## Bật tính năng

1. Database cần đã chạy các migration đến SQL 023.
2. Mở `C:\EldenMedia\supabase\migrations\202610020024_trial_live_scheduling.sql`, sao chép toàn bộ nội dung.
3. Vào đúng dự án Supabase → SQL Editor → New query → dán nội dung → Run một lần bằng role `postgres`.
4. Tải lại web. Vận hành vào **Lịch live tuần → Đăng ký test live**. Trong tab tạo lịch cũng có nút riêng.

SQL chạy trong một transaction; nếu có lỗi thì toàn bộ thay đổi của lần chạy được hoàn tác. File này bổ sung dữ liệu test và cập nhật hàm xếp phòng, không xóa dữ liệu đang có. Không chạy lại toàn bộ SQL khởi tạo của dự án.

## Cách đăng ký

- Vận hành nhập tên Idol test mới hoặc chọn người đã có để đăng ký những ngày còn lại. Admin chọn thêm Vận hành phụ trách.
- Chọn 1–5 ngày khác nhau trong một lần gửi; không bắt buộc các ngày liên tiếp hoặc phải đăng ký vào Chủ nhật.
- Mỗi ngày chọn giờ bắt đầu và một phòng trống đủ **2 tiếng liên tục**. Có thể chọn ngày hôm nay nếu giờ bắt đầu chưa qua; phạm vi đặt trước tối đa 90 ngày như lịch thường.
- Ma trận phòng hiển thị hai giờ cần đặt. Nút **Gợi ý phòng** ưu tiên phòng thuộc Vận hành của Idol test.
- Phòng cùng team được xếp trực tiếp. Phòng thuộc Vận hành khác tạo yêu cầu **Mượn phòng** cho chủ phòng duyệt. Admin có thể xử lý toàn bộ.
- Ngày đã xếp phòng và ngày đang chờ duyệt cùng được tính vào hạn mức **tối đa 5 ngày test**. Các ngày đã qua vẫn nằm trong tổng này.
- Tên trùng trong cùng team, sau khi bỏ khoảng trắng thừa và không phân biệt hoa/thường, dùng chung hồ sơ test. Nếu có hai người trùng tên, thêm tên gọi phân biệt ngay khi nhập.

## Xem lịch, duyệt và hủy

- Lịch tuần có bảng **Test live trong tuần** riêng; ma trận phòng hiển thị nhãn **Test live · tên Idol** ở các giờ đã duyệt.
- Trang đăng ký test có lịch theo khoảng 30 ngày, gồm cả lịch đã hủy/từ chối. Chọn ngày bắt đầu để xem lịch sử.
- Chủ phòng vào **Lịch live tuần → Mượn phòng**, hoặc nút **Duyệt mượn phòng** trên trang test để duyệt/từ chối.
- Lịch chờ chủ phòng duyệt chưa giữ chỗ. Hệ thống kiểm tra trùng phòng lại ngay lúc duyệt.
- Chủ hồ sơ test hoặc Admin được hủy ngày chưa bắt đầu; lịch đang chờ có thể hủy khi đã quá giờ. Lịch đã hủy/từ chối không chiếm phòng và không tính vào 5 ngày.
- Muốn đổi ngày/giờ/phòng: hủy ngày cũ rồi chọn lại Idol đó để đăng ký ngày thay thế. Lịch đã duyệt và đã bắt đầu được giữ nguyên để bảo toàn lịch sử.

## Phạm vi

Idol test chỉ là tên trong lịch, **không tạo tài khoản, không check-in/out, không nhận máy qua luồng này**. Không đưa giờ test vào công 5 tiếng, số liệu kim cương hay hồ sơ Idol chính thức. Giờ kết thúc đặt phòng là giờ trả phòng trên lịch; Vận hành tự theo dõi ca test thực tế.

Lịch test và lịch chính thức dùng chung kiểm tra phòng trống. Lịch test đã duyệt chặn ca thường trùng giờ; Idol chính thức không được quét vào sớm trong phần thời gian phòng còn dành cho ca test.

## Kiểm tra kỹ thuật

- SQL: 24 kiểm tra trên Postgres nhúng PGlite, áp dụng migration 001–024, gồm RLS, giới hạn ngày, gửi nhiều ngày nguyên tử, duyệt mượn phòng, hủy lịch, xung đột với ca thường và quét QR vào sớm.
- Giao diện: kiểm tra trình duyệt với dữ liệu mẫu ở màn hình máy tính và khung di động 390 px. Trang dữ liệu mẫu không được đưa vào dự án chính.
- Lint các file thay đổi và Next.js production build đã đạt.
- Chưa kiểm tra đăng ký bằng tài khoản thật trên Supabase của công ty trước khi SQL 024 được áp dụng.

Bản test SQL nằm trong thư mục kiểm chứng của workspace tại `C:\Users\THUHA\OneDrive\Documents\ChatGPT\Elden Media\phase10-test-live\validation\tests\trial-live-sql.mjs`; chạy từ thư mục `validation` bằng `node tests/trial-live-sql.mjs`. Script tạo database tạm trong bộ nhớ, không đọc `.env.local` và không ghi lên Supabase thật. Nếu muốn lưu test trong `C:\EldenMedia\tests`, chép file này bằng quyền Windows của tài khoản dự án.
