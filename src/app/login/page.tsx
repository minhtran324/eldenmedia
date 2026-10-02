import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authConfigured, getAuthContext } from "@/lib/auth/server";
import { accountDestination } from "@/lib/auth/routing";
import { signInWithGoogle } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/account-forms";
import { Brand } from "@/components/workspace-shell";
import { PwaStatus } from "@/components/pwa-provider";

export const dynamic = "force-dynamic";

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const configured = authConfigured();
  if (configured) {
    const { user, profile } = await getAuthContext();
    if (user) redirect(accountDestination(profile));
  }

  const { error } = await searchParams;
  const messages: Record<string, string> = {
    configuration: "Chưa có cấu hình Supabase. Điền URL và Publishable key trong .env.local.",
    origin: "Địa chỉ APP_URL chưa được cấu hình đúng. Liên hệ người quản trị.",
    provider: "Chưa mở được đăng nhập Google. Kiểm tra cấu hình Google trong Supabase hoặc thử lại.",
    callback: "Đăng nhập chưa hoàn tất hoặc liên kết đã hết hạn. Vui lòng thử lại.",
  };

  return (
    <main className="auth-main">
      {/* Brand Story Side */}
      <section className="auth-story">
        <Brand />

        <div className="story-content">
          <div className="auth-slogan-badge">
            <span className="badge-sparkle">✨</span>
            <span>TIKTOK LIVE CREATOR NETWORK</span>
          </div>

          <h1>
            Mỗi ca live.<br />
            Một bước tiến mới.
          </h1>

          <p>
            Hệ thống quản lý nội bộ toàn diện của Elden Media. Lên lịch live, phân phòng thông minh, nhận trả thiết bị và kết nối đội ngũ.
          </p>

          <div className="auth-image-card">
            <Image
              src="/image/Logo_with_slogan.jpg"
              alt="Elden Media Slogan"
              width={340}
              height={208}
              className="auth-slogan-img"
              priority
            />
            <div className="auth-image-caption">
              <span>CÙNG NHAU TỎA SÁNG</span>
              <p>Your Team. Your Stage.</p>
            </div>
          </div>

          <div className="story-line" />
          <span className="story-foot">ELDEN MEDIA · HỆ THỐNG VẬN HÀNH NỘI BỘ</span>
        </div>

        {/* Decorative Floating Circles */}
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <div className="orbit orbit-three" />
      </section>

      {/* Login Entry Card */}
      <section className="auth-entry">
        <div className="login-card">
          <PwaStatus />
          <div className="login-header">
            <div className="login-logo-mini">
              <Image
                src="/image/logo.png"
                alt="Elden Logo"
                width={48}
                height={30}
                priority
              />
            </div>
            <p className="eyebrow">CHÀO MỪNG TRỞ LẠI</p>
            <h2>Đăng nhập Workspace</h2>
            <p className="muted">Sử dụng tài khoản Google để tiếp tục vào không gian làm việc của bạn.</p>
          </div>

          {(!configured || error) && (
            <p className="feedback error" role="alert">
              {!configured
                ? messages.configuration
                : messages[error ?? ""] ?? "Không thể đăng nhập. Hãy thử lại."}
            </p>
          )}

          {configured && (
            <form action={signInWithGoogle} className="login-form">
              <SubmitButton busy="Đang kết nối Google…">
                <span className="google-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </span>
                <span>Tiếp tục với tài khoản Google</span>
                <span className="arrow-icon" aria-hidden="true">→</span>
              </SubmitButton>
            </form>
          )}

          <div className="login-note">
            <div className="note-title-row">
              <span className="note-icon">💡</span>
              <strong>Dành cho thành viên mới</strong>
            </div>
            <p>
              Tài khoản Idol mới đăng nhập lần đầu sẽ ở trạng thái chờ duyệt. Vận hành phụ trách hoặc Admin sẽ kích hoạt và phân công ca live cho bạn.
            </p>
          </div>

          <p className="login-footer">
            🔒 Hệ thống nội bộ được bảo vệ · Chỉ cấp quyền cho nhân sự Elden Media.
          </p>
          <Link className="pwa-login-link" href="/install">Cài Elden Media trên điện thoại / máy tính</Link>
        </div>
      </section>
    </main>
  );
}
