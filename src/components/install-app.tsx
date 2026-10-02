"use client";

import { useSyncExternalStore } from "react";
import { useOnlineStatus, usePwa } from "./pwa-provider";

const subscribe = () => () => {};
const secureBrowser = () => window.isSecureContext;

export function InstallApp() {
  const { installed, canInstall, installing, installMessage, install } = usePwa();
  const online = useOnlineStatus();
  const secure = useSyncExternalStore(subscribe, secureBrowser, () => true);
  return <>
    <section className="surface install-primary">
      <div className="install-app-mark" aria-hidden="true">E</div>
      <div><p className="eyebrow">ELDEN MEDIA · TRÊN THIẾT BỊ CỦA BẠN</p><h1>{installed ? "Elden Media đã sẵn sàng" : "Thêm Elden Media vào màn hình chính"}</h1><p>Mở lịch live, quét QR và xem bảng tin từ biểu tượng ứng dụng.</p></div>
      {installed ? <p className="feedback success">Bạn đã cài ứng dụng hoặc đang mở Elden Media ở chế độ ứng dụng.</p> : canInstall ? <button type="button" className="btn" disabled={!online || installing} onClick={() => void install()}>{installing ? "Đang mở cài đặt…" : "Cài ứng dụng Elden Media"}</button> : <p className="hint">Chọn hướng dẫn phù hợp với thiết bị bên dưới. Nút cài trực tiếp sẽ xuất hiện khi trình duyệt hỗ trợ.</p>}
      {!secure && <p className="feedback error" role="alert">Mở địa chỉ HTTPS của công ty để cài ứng dụng và dùng camera.</p>}
      {installMessage && <p role="status">{installMessage}</p>}
    </section>
    <div className="install-grid">
      <section className="surface"><span className="small-tag">iPhone / iPad</span><h2>Cài bằng Safari</h2><ol><li>Mở địa chỉ web của công ty trong Safari.</li><li>Bấm nút <strong>Chia sẻ</strong>.</li><li>Chọn <strong>Thêm vào Màn hình chính</strong> (Add to Home Screen).</li><li>Nếu có <strong>Mở dưới dạng ứng dụng web</strong>, bật tùy chọn này; sau đó bấm <strong>Thêm</strong>.</li></ol><p className="hint">Mở biểu tượng Elden trên màn hình chính và đăng nhập Google nếu được yêu cầu.</p></section>
      <section className="surface"><span className="small-tag">Android</span><h2>Cài bằng Chrome</h2><ol><li>Mở web bằng Chrome.</li><li>Bấm <strong>Cài ứng dụng Elden Media</strong> phía trên nếu có.</li><li>Hoặc mở menu <strong>⋮</strong> → <strong>Thêm vào màn hình chính</strong> / <strong>Cài đặt ứng dụng</strong>.</li><li>Xác nhận cài đặt và mở biểu tượng Elden.</li></ol><p className="hint">Nếu đang mở link bên trong Zalo hoặc một ứng dụng khác, hãy mở bằng trình duyệt trước.</p></section>
      <section className="surface"><span className="small-tag">Máy tính</span><h2>Cài bằng Chrome / Edge</h2><p>Dùng nút cài phía trên hoặc biểu tượng cài ứng dụng trên thanh địa chỉ. Bạn vẫn có thể dùng web trực tiếp như trước.</p></section>
      <section className="surface"><span className="small-tag">Khi dùng hằng ngày</span><h2>Kết nối & cập nhật</h2><p>Cho phép camera khi quét QR. Giữ Wi-Fi hoặc dữ liệu di động để xác nhận các thao tác.</p><p>Khi có phiên bản mới, lưu xong công việc rồi bấm <strong>Tải lại ứng dụng</strong>. Khi mất mạng, ảnh vừa chụp chỉ còn trong phiên hiện tại; hãy kết nối lại trước khi đóng trang.</p></section>
    </div>
  </>;
}
