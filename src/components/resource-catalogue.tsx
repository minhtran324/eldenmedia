import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "./workspace-shell";
import { ResourceClientView } from "./resource-client-view";

export async function ResourceCatalogue({ role }: { role: "admin" | "operator" }) {
  const { supabase, profile } = await requireActive(role);
  const [f, r, d, o] = await Promise.all([
    supabase.from("floors").select("id,code,name,sort_order,version").order("sort_order").order("code"),
    supabase.from("rooms").select("id,code,name,floor_id,room_type,manager_id,status,qr_token,version").order("code"),
    supabase.from("devices").select("id,code,assigned_room_id,manager_id,status,qr_token,version").order("code"),
    supabase.from("profiles").select("id,full_name,status").eq("role", "operator").order("full_name"),
  ]);

  const isAdmin = role === "admin";
  const floors = f.data ?? [];
  const rooms = r.data ?? [];
  const devices = d.data ?? [];
  const operators = (o.data ?? []).filter((p) => p.status === "active");
  const unavailable = f.error || r.error || d.error || o.error;

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag">
          <span>🏢</span>
          <span>KHÔNG GIAN & THIẾT BỊ</span>
        </div>
        <h1>Phòng live & Điện thoại</h1>
        <p>
          {isAdmin
            ? "Quản lý danh mục phòng live, thiết bị điện thoại, phân tầng và tải mã QR để in dán."
            : "Tra cứu danh mục phòng live, vị trí tầng và danh sách điện thoại công ty."}
        </p>
      </section>

      {unavailable ? (
        <section className="surface" role="alert">
          <h2>Chưa tải được danh mục tài nguyên</h2>
          <p>Kiểm tra kết nối và đảm bảo đã chạy migration SQL 006 trên Supabase.</p>
          <Link className="btn secondary" href={`/${role}/resources`}>
            Tải lại trang
          </Link>
        </section>
      ) : (
        <ResourceClientView
          role={role}
          floors={floors}
          rooms={rooms}
          devices={devices}
          operators={operators}
          currentProfileId={profile.id}
        />
      )}
    </WorkspaceShell>
  );
}
