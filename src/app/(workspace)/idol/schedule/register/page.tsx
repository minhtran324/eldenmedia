import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { WeeklyRegistration, LateRequestForm } from "@/components/weekly-registration";
import { addDays, vietnamToday, weekStart } from "@/lib/scheduling";

function formatVnDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const days = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { weekday: days[d.getUTCDay()], date: `${dd}/${mm}` };
}

export default async function RegisterWeek({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { profile, supabase } = await requireActive("idol");
  const params = await searchParams;
  const today = vietnamToday();
  const current = weekStart(today);
  const next = addDays(current, 7);
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const week =
    params.week === current || params.week === next
      ? params.week
      : sunday
      ? next
      : current;
  const end = addDays(week, 6);

  const [registration, permission, settings, plans, requests, access] =
    await Promise.all([
      supabase
        .from("weekly_registrations")
        .select("*")
        .eq("idol_id", profile.id)
        .eq("week_start", week)
        .maybeSingle(),
      supabase
        .from("late_schedule_permissions")
        .select("*")
        .eq("idol_id", profile.id)
        .eq("week_start", week)
        .maybeSingle(),
      supabase
        .from("company_settings")
        .select("opening_hour,closing_hour")
        .single(),
      supabase
        .from("daily_plans")
        .select("work_date,status")
        .eq("idol_id", profile.id)
        .gte("work_date", week)
        .lte("work_date", end)
        .in("status", ["approved", "completed"]),
      supabase
        .from("requests")
        .select("id,details")
        .eq("subject_idol_id", profile.id)
        .eq("status", "pending")
        .in("kind", ["schedule", "schedule_change", "schedule_cancel"])
        .gte("details->>work_date", week)
        .lte("details->>work_date", end),
      supabase.rpc("weekly_registration_access", { week }),
    ]);

  const error =
    registration.error ||
    permission.error ||
    settings.error ||
    plans.error ||
    requests.error ||
    access.error;
  const allowed = access.data === true;
  const existing = [
    ...new Set([
      ...(plans.data ?? []).map(p => p.work_date),
      ...(requests.data ?? []).map(r => r.details.work_date),
    ]),
  ];

  const isCurrentWeek = week === current;

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <Link href="/idol/schedule" className="back-link">
          ← Quay lại Lịch live của tôi
        </Link>
        <span className="eyebrow">ĐĂNG KÝ THEO TUẦN</span>
        <h1>Đăng ký lịch làm việc trọn tuần</h1>
        <p className="muted">
          Tuần từ {week} đến {end} · Khung giờ mở cửa: {settings.data?.opening_hour ?? 9}h – {settings.data?.closing_hour ?? 24}h (Giờ VN)
        </p>
      </section>

      {/* Week Switcher Tabs */}
      <nav className="inline-actions week-tabs-bar">
        <Link
          className={`btn ${isCurrentWeek ? "" : "secondary"}`}
          href={`/idol/schedule/register?week=${current}`}
        >
          {isCurrentWeek ? "● " : ""}Tuần hiện tại ({current})
        </Link>
        <Link
          className={`btn ${!isCurrentWeek ? "" : "secondary"}`}
          href={`/idol/schedule/register?week=${next}`}
        >
          {!isCurrentWeek ? "● " : ""}Tuần kế tiếp ({next})
        </Link>
      </nav>

      <section className="surface register-week-container">
        {error ? (
          <div className="feedback error" role="alert">
            Chưa tải được thông tin đăng ký tuần. Vui lòng kiểm tra kết nối và thử lại.
          </div>
        ) : registration.data ? (
          <div className="registered-summary-box">
            <div className="summary-header">
              <span className="summary-badge-success">✓ Đã gửi đăng ký thành công</span>
              <h2>Kế hoạch tuần {week} – {end}</h2>
              <p className="muted">
                Vận hành phụ trách đang xem xét điều phối phòng live và duyệt lịch cho từng ngày. Bạn có thể theo dõi tiến độ ở trang Lịch live.
              </p>
            </div>

            <div className="registered-days-grid">
              {registration.data.days.map((d: { date: string; mode: string; shifts: { start_hour: number; end_hour: number }[] }) => {
                const { weekday, date } = formatVnDate(d.date);
                const isWork = d.mode === "work";
                const isOff = d.mode === "off";

                return (
                  <div
                    key={d.date}
                    className={`registered-day-item ${isWork ? "is-work" : isOff ? "is-off" : "is-other"}`}
                  >
                    <div className="registered-day-top">
                      <strong className="day-name">{weekday}</strong>
                      <span className="day-date">{date}</span>
                    </div>
                    <div className="registered-day-status">
                      {isWork ? (
                        <>
                          <span className="work-tag">💼 5h Live</span>
                          <span className="shifts-text">
                            {d.shifts.map(s => `${s.start_hour}:00–${s.end_hour}:00`).join(" / ")}
                          </span>
                        </>
                      ) : isOff ? (
                        <span className="off-tag">🏖️ Nghỉ ngơi</span>
                      ) : d.mode === "existing" ? (
                        <span className="existing-tag">🔒 Giữ lịch cũ</span>
                      ) : (
                        <span className="past-tag">⏳ Đã qua</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="summary-action-row">
              <Link className="btn" href={`/idol/schedule?date=${week}`}>
                Xem chi tiết lịch live & trạng thái duyệt →
              </Link>
            </div>
          </div>
        ) : allowed ? (
          <WeeklyRegistration
            key={`${week}:${existing.join()}`}
            week={week}
            today={today}
            existing={existing}
            opening={settings.data!.opening_hour}
            closing={settings.data!.closing_hour}
          />
        ) : week === next ? (
          <div className="waiting-register-card">
            <span className="waiting-icon">📅</span>
            <h2>Mở đăng ký vào Chủ nhật</h2>
            <p>
              Cổng đăng ký trọn tuần cho tuần kế tiếp ({next} – {end}) sẽ tự động mở vào <strong>Chủ nhật</strong> theo giờ Việt Nam.
            </p>
            <p className="muted">
              Vui lòng quay lại vào Chủ nhật để gửi lịch đăng ký đúng hạn.
            </p>
            <Link className="btn secondary" href={`/idol/schedule?date=${current}`}>
              ← Xem lịch tuần hiện tại
            </Link>
          </div>
        ) : (
          <div className="late-permission-card">
            <span className="late-icon">⚠️</span>
            <h2>Xin quyền đăng ký trễ</h2>
            <p>
              Bạn đã lỡ kỳ đăng ký tập trung vào Chủ nhật tuần trước. Để đăng ký lịch cho tuần này, bạn cần gửi yêu cầu xin đăng ký trễ để Vận hành phụ trách hoặc Admin phê duyệt.
            </p>

            {permission.data?.status === "pending" ? (
              <div className="feedback success">
                ✓ Đã gửi yêu cầu đăng ký trễ, đang chờ Vận hành duyệt. Vui lòng quay lại hoặc tải lại trang sau khi được cấp quyền.
              </div>
            ) : (
              <>
                {permission.data?.status === "rejected" && (
                  <div className="feedback error">
                    Yêu cầu đăng ký trễ trước đó đã bị từ chối: {permission.data.decision_reason || "Không có lý do cụ thể."}
                  </div>
                )}
                <LateRequestForm week={week} />
              </>
            )}
          </div>
        )}
      </section>
    </WorkspaceShell>
  );
}
