"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="onboarding-page"><section className="surface status-page"><h1>Chưa tải được trang.</h1><p>Kết nối hoặc dịch vụ đang gặp lỗi. Dữ liệu riêng tư chưa được hiển thị.</p><button className="btn" onClick={reset}>Thử lại</button></section></main>;
}
