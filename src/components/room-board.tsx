import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { addDays, validDate, vietnamToday } from "@/lib/scheduling";
import { WorkspaceShell } from "./workspace-shell";
import { RoomMatrix } from "./room-matrix";
import { RoomPlanner, DecisionForm } from "./schedule-forms";

function formatDayVi(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const days = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${days[d.getUTCDay()]}, ${dd}/${mm}/${yyyy}`;
}

export async function RoomBoard({
  role,
  params,
}: {
  role: "admin" | "operator";
  params: { date?: string; request?: string; page?: string };
}) {
  const { profile, supabase } = await requireActive(role);
  const today = vietnamToday();
  const day =
    params.date && validDate(params.date) && params.date >= today
      ? params.date
      : today;
  const page = Math.max(1, Math.min(10000, parseInt(params.page ?? "1", 10) || 1));
  const prevDay = addDays(day, -1);
  const nextDay = addDays(day, 1);

  const [requests, rooms, people, accounts, settings, assignments, sessions, trials] =
    await Promise.all([
      supabase
        .from("requests")
        .select("*", { count: "exact" })
        .eq("status", "pending")
        .in("kind", ["schedule", "schedule_change", "schedule_cancel"])
        .eq("details->>work_date", day)
        .order("created_at")
        .order("id")
        .range((page - 1) * 20, page * 20 - 1),
      supabase.from("rooms").select("*").order("code"),
      supabase.from("profiles").select("id,full_name").eq("role", "idol"),
      supabase.from("platform_accounts").select("idol_id,username"),
      supabase.from("company_settings").select("opening_hour,closing_hour").single(),
      supabase
        .from("idol_assignments")
        .select("idol_id,operator_id")
        .lte("starts_at", new Date().toISOString())
        .is("ends_at", null),
      supabase
        .from("live_sessions")
        .select("id,idol_id")
        .gte("starts_at", `${day}T00:00:00+07:00`)
        .lt("starts_at", `${addDays(day, 1)}T00:00:00+07:00`)
        .in("status", ["approved", "completed"]),
      supabase.rpc("trial_live_calendar", { first_day: day, last_day: day }),
    ]);

  const selected = requests.data?.find(r => r.id === params.request) ?? requests.data?.[0];
  const sessionIds = (sessions.data ?? []).map(s => s.id);

  const [free, segments] = await Promise.all([
    supabase.rpc("room_availability_grid", {
      day,
      exclude_plan: selected?.daily_plan_id ?? null,
    }),
    sessionIds.length
      ? supabase
          .from("room_segments")
          .select("session_id,room_id,starts_at,ends_at")
          .in("session_id", sessionIds)
          .in("status", ["approved", "completed"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  const names = new Map((people.data ?? []).map(p => [p.id, p.full_name]));
  const usernames = new Map((accounts.data ?? []).map(a => [a.idol_id, a.username]));
  const idolLabel = (idolId: string) => `${names.get(idolId) ?? "Idol"}${usernames.get(idolId) ? ` · @${usernames.get(idolId)}` : ""}`;
  const sessionNames = new Map((sessions.data ?? []).map(s => [s.id, idolLabel(s.idol_id)]));

  const bookings = (segments.data ?? []).flatMap(segment =>
    Array.from({ length: 24 }, (_, hour) => hour)
      .filter(hour => {
        const start = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+07:00`).getTime();
        return (
          new Date(segment.starts_at).getTime() < start + 3600000 &&
          new Date(segment.ends_at).getTime() > start
        );
      })
      .map(hour => ({
        room_id: segment.room_id,
        hour,
        label: sessionNames.get(segment.session_id) ?? "Idol",
      }))
  ).concat((trials.data ?? []).filter(t => t.status === "approved").flatMap(t =>
    [t.start_hour, t.start_hour + 1].map(hour => ({ room_id: t.room_id, hour, label: `Test live · ${t.display_name}` }))));

  const manager =
    assignments.data?.find(a => a.idol_id === selected?.subject_idol_id)?.operator_id ??
    profile.id;
  const base = `/${role}/schedule/board`;
  const failed =
    requests.error ||
    rooms.error ||
    people.error ||
    accounts.error ||
    settings.error ||
    assignments.error ||
    free.error ||
    sessions.error ||
    segments.error;

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <Link href={`/${role}/schedule?date=${day}`} className="back-link">
          ← Quay lại Lịch tuần & Danh sách yêu cầu
        </Link>
        <span className="eyebrow">ĐIỀU PHỐI PHÒNG LIVE THEO GIỜ</span>
        <h1>Ma trận & Xếp phòng trực tiếp</h1>
        <p className="muted">
          Xem trực quan phòng trống theo từng khung giờ, gán phòng 1-click hoặc áp dụng thuật toán tự động tối ưu.
        </p>
      </section>

      {/* Date Switcher Bar */}
      <div className="board-date-navigator">
        <div className="nav-buttons-group">
          {prevDay >= today ? (
            <Link className="btn secondary btn-compact" href={`${base}?date=${prevDay}`}>
              ← Ngày trước
            </Link>
          ) : (
            <span className="btn secondary btn-compact is-disabled">← Ngày trước</span>
          )}

          <div className="current-date-badge">
            <span className="date-main-text">{formatDayVi(day)}</span>
            {day === today && <span className="badge-today-pill">Hôm nay</span>}
          </div>

          <Link className="btn secondary btn-compact" href={`${base}?date=${nextDay}`}>
            Ngày sau →
          </Link>
        </div>

        <form method="get" className="date-picker-inline">
          <label htmlFor="board-date-input" className="sr-only">
            Chọn ngày điều phối
          </label>
          <input
            id="board-date-input"
            name="date"
            type="date"
            min={today}
            max={addDays(today, 90)}
            defaultValue={day}
            required
            className="input-date-control"
          />
          <button className="btn secondary btn-compact">Chuyển ngày</button>
        </form>
      </div>

      {trials.error && <p className="feedback error" role="alert">Chưa tải được nhãn lịch test. Kiểm tra kết nối và migration SQL 024.</p>}
      {failed ? (
        <section className="surface" role="alert">
          <div className="feedback error">
            Chưa tải đủ dữ liệu phòng và lịch live. Vui lòng kiểm tra kết nối SQL và tải lại trang.
          </div>
        </section>
      ) : (
        <>
          {/* Pending Queue Section */}
          <section className="surface board-queue-section">
            <div className="queue-section-header">
              <div className="queue-title-row">
                <h2>Yêu cầu đang chờ xử lý</h2>
                <span className="queue-counter-badge">
                  {requests.count ?? 0} yêu cầu
                </span>
              </div>
              <p className="muted text-sm">
                Chọn một Idol trong hàng đợi bên dưới để xem khung giờ họ đăng ký và xếp phòng.
              </p>
            </div>

            {requests.data && requests.data.length > 0 ? (
              <div className="board-queue-grid">
                {requests.data.map(r => {
                  const idolName = idolLabel(r.subject_idol_id);
                  const isSelected = r.id === selected?.id;
                  const isCancel = r.kind === "schedule_cancel";
                  const shiftsText = isCancel
                    ? "Xin hủy ca"
                    : (r.details?.shifts ?? [])
                        .map((s: { start_hour: number; end_hour: number }) => `${s.start_hour}h–${s.end_hour}h`)
                        .join(" / ");
                  const needsBorrowApproval = Boolean(r.details?.prepared_by);

                  return (
                    <Link
                      key={r.id}
                      href={`${base}?date=${day}&request=${r.id}&page=${page}`}
                      className={`board-queue-card ${isSelected ? "queue-card-selected" : ""} ${isCancel ? "queue-card-cancel" : ""}`}
                      aria-current={isSelected ? "page" : undefined}
                    >
                      <div className="queue-card-top">
                        <div className="initial-avatar-sm">
                          {idolName.charAt(0).toUpperCase()}
                        </div>
                        <div className="queue-card-meta">
                          <strong className="queue-idol-name">{idolName}</strong>
                          <span className={`queue-kind-tag ${isCancel ? "tag-cancel" : "tag-schedule"}`}>
                            {isCancel ? "Hủy ngày" : r.kind === "schedule_change" ? "Đổi lịch" : "Đăng ký mới"}
                          </span>
                        </div>
                      </div>

                      <div className="queue-card-shifts">
                        <span className="shifts-time-badge">{shiftsText}</span>
                      </div>

                      {needsBorrowApproval && (
                        <div className="queue-borrow-badge">
                          ⚠️ Chờ duyệt mượn phòng
                        </div>
                      )}

                      {isSelected && (
                        <div className="queue-card-active-indicator">
                          <span>Đang xếp phòng</span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="empty-queue-notice">
                <span className="empty-icon">✓</span>
                <div>
                  <strong>Không có yêu cầu nào đang chờ xử lý</strong>
                  <p className="muted text-sm">
                    Tất cả các phiên live của ngày {day} đã được xếp phòng và duyệt. Bạn vẫn có thể xem tổng quan ma trận phòng bên dưới.
                  </p>
                </div>
              </div>
            )}

            {/* Pagination */}
            {(requests.count ?? 0) > 20 && (
              <nav className="pagination">
                <span>
                  Trang {page} / {Math.ceil((requests.count ?? 0) / 20)}
                </span>
                <div className="pagination-buttons">
                  {page > 1 && (
                    <Link
                      className="btn secondary btn-compact"
                      href={`${base}?date=${day}&page=${page - 1}`}
                    >
                      ← Trang trước
                    </Link>
                  )}
                  {page * 20 < (requests.count ?? 0) && (
                    <Link
                      className="btn secondary btn-compact"
                      href={`${base}?date=${day}&page=${page + 1}`}
                    >
                      Trang sau →
                    </Link>
                  )}
                </div>
              </nav>
            )}
          </section>

          {/* Matrix & Planner Workspace */}
          <section className="surface board-workspace-section">
            {selected ? (
              <div className="selected-planner-wrap">
                <div className="planner-target-banner">
                  <div className="target-banner-info">
                    <span className="target-eyebrow">ĐANG XẾP PHÒNG CHO IDOL</span>
                    <h2 className="target-title">
                      {idolLabel(selected.subject_idol_id)}
                    </h2>
                    <div className="target-details-row">
                      <span className="target-tag">Ngày: {day}</span>
                      <span className="target-tag">
                        {selected.kind === "schedule_cancel"
                          ? "Yêu cầu: Xin hủy ca"
                          : `Ca đăng ký: ${(selected.details?.shifts ?? []).map((s: { start_hour: number; end_hour: number }) => `${s.start_hour}:00–${s.end_hour}:00`).join(" & ")}`}
                      </span>
                    </div>
                  </div>
                </div>

                <RoomPlanner
                  key={`${selected.id}:${selected.revision}`}
                  reviewerRole={role}
                  request={selected}
                  rooms={rooms.data ?? []}
                  available={free.data ?? []}
                  bookings={bookings}
                  managerId={manager}
                  opening={settings.data!.opening_hour}
                  closing={settings.data!.closing_hour}
                />

                <div className="board-reject-box">
                  <div className="reject-header">
                    <h3>Từ chối yêu cầu này</h3>
                    <p className="muted text-sm">
                      Nếu không thể sắp xếp phòng phù hợp hoặc ca live không đạt yêu cầu, nhập lý do và bấm Từ chối để trả lại cho Idol.
                    </p>
                  </div>
                  <DecisionForm id={selected.id} revision={selected.revision} />
                </div>
              </div>
            ) : (
              <div className="full-matrix-overview">
                <div className="matrix-overview-header">
                  <h2>Tổng quan ma trận phòng ngày {day}</h2>
                  <p className="muted text-sm">
                    Khung giờ hoạt động từ {settings.data?.opening_hour ?? 9}h đến {settings.data?.closing_hour ?? 24}h.
                  </p>
                </div>
                <RoomMatrix
                  rooms={rooms.data ?? []}
                  available={free.data ?? []}
                  bookings={bookings}
                  managerId={manager}
                  opening={settings.data!.opening_hour}
                  closing={settings.data!.closing_hour}
                />
              </div>
            )}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
