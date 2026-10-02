import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AdminContentClient } from "@/components/admin-content-client";

export default async function Content() {
  const { profile, supabase } = await requireActive("admin");

  const [postsResult, settingsResult] = await Promise.all([
    supabase
      .from("homepage_posts")
      .select("*")
      .neq("title", "__app_diamond_visibility__")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("company_settings")
      .select("ranking_period")
      .eq("id", true)
      .single(),
  ]);

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag">
          <span>📢</span>
          <span>QUẢN TRỊ TRANG CHỦ</span>
        </div>
        <h1>Quản lý Bảng tin & Truyền thông</h1>
        <p>
          Soạn thông báo, sự kiện, poster truyền thông và cấu hình hiển thị bảng tin công ty.
        </p>
      </section>

      {postsResult.error ? (
        <section className="surface error-surface" role="alert">
          <h2>Chưa tải được danh sách bảng tin</h2>
          <p>Kiểm tra kết nối Supabase và đã chạy migration SQL 009 chưa.</p>
          <Link className="btn secondary" href="/admin/content">
            Tải lại trang
          </Link>
        </section>
      ) : (
        <AdminContentClient
          posts={postsResult.data ?? []}
          initialPeriod={settingsResult.data?.ranking_period ?? "month"}
        />
      )}
    </WorkspaceShell>
  );
}
