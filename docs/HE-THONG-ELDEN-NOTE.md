# Elden Media — Ghi chú nghiệp vụ đã chốt

Ngày cập nhật: 01/10/2026. Đây là nguồn yêu cầu hiện hành; thay thế các ý tưởng cũ về checkout bù, tủ máy và người duyệt trả máy. Luồng nhận/trả và tính trễ mới được triển khai trong SQL 019.

## 1. Phạm vi và công nghệ
- Web quản lý nội bộ khoảng 60–70 nhân sự, một cơ sở, hiện có ba tầng.
- Ba vai trò: Admin, Vận hành, Idol. Mỗi vận hành là một team.
- Next.js/TypeScript; PostgreSQL, Auth và Storage trên Supabase. Dùng Free khi phát triển, đánh giá Pro trước vận hành thật.
- Responsive trên máy tính và điện thoại; phát triển PWA/Add to Home Screen. Chưa yêu cầu ứng dụng native.
- Nền tảng livestream: TikTok. Thông báo trong web. Excel theo ngày làm ở giai đoạn sau.
- Thời gian lưu timestamptz, hiển thị và tính ngày làm việc theo Asia/Ho_Chi_Minh.

## 2. Tài khoản và dữ liệu cá nhân
### Idol
- Họ tên, nickname, username, SĐT, ngày sinh, ngày vào công ty, ảnh đại diện.
- Đăng ký bằng Google/Gmail, chờ Admin duyệt và phân về vận hành. Xác thực Google không tự cấp quyền sử dụng hệ thống.
- Một idol thuộc một vận hành tại một thời điểm.
- Khi chuyển team: vận hành mới được xem toàn bộ lịch sử idol; vận hành cũ không còn được xem dữ liệu cá nhân của idol.
### Vận hành
- Họ tên, ngày sinh, SĐT, ngày vào công ty. Admin tạo/cấp tài khoản; không tự đăng ký vai trò vận hành.
- Quản lý idol, sắp lịch/phòng, xử lý yêu cầu trong phạm vi.
### Admin
- Quản lý toàn bộ nhân sự, tài sản, cấu hình, dữ liệu, yêu cầu.
- Dashboard có tab Tất cả yêu cầu; có thể duyệt thay và phải lưu dấu vết người quyết định.
### TikTok
- Một tài khoản livestream/idol, không chuyển tài khoản giữa các idol.
- ID/username/nickname có thể thay đổi, phải lưu lịch sử và thời gian hiệu lực để ghép Excel sau này.
- Email xác thực lưu ở Supabase Auth; hồ sơ không lưu mật khẩu.

## 3. Phòng
- Admin tạo/cập nhật tầng và phòng. Phòng gồm mã, tên, tầng, loại Studio/Live thường, vận hành quản lý, trạng thái, QR.
- Một phòng thuộc một vận hành, một idol sử dụng tại một thời điểm.
- Không có thời gian đệm dọn/chuyển phòng.
- Chủ phòng phải duyệt nếu vận hành khác mượn. Không giữ chỗ trong lúc chờ duyệt; kiểm tra lại xung đột lúc chấp nhận.
- Lịch phòng chung chỉ tiết lộ thông tin tối thiểu để tìm chỗ trống, không mặc nhiên mở dữ liệu riêng của idol khác team.

## 4. Điện thoại
- Admin tạo máy: mã máy, phòng, người quản lý; hệ thống tạo QR ổn định, tải được để in dán máy.
- Một phòng có tối đa một máy được gán hiện tại; có thể thay máy, phải lưu lịch sử.
- Máy chưa gán phòng được phép tồn tại khi đổi máy/ngừng sử dụng; không tự xem là máy đúng phòng.
- Có một bàn đặt máy chung, không quản lý tủ/ngăn hoặc phụ kiện.
- Idol có thể chọn dùng máy công ty hoặc không. Nếu dùng: chỉ giữ một máy tại một thời điểm.
- Nhận máy sau khi đã check-in phòng và xác nhận ảnh. Bước nhận máy có nút “Không dùng máy công ty”, được lưu theo lượt vào phòng.
- Máy thuộc phòng trong lịch: tự chấp nhận nếu khả dụng. Máy khác phòng: vận hành quản lý chiếc máy duyệt theo phạm vi ca/phòng/thời gian.
- Máy gắn đúng phòng tự chấp nhận kể cả người quản lý máy khác người quản lý Idol. Mọi máy không gắn đúng phòng phải được chủ máy hoặc Admin duyệt.
- Trả máy: đặt tại bàn chung, quét QR, hệ thống tự xác nhận ngay, không cần Vận hành duyệt. Đổi máy phải quét trả máy cũ trước.
- Không khóa thời hạn trả máy cứng; vận hành theo dõi việc trả sau ca để phục vụ người tiếp theo.
- QR định danh tài sản, không phải mật khẩu hay bằng chứng tuyệt đối về hiện diện vật lý.

## 5. Lịch live
- Giờ hoạt động mặc định 09:00–24:00; Admin chỉnh được. 24:00 là 00:00 ngày kế tiếp.
- Idol đăng ký vào Chủ nhật cho tuần tiếp theo (Thứ hai–Chủ nhật).
- Mỗi ngày đăng ký làm việc chọn 1 ca hoặc 2 ca, tổng đúng 5 tiếng; mỗi ca 1–5 tiếng, bắt đầu/kết thúc theo giờ tròn, hai ca không chồng nhau.
- Một ca: 5 tiếng. Hai ca: 1+4, 2+3, 3+2 hoặc 4+1 tiếng.
- Chưa quy định số ngày làm mỗi tuần; không tự áp đặt làm đủ bảy ngày.
- Idol chỉ đăng ký thời gian, không chọn phòng. Vận hành duyệt/sắp xếp bằng kéo thả; được linh hoạt đổi/hủy lịch rồi thông báo idol.
- Idol yêu cầu đổi/hủy ít nhất 1 giờ trước ca; cần vận hành duyệt.
- Vận hành thay đổi cũng phải chống trùng phòng và lưu lịch sử; không sửa lịch để xóa dấu vết đi muộn đã phát sinh.
- Tìm phòng ưu tiên một phòng phủ toàn khoảng giờ. Không có thì ghép phòng, ưu tiên ít lần đổi; số phòng do vận hành quyết định, không áp giới hạn hai phòng.
- Các đoạn phòng nằm trong ca, không chồng nhau; ca đã xác nhận phải có phòng phủ đủ toàn ca.
- Đổi/hủy làm mất tổng 5 tiếng: phương án triển khai là sửa nguyên ngày trong một transaction; hủy cả ngày được phép sau duyệt. Chưa có cơ chế miễn trừ tổng 5 tiếng.
- Các lần check-in/out dùng lịch được chụp lại tại thời điểm vào phòng để giữ đúng bằng chứng.

## 6. Check-in/out phòng
- Quét QR phòng làm mốc bắt đầu; phải chụp trực tiếp ít nhất một ảnh mới được vào ca. Không có nút chọn ảnh thư viện.
- Lưu riêng thời gian quét và thời gian ảnh được xác nhận; UI/backend cần chống sửa giờ từ thiết bị.
- Vào sớm tối đa 30 phút nếu phòng trống, không bị tạm ngừng bàn giao và tất cả lượt trước cùng phòng/ngày đã checkout hoặc được Vận hành bỏ qua có lý do.
- Lượt đầu ngày: hạn check-in bằng giờ lịch. Lượt sau: hạn bằng mốc lớn hơn giữa giờ lịch và giờ phòng thực sự được bàn giao, cộng 5 phút. Khi lượt trước chưa trả phòng thì chưa tính trễ lượt sau.
- Giờ bàn giao là lúc checkout được xác nhận sau khi tải ảnh; lưu riêng giờ quét QR. Phút thứ 6 bắt đầu tính trễ 1 phút, làm tròn lên. Mốc hạn được lưu cố định khi check-in để không đổi lịch sử.
- Trễ check-in tạo thông báo QUAN TRỌNG cho Idol, Vận hành hiện tại và Admin. Hộp thư có nhãn nổi bật, chuông cập nhật và cảnh báo trong web.
- Mỗi lần đổi phòng thực hiện ra phòng cũ/vào phòng mới. Nếu trễ vì đổi phòng có thể ghi lý do.
- Checkout phải có ít nhất một ảnh, tự xác nhận và giải phóng phòng. Ghi chú không bắt buộc; checkout quá giờ không tính là vi phạm. Không suy ra số giờ live TikTok từ thời gian chiếm phòng.
- Giao diện Idol theo tiến trình: Check-in phòng → Nhận máy / Không dùng máy công ty → Nút Checkout ca. Máy và phòng có trạng thái trả riêng; có thể trả phòng trước để ca sau vào.
- Bảng theo dõi gom theo Idol và ngày, bao gồm mọi phòng được mượn, giờ vào/ra, hạn check-in, phút trễ, nhật ký máy và ảnh. Có bộ lọc trạng thái và username. Vận hành có thể bỏ qua lượt chưa vào hoặc tạm dừng/mở bàn giao phòng với nhật ký lý do.
- KHÔNG checkout bù. Chưa checkout thì chưa hoàn tất ca.
- Hoàn tất ca phòng và hoàn tất trả máy là hai trạng thái riêng; không tự động thay thế nhau.
- Ảnh lưu 30 ngày; xóa file bằng tác vụ định kỳ nhưng giữ thời gian, metadata và dấu vết xóa. Đường dẫn cũ không còn dùng để xem ảnh.
- Khả năng bắt buộc chụp trực tiếp được thực hiện bằng UI camera; backend vẫn phải kiểm tra quyền, file và yêu cầu, không coi ảnh là chứng minh chống gian lận tuyệt đối.

## 7. Yêu cầu, thông báo và lịch sử
- Loại: duyệt tài khoản, đăng ký/đổi/hủy lịch, mượn phòng, mượn máy, sự cố. Trả máy không tạo yêu cầu duyệt mới; yêu cầu cũ được giữ lịch sử và đóng khi Idol quét trả.
- Yêu cầu có người gửi, đối tượng, người cần duyệt, trạng thái, thời gian, lý do, người quyết định.
- Không tạo mới yêu cầu checkout bù. Bảng cũ giữ để không xóa dữ liệu đã có.
- Admin quản lý toàn bộ; vận hành chỉ quyết định theo quyền tương ứng tại lúc duyệt.
- Mỗi sự kiện chỉ tạo thông báo phù hợp, không rò dữ liệu qua thông báo khi idol đổi team.
- Số phút trễ làm tròn lên sau hạn check-in; từ chối mượn máy cần lý do. Yêu cầu mượn máy đang chờ được hủy khi trả phòng hoặc đổi lựa chọn máy. Thời hạn các loại yêu cầu khác giữ quy tắc riêng.
- Mọi thay đổi nhạy cảm phải có audit. Audit toàn hệ thống chỉ Admin được đọc.

## 8. Excel và số liệu (giai đoạn sau)
- Admin nhập theo ngày. Idol xem cá nhân, vận hành xem team hiện tại, Admin toàn công ty.
- Đã có file mẫu nhưng chưa được cung cấp cho dự án.
- Chưa chốt tên cột, đơn vị tiền/coin, timezone nguồn, KPI, cách nhập lại và bước công bố.
- Chưa xây parser hay tự đặt chỉ số doanh thu. Cần staging, kiểm tra, xem trước, công bố nguyên khối và lưu phiên bản để hoàn tác.

## 9. SQL được triển khai trong đợt này
- Giữ nguyên migration 001. Migration 002 bổ sung trường, cấu hình, lịch ngày 5 tiếng, ràng buộc tài nguyên, lịch sử, thông báo và snapshot ca.
- Migration 003 bổ sung quyền đọc theo team hiện tại và RPC Admin duyệt/phân công idol.
- Giữ quyền ghi nghiệp vụ phòng/máy/lịch khóa cho client đến khi có RPC được kiểm thử.
- Chưa có backend nhận/trả QR, RPC đặt/mượn phòng, thuật toán ghép, Google callback, camera, gửi thông báo theo sự kiện hoặc tác vụ xóa ảnh.
- Không coi việc chạy SQL là hệ thống đã vận hành được. Chạy test và xem hướng dẫn trước khi áp dụng.

## 10. Trang chủ nội bộ — bổ sung đã chốt
- Dành cho tài khoản active đã đăng nhập, có ở Admin, Vận hành và Idol.
- Admin quản lý poster, thông báo ghim, sự kiện; hẹn thời gian hiển thị và chọn đối tượng xem.
- Ranking theo kim cương từ Excel đã công bố, chỉ hiển thị thứ hạng/tên/ảnh, không trả số kim cương qua RPC trang chủ.
- Mặc định kỳ tháng; cho chọn ngày/tuần/tháng. Đồng điểm đồng hạng (1,1,2); dữ liệu thiếu không coi là 0.
- Sinh nhật idol/vận hành chỉ hiển thị trong ngày; không hiển thị năm sinh/tuổi.
- TẤT CẢ vận hành nhận nhắc sinh nhật toàn công ty trước 3 ngày. Admin cũng nhận; không chỉ vận hành của idol.
- Cron kiểm tra mỗi giờ, chống trùng thông báo. Cần bật pg_cron; database bị pause thì job không chạy.
- Schema và RPC đã có trong migration 004; chưa có giao diện trang chủ mới, parser Excel và Google login hoàn chỉnh.
- Xem SUPABASE-BAT-DAU.md để dùng file SQL tổng hợp cho project mới hoặc migration cho project cũ.
