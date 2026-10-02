import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ProfileForm } from "@/components/account-forms";
export default async function ProfilePage() {
  const { profile, user, supabase } = await requireActive();
  const { data: tiktok } = profile.role === "idol"
    ? await supabase.from("platform_accounts").select("username,nickname,external_id").eq("idol_id", profile.id).maybeSingle()
    : { data: null };
  return <WorkspaceShell profile={profile}><section className="page-heading"><p className="eyebrow">TÀI KHOẢN CÁ NHÂN</p><h1>Hồ sơ của tôi</h1><p>{user.email}</p></section><section className="surface profile-surface"><h2>{profile.role === "idol" ? "Thông tin cá nhân & TikTok" : "Thông tin cá nhân"}</h2><ProfileForm profile={profile} tiktokUsername={tiktok?.username ?? ""} /><p className="hint">Ngày vào công ty: {profile.joined_on ? profile.joined_on.split("-").reverse().join("/") : "Chưa cập nhật"}</p>{profile.role === "idol" && <p className="hint">Tài khoản TikTok: {tiktok?.username ? `@${tiktok.username}` : "Chưa liên kết"} · ID: {tiktok?.external_id ?? "Chưa có"}</p>}</section></WorkspaceShell>;
}
