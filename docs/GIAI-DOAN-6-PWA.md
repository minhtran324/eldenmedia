# Giai đoạn 6 — PWA trên điện thoại và máy tính

## Đã có trong code

- Manifest có định danh ổn định, chế độ standalone, biểu tượng PNG 192/512, maskable 512 và Apple 180. Biểu tượng được tạo từ vector `public/icon.svg` hiện có.
- Trang `/install` có nút cài khi trình duyệt hỗ trợ và hướng dẫn Safari, Chrome/Android, Chrome/Edge trên máy tính. Mở từ menu **Cài ứng dụng** hoặc trang đăng nhập; không cần đăng nhập để đọc hướng dẫn.
- Thông báo khi thiết bị báo mất mạng, trang `offline.html` cho lần mở trang thất bại, và nút tải lại khi có phiên bản mới. Tab khác không tự reload khi một tab cập nhật; người dùng chủ động tải lại sau khi lưu xong công việc.
- QR tạm ngừng xác thực và nút gửi ảnh bị khóa khi thiết bị báo offline. Ảnh đang chụp vẫn nằm trong bộ nhớ của trang; kết nối lại rồi xác nhận hoặc quét lại nếu phiên chụp đã hết hạn. Đóng/tải lại trang sẽ mất ảnh chưa gửi.
- Không thêm dependency và không cần migration SQL mới.

## Chạy và cài

1. Trong `C:\EldenMedia`, dừng server cũ bằng Ctrl+C nếu đang chạy trong terminal đó.
2. Chạy `npm.cmd run build`. Lệnh này tự tạo `public/sw.js` với phiên bản mới trước khi Next.js build. Không gọi `next build` trực tiếp khi phát hành.
3. Chạy `npm.cmd start`. Cloudflare Tunnel tiếp tục trỏ vào cổng web đang dùng (mặc định 3000).
4. Mở địa chỉ HTTPS của công ty, chọn **Cài ứng dụng**. iPhone: Safari → Chia sẻ → Thêm vào Màn hình chính. Android: nút cài trên trang nếu có hoặc menu Chrome → Cài đặt ứng dụng / Thêm vào màn hình chính.
5. Mở biểu tượng Elden và đăng nhập Google nếu được yêu cầu. Tài khoản, quyền và duyệt lần đầu vẫn theo các giai đoạn trước.

Service worker chỉ được đăng ký ở bản production (`build` + `start`) trong secure context. `localhost` được dùng cho kiểm thử trên máy tính; điện thoại dùng HTTPS. Nút cài trực tiếp phụ thuộc hỗ trợ của trình duyệt, nên luôn có hướng dẫn cài thủ công. Safari/iPhone không dùng `beforeinstallprompt`.

Địa chỉ đã cài gắn với origin đang mở. Nếu Quick Tunnel đổi hostname sau khi khởi động lại, biểu tượng cũ vẫn mở hostname cũ; hãy dùng URL ổn định khi phát hành cho nhân sự. `APP_URL`, cấu hình OAuth và redirect Supabase cần cùng URL đang sử dụng.

## Dữ liệu và mạng

- Worker chỉ cache đúng năm tài nguyên công khai: `offline.html` và bốn PNG icon. Không cache trang tài khoản, lịch, bảng tin, tổng kim cương, ảnh phòng, API, callback OAuth, mã RSC hoặc request sang Supabase.
- Không có queue ghi offline, background sync hay replay giao dịch. Chỉ phản hồi thành công từ server mới xác nhận thao tác. Nếu mất mạng sau khi bấm gửi, kiểm tra trạng thái khi kết nối lại.
- Khi web đã mở, indicator `navigator.onLine` chỉ mô tả kết nối thiết bị; có Wi-Fi không đảm bảo máy chủ/Supabase đang hoạt động. Các luồng hiện có vẫn xử lý lỗi request.
- Trang offline không thay thế hoạt động của backend. Máy chạy web và Tunnel phải tiếp tục chạy để nhân sự đăng nhập, xem dữ liệu và gửi thao tác.
- PWA giai đoạn này chưa có push notification khi ứng dụng đóng. Chuông và hộp thư trong web giữ nguyên.

## Cập nhật code

Sau mỗi lần sửa: `npm.cmd run build` rồi khởi động lại `npm.cmd start`. Worker có phiên bản mới mỗi build, không bị cache HTTP cũ. App kiểm tra cập nhật khi mở, khi quay lại màn hình/khôi phục mạng và mỗi giờ khi đang hiển thị; hiển thị **Tải lại ứng dụng** nếu phát hiện bản mới. Cũng có thể đóng toàn bộ cửa sổ app rồi mở lại.

Không tự reload khi đang nhập lịch hoặc chụp ảnh. Nút **Tải lại ứng dụng** là hành động chủ động của người dùng; hãy lưu dữ liệu trước khi bấm. PWA không cần cài lại khi code đổi nhưng hostname không đổi.

## Kiểm thử

- `npm.cmd run test:pwa`: 16 tình huống worker (cache công khai, loại bỏ API/OAuth/POST/RSC, không giữ dữ liệu phiên trước, fallback mất mạng và cập nhật chủ động).
- Build xong, chạy server kiểm thử riêng nếu cần: `npm.cmd start -- -p 3100`. Terminal khác: `node tests/pwa-http.mjs http://localhost:3100` và `node tests/auth-http.mjs http://localhost:3100`.
- `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`.
- Cần nghiệm thu trên iPhone/Android thật: cài app, Google login, cấp quyền camera, QR/check-in/out, mất mạng giữa lúc tải ảnh, quay lại từ background và cài bản cập nhật. Kiểm thử desktop không thay thế các bước này.

## Tham khảo chính thức

- Next.js PWA: https://nextjs.org/docs/app/guides/progressive-web-apps
- MDN install prompt: https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event
- MDN cache: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
