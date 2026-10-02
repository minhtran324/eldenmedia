import { requireUser } from "@/lib/auth/server";
import { refreshAccess, signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/account-forms";
export default async function Unavailable() {
  await requireUser();
  return <main className="onboarding-page"><section className="surface status-page"><h1>Chưa hoàn tất thiết lập tài khoản.</h1><p>Admin cần kiểm tra migration SQL 005 và hồ sơ tài khoản. Khi đã cập nhật, bạn có thể thử lại mà không đăng ký mới.</p><div className="inline-actions"><form action={refreshAccess}><SubmitButton>Thử hoàn tất lại</SubmitButton></form><form action={signOut}><SubmitButton secondary>Đăng xuất</SubmitButton></form></div></section></main>;
}
