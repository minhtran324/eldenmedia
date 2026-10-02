import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { addDays, validDate, vietnamToday } from "@/lib/scheduling";
import { TrialLiveForm } from "./trial-live-form";
import { TrialLiveCalendar } from "./trial-live-calendar";

export async function TrialLiveWorkspace({ role, params }: { role: "admin" | "operator"; params: { date?: string } }) {
  const { profile, supabase } = await requireActive(role);
  const today = vietnamToday();
  // eslint-disable-next-line react-hooks/purity -- Serialize one authenticated request timestamp for consistent client hydration.
  const serverNow = Date.now();
  const start = params.date && validDate(params.date) ? params.date : today;
  const end = addDays(start, 30);
  const [roster, calendar, rooms, settings, operators] = await Promise.all([
    supabase.rpc("trial_live_roster", {}),
    supabase.rpc("trial_live_calendar", { first_day: start, last_day: end }),
    supabase.from("rooms").select("*").order("code"),
    supabase.from("company_settings").select("opening_hour,closing_hour").single(),
    role === "admin" ? supabase.from("profiles").select("id,full_name").eq("role", "operator").eq("status", "active").order("full_name")
      : Promise.resolve({ data: [{ id: profile.id, full_name: profile.full_name }], error: null }),
  ]);
  const failed = roster.error || calendar.error || rooms.error || settings.error || operators.error;
  return <>
    <section className="page-heading"><Link href={`/${role}/schedule`} className="back-link">← Về lịch live</Link>
      <div className="heading-tag">TEST LIVE</div><h1>Đăng ký lịch Idol test</h1>
      <p>Mỗi ngày 2 tiếng liên tục · Tối đa 5 ngày test · Chọn 1–5 ngày trong một lần đăng ký.</p></section>
    {failed ? <section className="surface" role="alert"><h2>Chưa tải được dữ liệu test live</h2>
      <p>Chạy migration SQL 024 trên Supabase sau bản 023, sau đó tải lại trang. Lịch Idol chính thức vẫn dùng luồng hiện tại.</p>
      <Link className="btn secondary" href={`/${role}/schedule/trials`}>Tải lại</Link></section> : <>
      <TrialLiveForm role={role} currentUserId={profile.id} today={today} serverNow={serverNow} roster={roster.data ?? []} rooms={rooms.data ?? []}
        operators={operators.data ?? []} opening={settings.data!.opening_hour} closing={settings.data!.closing_hour} />
      <section className="surface trial-date-filter"><form method="get"><label htmlFor="trial-view-date">Xem lịch test trong 30 ngày từ</label>
        <input id="trial-view-date" type="date" name="date" defaultValue={start} required/><button className="btn secondary">Xem lịch</button></form>
        <Link href={`/${role}/schedule?tab=borrow`} className="btn secondary">Duyệt mượn phòng</Link></section>
      <TrialLiveCalendar records={calendar.data ?? []} role={role} currentUserId={profile.id} serverNow={serverNow} title="Lịch test đã đăng ký" showHistory />
    </>}
  </>;
}
