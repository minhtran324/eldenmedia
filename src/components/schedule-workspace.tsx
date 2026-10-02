import { LatePermissionInbox } from "./late-permission-inbox";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth/server";
import { addDays, validDate, vietnamToday, weekStart } from "@/lib/scheduling";
import { WorkspaceShell } from "./workspace-shell";
import { DecisionForm, RoomPlanner } from "./schedule-forms";
import { ScheduleClientView } from "./schedule-client-view";
import type { Role } from "@/types/database";

const statusLabels: Record<string, string> = {
  pending: "Chờ xử lý",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  cancelled: "Đã hủy",
  expired: "Hết hiệu lực",
  completed: "Hoàn tất",
  draft: "Nháp",
  submitted: "Đã gửi",
};

const requestLabels: Record<string, string> = {
  schedule: "Đăng ký lịch",
  schedule_change: "Đổi lịch",
  schedule_cancel: "Hủy ngày",
};

export async function ScheduleWorkspace({
  role,
  params,
}: {
  role: Role;
  params: { date?: string; page?: string; borrowPage?: string; tab?: string };
}) {
  const { supabase, profile } = await requireActive(role);
  // eslint-disable-next-line react-hooks/purity -- Serialize one authenticated request timestamp for consistent client hydration.
  const serverNow = Date.now();
  const today = vietnamToday();
  const selected = params.date && validDate(params.date) ? params.date : today;
  const start = weekStart(selected);
  const end = addDays(start, 6);
  const next = addDays(start, 7);
  const previous = addDays(start, -7);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1", 10) || 1));
  const borrowPage = Math.max(1, Math.min(10000, Number.parseInt(params.borrowPage ?? "1", 10) || 1));
  const base = `/${role}/schedule`;

  const [plansResult, requestsResult, idolsResult, accountsResult, roomsResult, settingsResult, inboxResult, trialsResult] =
    await Promise.all([
      supabase
        .from("daily_plans")
        .select("id,idol_id,work_date,shift_count,status,version")
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date"),
      supabase
        .from("requests")
        .select(
          "id,kind,status,subject_idol_id,daily_plan_id,revision,created_at,decision_reason,details",
          { count: "exact" }
        )
        .in("kind", ["schedule", "schedule_change", "schedule_cancel"])
        .gte("details->>work_date", start)
        .lte("details->>work_date", end)
        .order("created_at", { ascending: false })
        .range((page - 1) * 30, page * 30 - 1),
      supabase.from("profiles").select("id,full_name,status").eq("role", "idol").order("full_name"),
      supabase.from("platform_accounts").select("idol_id,username").order("username"),
      supabase.from("rooms").select("id,code,name").order("code"),
      supabase.from("company_settings").select("opening_hour,closing_hour").single(),
      role === "idol"
        ? Promise.resolve({ data: [], error: null, count: 0 })
        : supabase.rpc("room_borrow_inbox", {}, { count: "exact" }).range((borrowPage - 1) * 30, borrowPage * 30 - 1),
      role === "idol" ? Promise.resolve({ data: [], error: null }) : supabase.rpc("trial_live_calendar", { first_day: start, last_day: end }),
    ]);

  const plans = plansResult.data ?? [];
  const ids = plans.map(p => p.id);

  const sessionsResult = ids.length
    ? await supabase
        .from("live_sessions")
        .select("id,idol_id,daily_plan_id,starts_at,ends_at,status")
        .in("daily_plan_id", ids)
        .neq("status", "cancelled")
        .order("starts_at")
    : { data: [], error: null };
  const sessions = sessionsResult.data ?? [];

  const segmentBatches = await Promise.all(
    Array.from({ length: Math.ceil(sessions.length / 100) }, (_, i) =>
      supabase
        .from("room_segments")
        .select("id,session_id,room_id,starts_at,ends_at,status")
        .in(
          "session_id",
          sessions.slice(i * 100, (i + 1) * 100).map(s => s.id)
        )
        .neq("status", "cancelled")
        .order("starts_at")
    )
  );

  const segmentsResult = {
    data: segmentBatches.flatMap(batch => batch.data ?? []),
    error: segmentBatches.find(batch => batch.error)?.error,
  };

  const unavailable =
    plansResult.error ||
    requestsResult.error ||
    idolsResult.error ||
    accountsResult.error ||
    roomsResult.error ||
    settingsResult.error ||
    inboxResult.error ||
    sessionsResult.error ||
    segmentsResult.error;

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag">
          <span>📅</span>
          <span>ĐIỀU HÀNH LỊCH LIVE</span>
        </div>
        <h1>
          Lịch live {role === "idol" ? "cá nhân của bạn" : role === "admin" ? "toàn công ty" : "team của bạn"}
        </h1>
        <p>Idol chính thức: 1 hoặc 2 ca, tổng đúng 5 tiếng/ngày · Test live: 2 tiếng/ngày, tối đa 5 ngày · Giờ Việt Nam</p>
      </section>

      {/* Operator Quick Tools */}
      {role !== "idol" && (
        <div className="schedule-operator-bar">
          <Link className="btn primary" href={`/${role}/schedule/board?date=${selected}`}>
            <span>📊 Mở ma trận điều phối phòng live</span>
          </Link>
          <Link className="btn secondary" href={`/${role}/schedule/trials`}>Đăng ký test live</Link>
          <LatePermissionInbox />
        </div>
      )}

      {trialsResult.error && role !== "idol" && <p className="feedback error" role="alert">Chưa tải được lịch test live. Kiểm tra kết nối và migration SQL 024; lịch chính thức vẫn hiển thị bên dưới.</p>}
      {unavailable ? (
        <section className="surface error-box" role="alert">
          <h2>Chưa tải được lịch làm việc</h2>
          <p>Kiểm tra kết nối và chắc chắn đã chạy migration SQL 007 trên Supabase.</p>
          <Link className="btn secondary" href={base}>
            Tải lại trang
          </Link>
        </section>
      ) : (
        <ScheduleClientView
          role={role}
          profile={profile}
          initialTab={params.tab}
          selected={selected}
          today={today}
          start={start}
          end={end}
          next={next}
          previous={previous}
          base={base}
          plans={plans}
          sessions={sessions}
          segments={segmentsResult.data ?? []}
          requests={requestsResult.data ?? []}
          requestsCount={requestsResult.count ?? 0}
          idols={idolsResult.data ?? []}
          accounts={accountsResult.data ?? []}
          rooms={roomsResult.data ?? []}
          settings={settingsResult.data!}
          inbox={inboxResult.data ?? []}
          inboxCount={inboxResult.count ?? 0}
          page={page}
          borrowPage={borrowPage}
          trials={trialsResult.data ?? []}
          serverNow={serverNow}
        />
      )}
    </WorkspaceShell>
  );
}

export async function ScheduleRequestWorkspace({
  role,
  id,
}: {
  role: "admin" | "operator";
  id: string;
}) {
  const { profile, supabase } = await requireActive(role);
  const { data: request, error } = await supabase
    .from("requests")
    .select(
      "id,kind,status,subject_idol_id,daily_plan_id,revision,created_at,decision_reason,details"
    )
    .eq("id", id)
    .in("kind", ["schedule", "schedule_change", "schedule_cancel"])
    .maybeSingle();

  if (
    error ||
    !request ||
    !validDate(request.details.work_date) ||
    !Array.isArray(request.details.shifts)
  )
    notFound();

  const [roomsResult, freeResult, assignmentResult, idolResult, accountResult, settingsResult] = await Promise.all([
    supabase.from("rooms").select("*").order("code"),
    request.kind === "schedule_cancel"
      ? Promise.resolve({ data: [], error: null })
      : supabase.rpc("room_availability_grid", {
          day: request.details.work_date,
          exclude_plan: request.daily_plan_id,
        }),
    supabase
      .from("idol_assignments")
      .select("operator_id")
      .eq("idol_id", request.subject_idol_id)
      .lte("starts_at", new Date().toISOString())
      .is("ends_at", null)
      .maybeSingle(),
    supabase.from("profiles").select("full_name").eq("id", request.subject_idol_id).maybeSingle(),
    supabase.from("platform_accounts").select("username").eq("idol_id", request.subject_idol_id).maybeSingle(),
    supabase.from("company_settings").select("opening_hour,closing_hour").single(),
  ]);

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <Link href={`/${role}/schedule?date=${request.details.work_date}`} className="btn secondary btn-compact">
          ← Trở về Lịch tuần
        </Link>
        <div className="heading-tag" style={{ marginTop: "12px" }}>
          <span>🏢</span>
          <span>XẾP PHÒNG & PHÊ DUYỆT</span>
        </div>
        <h1>
          {idolResult.data?.full_name || "Idol"}{accountResult.data?.username ? ` · @${accountResult.data.username}` : ""} · {request.details.work_date}
        </h1>
        <p>
          {requestLabels[request.kind]} ·{" "}
          {request.details.shifts.map((s: { start_hour: number; end_hour: number }) => `${s.start_hour}:00–${s.end_hour}:00`).join(" / ")}
        </p>
        {request.details.reason && <p className="hint">Ghi chú từ Idol: {request.details.reason}</p>}
      </section>

      {request.status !== "pending" ? (
        <section className="surface">
          <h2>Yêu cầu đã được xử lý</h2>
          <p className="role-pill">{statusLabels[request.status]}</p>
        </section>
      ) : (
        <>
          <section className="surface planner-surface-wrap">
            <h2>Phương án xếp phòng</h2>
            {roomsResult.error || freeResult.error || assignmentResult.error || accountResult.error || settingsResult.error ? (
              <p className="hint text-error" role="alert">
                Chưa lấy được phòng trống. Dữ liệu có thể đã thay đổi. Vui lòng tải lại trang.
              </p>
            ) : (
              <RoomPlanner
                key={request.revision}
                request={request}
                rooms={roomsResult.data ?? []}
                available={freeResult.data ?? []}
                managerId={assignmentResult.data?.operator_id ?? profile.id}
                opening={settingsResult.data!.opening_hour}
                closing={settingsResult.data!.closing_hour}
                reviewerRole={role}
              />
            )}
          </section>

          <section className="surface reject-surface-wrap">
            <h2>Từ chối yêu cầu</h2>
            <DecisionForm id={request.id} revision={request.revision} />
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
