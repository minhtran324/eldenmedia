import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { accountDestination } from "@/lib/auth/routing";
import { signOut } from "@/lib/auth/actions";
import { SubmitButton } from "@/components/account-forms";
import { Brand } from "@/components/workspace-shell";
export default async function Suspended() {
  const { profile } = await requireUser();
  if (profile?.status !== "suspended") redirect(accountDestination(profile));
  return <main className="onboarding-page"><Brand /><section className="surface status-page"><span className="role-pill red">Tài khoản tạm khóa</span><h1>Quyền truy cập đang tạm dừng.</h1><p>Liên hệ Admin để kiểm tra trạng thái. Bạn không cần đăng ký lại tài khoản.</p><form action={signOut}><SubmitButton secondary>Đăng xuất</SubmitButton></form></section></main>;
}
