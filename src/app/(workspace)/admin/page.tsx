import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AdminHRClient } from "@/components/admin-hr-client";
import { loadAdminMembers } from "@/lib/admin/members";

export default async function Admin({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { profile, supabase } = await requireActive("admin");
  const params = await searchParams;

  const [membersResult, operatorsResult, invitesResult, accountsResult] = await Promise.all([
    loadAdminMembers(supabase),
    supabase.from("profiles").select("id,full_name").eq("role", "operator").eq("status", "active").order("full_name"),
    supabase.from("operator_access_invites").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(50),
    supabase.from("platform_accounts").select("idol_id,username"),
  ]);

  const failures = [
    { label: "Danh sách nhân sự", error: membersResult.error },
    { label: "Danh sách vận hành", error: operatorsResult.error },
    { label: "Lời mời vận hành", error: invitesResult.error },
    { label: "Tài khoản TikTok", error: accountsResult.error },
  ].flatMap(({ label, error }) => error ? [{ label, code: error.code || "CONNECTION_ERROR" }] : []);

  if (failures.length) console.error("[admin] HR queries failed", failures);

  const usernameMap: Record<string, string | null> = {};
  for (const a of accountsResult.data ?? []) {
    usernameMap[a.idol_id] = a.username;
  }

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag"><span>👥</span><span>QUẢN LÝ NHÂN SỰ</span></div>
        <h1>Quản lý Nhân sự</h1>
        <p>Duyệt thành viên mới · Phân team · Cấp quyền vận hành · Quản lý tài khoản</p>
      </section>

      {failures.length > 0 ? (
        <section className="surface" role="alert">
          <h2>Chưa tải được dữ liệu nhân sự</h2>
          <p>Vui lòng tải lại trang. Nếu lỗi tiếp diễn, gửi mã lỗi bên dưới để kiểm tra.</p>
          <ul>
            {failures.map(({ label, code }) => (
              <li key={label}>{label}: <code>{code}</code></li>
            ))}
          </ul>
          <Link className="btn secondary" href="/admin">Tải lại trang</Link>
        </section>
      ) : (
        <AdminHRClient
          members={membersResult.data ?? []}
          operators={operatorsResult.data ?? []}
          invites={invitesResult.data ?? []}
          usernames={usernameMap}
          initialTab={params.tab}
        />
      )}
    </WorkspaceShell>
  );
}
