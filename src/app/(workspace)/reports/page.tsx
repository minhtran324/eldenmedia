import { requireActive } from "@/lib/auth/server";
import { addDays, validDate, vietnamToday } from "@/lib/scheduling";
import { DiamondReportsClient } from "@/components/diamond-reports-client";
import { getDiamondVisibilitySettings } from "@/lib/diamonds-server";

export default async function Reports({ searchParams }: { searchParams: Promise<{ day?: string; team?: string }> }) {
  const { profile, supabase } = await requireActive();
  const params = await searchParams, today = vietnamToday();
  const [latest, settings] = await Promise.all([
    supabase.rpc("latest_published_diamond_date", {}), getDiamondVisibilitySettings(supabase),
  ]);
  const day = params.day && validDate(params.day) && params.day <= today ? params.day : latest.data ?? today;
  const [report, totals] = await Promise.all([
    supabase.rpc("diamond_report_rows", { report_date: day }),
    profile.role === "admin" ? supabase.rpc("diamond_team_totals", { report_date: day }) : Promise.resolve({ data: [], error: null }),
  ]);
  return <>
    <section className="page-heading" suppressHydrationWarning>
      <div className="heading-tag" suppressHydrationWarning><span>💎</span><span>BẢNG XẾP HẠNG KIM CƯƠNG</span></div>
      <h1>Số liệu kim cương {profile.role === "idol" ? "của tôi & Bảng xếp hạng" : profile.role === "operator" ? "toàn team" : "công ty"}</h1>
      <p>Bảng xếp hạng vinh danh nhà sáng tạo xuất sắc · Lũy kế kim cương tháng và ngày theo báo cáo TikTok.</p>
    </section>
    <DiamondReportsClient key={day} records={report.data ?? []} teams={totals.data ?? []}
      currentDay={day} todayStr={today} yesterdayStr={addDays(today, -1)} latestPublishedDate={latest.data}
      role={profile.role} currentUserId={profile.id} initialTeam={params.team}
      currentUserName={profile.nickname || profile.full_name}
      operatorCanViewSetting={settings.operatorCanView} idolCanViewSetting={settings.idolCanView}
      settingsAvailable={settings.available}
      error={report.error ? "Chưa tải được số liệu. Kiểm tra kết nối và chạy migration SQL 023 sau các bản 001–022." : totals.error ? "Chưa tải được tổng kim cương theo team. Vui lòng tải lại." : null} />
  </>;
}
