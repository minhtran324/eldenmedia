import { requireActive } from "@/lib/auth/server";
import { weekStart, vietnamToday } from "@/lib/scheduling";
import { LateDecisionForm } from "./weekly-registration";
export async function LatePermissionInbox() {
  const { profile, supabase } = await requireActive(); if (profile.role === "idol") return null;
  const { data, error } = await supabase.from("late_schedule_permissions").select("*").eq("status", "pending").eq("week_start", weekStart(vietnamToday())).order("created_at");
  const names = data?.length ? await supabase.from("profiles").select("id,full_name").in("id", data.map(r => r.idol_id)) : { data: [], error: null };
  return <section className="surface"><h2>Xin đăng ký lịch trễ</h2>{error || names.error ? <p role="alert">Chưa tải được yêu cầu đăng ký trễ. Kiểm tra SQL 014.</p> : !data?.length ? <p className="hint">Không có yêu cầu đang chờ của tuần hiện tại.</p> : data.map(r => <article key={`${r.id}:${r.revision}`} className="request-item"><h3>{names.data?.find(p => p.id === r.idol_id)?.full_name ?? "Idol"}</h3><p>Tuần {r.week_start} · Lý do: {r.reason}</p><LateDecisionForm id={r.id} revision={r.revision} /></article>)}</section>;
}
