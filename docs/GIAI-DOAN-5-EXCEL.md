# Giai đoạn 5 — Nhập kim cương TikTok

## Kích hoạt

1. Nếu đã chạy đến SQL 016, chỉ chạy thêm `supabase/migrations/202609300017_monthly_diamonds.sql` trong Supabase SQL Editor. Dự án mới cần chạy các migration còn thiếu theo thứ tự. Không chạy lại bootstrap.
2. `npm.cmd run db:check` → schema `202609300017`. Nếu chạy production: `npm.cmd run build` rồi khởi động lại `npm.cmd start`; nếu phát triển: `npm.cmd run dev`. Giữ Tunnel.
3. Admin mở **Nhập Excel TikTok** (`/admin/imports`). Cả ba vai trò có **Số liệu kim cương** (`/reports`).

Đã cài ExcelJS 4.4.0 trong dự án. Khi chuyển sang máy khác cần cài dependency theo lockfile. SQL 017 không cần dependency, biến môi trường, Storage bucket hoặc Cron mới. Agent kiểm thử trên PostgreSQL cục bộ, chưa áp dụng SQL 017 lên Supabase thật.

## Định dạng đã hỗ trợ

- File .xlsx tối đa 3 MB, một bảng có hai tiêu đề `Tên người dùng của nhà sáng tạo` và `Kim cương` trong 10 dòng đầu. Tìm theo tên cột, không phụ thuộc C/H.
- File mẫu cung cấp có Sheet1, tiêu đề C1 và H1, 10 dòng dữ liệu, 129.266 kim cương. Kỳ dữ liệu mẫu là 29/09/2026 dù file được tải ngày 30/09/2026.
- Chỉ lưu username, kim cương; kèm thông tin nghiệp vụ ngày do Admin chọn, số dòng, liên kết Idol, tên/hash file, người nhập và lịch sử xử lý. Không lưu workbook gốc, email đại diện, ID nhà sáng tạo, thời lượng live, follower hoặc các cột khác.
- Chọn ngày số liệu thủ công. Chỉ dùng báo cáo của một ngày; không tự suy ra ngày từ tên file hoặc chuyển ngày UTC. Admin chịu trách nhiệm chọn ngày đúng với báo cáo.
- Tối đa 1.000 nhà sáng tạo. Username chuẩn hóa bỏ @ đầu, khoảng trắng hai đầu và chữ hoa; không tự ghép theo nickname/họ tên.
- Kim cương 0 là hợp lệ; ô trống, số âm, số lẻ, công thức và số vượt độ chính xác nguyên an toàn bị báo lỗi. Chấp nhận chuỗi số nguyên hoặc nhóm nghìn bằng dấu phẩy/chấm.
- Username trùng, thiếu tiêu đề, trùng tiêu đề hoặc nhiều sheet cùng có bảng phù hợp đều bị chặn. Có một dòng lỗi thì chưa lưu cả file; sửa file nguồn và tải lại.

## Luồng sử dụng

1. Admin chọn ngày số liệu, tải file. Dữ liệu chỉ ở bản chờ đối chiếu, chưa hiển thị cho Idol/Vận hành hoặc ranking.
2. Username đã liên kết khớp tự động. Với username mới, chọn **Ghép / sửa Idol**, chọn đúng Idol đang hoạt động, lưu liên kết.
3. Mỗi Idol có một tài khoản TikTok. Nếu Idol đổi username, cần tích xác nhận đổi; giữ ID nội bộ của tài khoản và lịch sử tên cũ. Không chuyển tài khoản đã thuộc người này sang người khác.
4. File không lấy TikTok numeric ID theo yêu cầu; tài khoản mới dùng khóa nội bộ ổn định, không giả định username chính là numeric ID. Các lần nhập tiếp theo khớp username hiện tại.
5. Khi tất cả dòng đã khớp, kiểm tra ngày, kim cương ngày, **Tổng tháng hiện tại** và **Tổng tháng sau công bố**, rồi **Lưu & công bố số liệu ngày**. Tổng dự kiến gồm các ngày đã công bố trong cùng tháng, bỏ số liệu cũ của ngày đang thay thế và cộng số liệu ngày trong file.
6. Bảng tin `/home` mặc định xếp hạng theo tháng. Mỗi ngày mới được cộng vào tổng tháng, sang tháng mới tính lại mà không xóa lịch sử. Chọn tháng để xem lại bảng xếp hạng cũ. Admin vẫn có thể đổi kỳ mặc định trong quản trị nội dung.
7. Trên bảng tin: Idol chỉ thấy hạng và username; Vận hành/Admin thấy thêm tổng kim cương mỗi Idol và tổng của các Idol trong bảng. Database trả `null` cho các trường tổng khi người gọi là Idol, không chỉ ẩn bằng CSS. Hạng chỉ tính Idol đang hoạt động; đồng kim cương thì đồng hạng.
8. **Số liệu kim cương** `/reports` cho chọn ngày, xem số liệu ngày và lũy kế từ đầu tháng đến ngày đó: Idol thấy cá nhân, Vận hành thấy Idol hiện được phân, Admin thấy công ty. Tổng được tính trong database, không bị giới hạn 1.000 dòng ngày trên trình duyệt. Ngày chưa có dữ liệu hiển thị —, khác với số 0. Lịch sử của Idol ngừng hoạt động vẫn có trong báo cáo của người được quyền xem.

## Nhập lại, thu hồi và lịch sử

- Cùng hash file + ngày trả về bản cũ, không nhân đôi dữ liệu. Cùng file khác ngày vẫn được phép vì ngày do Admin xác nhận.
- Chỉ có một bản được công bố cho mỗi ngày. Nhập bản khác cùng ngày yêu cầu xác nhận **thay thế toàn bộ ngày**, không cộng trùng. Idol bị thiếu trong bản mới sẽ mất số liệu ngày đó; các ngày khác vẫn giữ và tổng tháng được tính lại.
- Bản cũ và các dòng đối chiếu vẫn được giữ; chưa có nút xóa lịch sử.
- Tab cũ có kỳ vọng bản hiện hành khác thực tế sẽ bị chặn công bố. Kiểm tra lại danh tính tài khoản và trạng thái Idol khi công bố, không chỉ dựa vào preview.
- Thu hồi gỡ số liệu bản đó khỏi báo cáo/ranking, không tự khôi phục bản trước. Có thể chọn bản cũ và công bố lại nếu liên kết username vẫn hợp lệ.
- Nếu username đã đổi, bản lưu trữ không được sửa để viết lại lịch sử. Cần nhập báo cáo phù hợp với username hiện tại để sửa số liệu; chưa có cơ chế ánh xạ tự động alias theo thời điểm lịch sử.
- Ngày của một bản nhập không chỉnh trực tiếp; nếu chọn nhầm ngày, thu hồi nếu đã công bố, sau đó tải file lại với đúng ngày.

## Quyền và kiểm tra

- Chỉ Admin gọi được RPC nhập/ghép/công bố/thu hồi và `diamond_import_month_preview`. Dòng đối chiếu và lịch sử file có RLS Admin; raw metrics giữ RLS theo Idol/team. `homepage_diamond_ranking` chỉ cấp tổng trên bảng tin công ty cho Admin/Vận hành; `diamond_monthly_report` kiểm tra phạm vi cá nhân/team qua `private.can_read_idol`. RPC ranking cũ vẫn chỉ trả hạng/tên.
- Ghi qua RPC, không mở quyền ghi bảng. Thay thế ngày trong một transaction, có khóa ngăn hai lần công bố đồng thời trong workflow. Có audit batch, dòng và thay đổi tài khoản.
- API upload kiểm tra phiên Admin, Origin với APP_URL và kích thước request/file. Chỉ phục vụ file Excel do Admin tải lên. Các giới hạn archive/header/dòng không thay thế kiểm thử tải thực tế.
- Đã đạt 201 kiểm thử SQL tích hợp và 9 kiểm tra parser, trong đó dùng file mẫu thật. Các trường hợp gồm trùng file, thay thế/ngăn tab cũ, thu hồi/công bố lại, RLS theo team, username đổi, số âm/ô trống/công thức.
- `node tests/diamond-import-sql.mjs` sau khi cài tests; `node --experimental-strip-types tests/tiktok-parser.mjs "đường dẫn file mẫu"`; lint/build và kiểm tra HTTP chưa đăng nhập.
- SQL 017 có thêm 32 kiểm thử cho cộng ngày, thay thế/thu hồi, xem tháng cũ, chuyển tháng, số 0/ngày thiếu, đổi username, số nguyên lớn, hơn 1.000 dòng ngày và quyền của từng vai trò. Chạy `node tests/monthly-diamonds-sql.mjs` sau khi cài dependencies trong thư mục tests.
- Chưa thực hiện import bằng tài khoản Google thật trên Supabase hoặc kiểm thử nhiều kết nối đồng thời. Báo cáo đã có lũy kế tháng; biểu đồ và khoảng ngày tùy chọn có thể mở rộng sau.

## Nghiệm thu lần đầu

- Chạy SQL, chọn ngày 29/09/2026 cho file mẫu và tải lên.
- Kiểm tra 10 dòng/tổng 129.266; ghép từng username với đúng Idol đã duyệt.
- Chưa công bố: Idol không thấy dữ liệu. Sau công bố: kiểm tra một Idol, vận hành phụ trách và ranking kỳ tháng 09/2026.
- Tải lại cùng file/ngày: vẫn một bản. Thử thay thế/thu hồi bằng ngày và tài khoản thử trước khi dùng cho báo cáo thật.
- Ví dụ Idol A: 01/09 nhập 100, 02/09 nhập 150 → tháng 09 là 250. Sửa 02/09 thành 180 → tháng 09 là 280; thu hồi ngày 02/09 → còn 100. Nhập 01/10 là 20 → tháng 10 là 20, tháng 09 vẫn xem lại được.
- Kiểm tra cùng tháng bằng ba vai trò: Idol chỉ thấy hạng trên bảng tin, Vận hành/Admin thấy hạng và tổng. Trong báo cáo riêng, Idol vẫn xem được số liệu của chính mình theo yêu cầu ban đầu.
