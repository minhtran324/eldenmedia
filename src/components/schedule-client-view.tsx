"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { addDays, localTime } from "@/lib/scheduling";
import { ScheduleActions } from "./schedule-forms";
import { DecisionForm } from "./schedule-forms";
import { TrialLiveCalendar } from "./trial-live-calendar";
import type { TrialBooking } from "@/lib/trial-live";
import type { Role, DayPlan, LiveSession, RoomSegment, ScheduleRequest, Profile } from "@/types/database";

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ duyệt",
  approved: "Đã xếp phòng",
  rejected: "Bị từ chối",
  cancelled: "Đã hủy",
  completed: "Hoàn tất",
  draft: "Nháp",
  submitted: "Đã gửi",
};

const STATUS_COLORS: Record<string, string> = {
  approved: "status-approved",
  pending: "status-pending",
  rejected: "status-rejected",
  cancelled: "status-cancelled",
  completed: "status-completed",
};

const REQUEST_KIND_LABELS: Record<string, string> = {
  schedule: "Đăng ký lịch",
  schedule_change: "Đổi lịch",
  schedule_cancel: "Xin hủy ngày",
};

const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WEEKDAY_FULL = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScheduleRoomItem = { id: string; code: string; name: string };
export type ScheduleIdolItem = { id: string; full_name: string; status: string };
export type ScheduleBorrowInboxItem = {
  id: string;
  room_code: string;
  work_date: string;
  hours: number[];
  revision: number;
};

export type ScheduleClientProps = {
  serverNow: number;
  trials?: TrialBooking[];
  role: Role;
  profile: Profile;
  initialTab?: string;
  selected: string;
  today: string;
  start: string;
  end: string;
  next: string;
  previous: string;
  base: string;
  plans: DayPlan[];
  sessions: LiveSession[];
  segments: RoomSegment[];
  requests: ScheduleRequest[];
  requestsCount: number;
  idols: ScheduleIdolItem[];
  accounts: { idol_id: string; username: string | null }[];
  rooms: ScheduleRoomItem[];
  settings: { opening_hour: number; closing_hour: number };
  inbox: ScheduleBorrowInboxItem[];
  inboxCount: number;
  page: number;
  borrowPage: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDay(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return {
    weekdayShort: WEEKDAY_SHORT[d.getUTCDay()],
    weekdayFull: WEEKDAY_FULL[d.getUTCDay()],
    dayNum: String(d.getUTCDate()).padStart(2, "0"),
    monthNum: String(d.getUTCMonth() + 1).padStart(2, "0"),
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScheduleClientView({
  role,
  trials = [],
  serverNow,
  profile,
  initialTab = "week",
  selected,
  today,
  start,
  end,
  next,
  previous,
  base,
  plans,
  sessions,
  segments,
  requests,
  requestsCount,
  idols,
  accounts,
  rooms,
  settings,
  inbox,
  inboxCount,
  page,
  borrowPage,
}: ScheduleClientProps) {
  const isIdol = role === "idol";
  const validTabs = isIdol ? ["week", "register", "requests"] : ["week", "create", "requests", "borrow"];

  const [activeTab, setActiveTab] = useState<string>(() =>
    validTabs.includes(initialTab) ? initialTab : "week"
  );
  const [viewMode, setViewMode] = useState<"roster" | "room" | "classic">("roster");
  const [searchQuery, setSearchQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "pending">("all");
  const [activeMobileDay, setActiveMobileDay] = useState<string>(() =>
    selected >= start && selected <= end ? selected : today >= start && today <= end ? today : start
  );

  // States for requests tab
  const [reqSearch, setReqSearch] = useState("");
  const [reqStatusFilter, setReqStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [expandedReqIdols, setExpandedReqIdols] = useState<Set<string>>(() => new Set());

  const toggleReqIdol = (idolId: string) => {
    setExpandedReqIdols((prev) => {
      const next = new Set(prev);
      if (next.has(idolId)) next.delete(idolId);
      else next.add(idolId);
      return next;
    });
  };

  const switchTab = (key: string) => {
    setActiveTab(key);
    window.history.replaceState(null, "", `${base}?date=${selected}&tab=${key}`);
  };

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // ── Maps ──
  const idolInfoMap = useMemo(() => {
    const m = new Map<string, { name: string; username?: string }>();
    idols.forEach(idol => {
      const acc = accounts.find(a => a.idol_id === idol.id);
      m.set(idol.id, { name: idol.full_name || "Idol", username: acc?.username ?? undefined });
    });
    return m;
  }, [idols, accounts]);

  const roomMap = useMemo(() => new Map(rooms.map(r => [r.id, r])), [rooms]);

  const planDetailsMap = useMemo(() => {
    const m = new Map<string, { sessions: { session: LiveSession; rooms: ScheduleRoomItem[] }[] }>();
    plans.forEach(p => {
      const planSessions = sessions.filter(s => s.daily_plan_id === p.id);
      m.set(p.id, {
        sessions: planSessions.map(s => ({
          session: s,
          rooms: segments
            .filter(g => g.session_id === s.id)
            .map(g => roomMap.get(g.room_id))
            .filter(Boolean) as ScheduleRoomItem[],
        })),
      });
    });
    return m;
  }, [plans, sessions, segments, roomMap]);

  // ── Filtered data ──
  const myPlans = useMemo(
    () => plans.filter(p => p.status !== "cancelled" && (isIdol ? p.idol_id === profile.id : true)),
    [plans, isIdol, profile.id]
  );

  const filteredPlans = useMemo(() => {
    let list = myPlans;
    if (!isIdol) {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        list = list.filter(p => {
          const info = idolInfoMap.get(p.idol_id);
          return info?.name.toLowerCase().includes(q) || info?.username?.toLowerCase().includes(q);
        });
      }
      if (roomFilter !== "all") {
        list = list.filter(p =>
          planDetailsMap.get(p.id)?.sessions.some(s => s.rooms.some(r => r.id === roomFilter))
        );
      }
      if (statusFilter !== "all") list = list.filter(p => p.status === statusFilter);
    }
    return list;
  }, [myPlans, isIdol, searchQuery, roomFilter, statusFilter, idolInfoMap, planDetailsMap]);

  const visibleIdols = useMemo(() => {
    let list = idols.filter(i => i.status === "active");
    if (!isIdol && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => {
        const acc = accounts.find(a => a.idol_id === i.id);
        return i.full_name?.toLowerCase().includes(q) || acc?.username?.toLowerCase().includes(q);
      });
    }
    return list;
  }, [idols, isIdol, searchQuery, accounts]);

  const kpi = useMemo(() => ({
    totalPlans: filteredPlans.length,
    idolsWithPlans: new Set(filteredPlans.map(p => p.idol_id)).size,
    pendingCount: filteredPlans.filter(p => p.status === "pending").length,
  }), [filteredPlans]);

  // Group requests by Idol for Operator/Admin (and Idol)
  const groupedRequests = useMemo(() => {
    const map = new Map<
      string,
      {
        idolId: string;
        idolName: string;
        username?: string;
        pendingCount: number;
        approvedCount: number;
        rejectedCount: number;
        totalCount: number;
        requests: ScheduleRequest[];
      }
    >();

    for (const r of requests) {
      if (reqStatusFilter !== "all" && r.status !== reqStatusFilter) continue;

      const info = idolInfoMap.get(r.subject_idol_id);
      const idolName = info?.name || "Idol";
      const username = info?.username;

      if (reqSearch.trim()) {
        const q = reqSearch.toLowerCase().trim();
        const matches =
          idolName.toLowerCase().includes(q) ||
          (username && username.toLowerCase().includes(q)) ||
          (r.details.work_date && r.details.work_date.includes(q)) ||
          (r.details.reason && r.details.reason.toLowerCase().includes(q));
        if (!matches) continue;
      }

      const existing = map.get(r.subject_idol_id);
      if (!existing) {
        map.set(r.subject_idol_id, {
          idolId: r.subject_idol_id,
          idolName,
          username,
          pendingCount: r.status === "pending" ? 1 : 0,
          approvedCount: r.status === "approved" ? 1 : 0,
          rejectedCount: r.status === "rejected" ? 1 : 0,
          totalCount: 1,
          requests: [r],
        });
      } else {
        existing.requests.push(r);
        existing.totalCount += 1;
        if (r.status === "pending") existing.pendingCount += 1;
        if (r.status === "approved") existing.approvedCount += 1;
        if (r.status === "rejected") existing.rejectedCount += 1;
      }
    }

    // Sort: Idols with pending requests come first!
    const list = Array.from(map.values()).sort((a, b) => {
      if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
      if (a.pendingCount === 0 && b.pendingCount > 0) return 1;
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      return a.idolName.localeCompare(b.idolName, "vi");
    });

    for (const item of list) {
      item.requests.sort((a, b) => (a.details.work_date || "").localeCompare(b.details.work_date || ""));
    }

    return list;
  }, [requests, reqStatusFilter, reqSearch, idolInfoMap]);

  // ── Tab config ──
  const tabs = isIdol
    ? [
        { key: "week",     label: "Lịch tuần",    icon: "📅" },
        { key: "register", label: "Đăng ký",       icon: "✏️" },
        { key: "requests", label: "Yêu cầu",       icon: "📋", count: requestsCount },
      ]
    : [
        { key: "week",     label: "Lịch tuần",     icon: "📅" },
        { key: "create",   label: "Tạo lịch",      icon: "✏️" },
        { key: "requests", label: "Yêu cầu",        icon: "📋", count: requestsCount },
        { key: "borrow",   label: "Mượn phòng",    icon: "🏢", count: inboxCount },
      ];

  return (
    <div className="scv-root">
      {/* ── Week Navigator ── */}
      <div className="scv-week-nav">
        <div className="scv-week-nav-left">
          <Link className="scv-nav-btn" href={`${base}?date=${previous}&tab=${activeTab}`}>
            ← Trước
          </Link>

          <div className="scv-week-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>{start}</span>
            <span className="scv-week-sep">—</span>
            <span>{end}</span>
          </div>

          <Link className="scv-nav-btn" href={`${base}?date=${next}&tab=${activeTab}`}>
            Sau →
          </Link>
          <Link className="scv-nav-btn scv-nav-today" href={`${base}?date=${today}&tab=${activeTab}`}>
            Hôm nay
          </Link>
        </div>

        <form method="get" className="scv-datepicker-form">
          <input type="hidden" name="tab" value={activeTab} />
          <input
            type="date"
            name="date"
            defaultValue={selected}
            required
            className="scv-date-input"
            aria-label="Chọn ngày trong tuần"
          />
          <button className="scv-nav-btn" type="submit">Xem</button>
        </form>
      </div>

      {/* ── Tab Bar ── */}
      <div className="scv-tab-bar" role="tablist" aria-label="Điều hướng lịch live">
        {tabs.map(t => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={activeTab === t.key}
            className={`scv-tab${activeTab === t.key ? " scv-tab--active" : ""}`}
            onClick={() => switchTab(t.key)}
          >
            <span className="scv-tab-icon">{t.icon}</span>
            <span className="scv-tab-label">{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span className="scv-tab-badge">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          TAB: week
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "week" && (
        <div className="scv-panel" role="tabpanel">
          {!isIdol && <TrialLiveCalendar records={trials} role={role as "admin" | "operator"} currentUserId={profile.id} serverNow={serverNow} title="Test live trong tuần" />}

          {/* ── IDOL personal view ── */}
          {isIdol ? (
            <div className="scv-idol-board">
              {/* Summary strip */}
              <div className="scv-idol-summary">
                <div className="scv-summary-stat">
                  <strong>{myPlans.length}</strong>
                  <span>ngày live</span>
                </div>
                <div className="scv-summary-divider" />
                <div className="scv-summary-stat">
                  <strong>{myPlans.length * 5}</strong>
                  <span>giờ phát sóng</span>
                </div>
                <div className="scv-summary-divider" />
                <div className="scv-summary-stat">
                  <strong>{7 - myPlans.length}</strong>
                  <span>ngày nghỉ</span>
                </div>
              </div>

              {/* Mobile day selector */}
              <div className="scv-day-pills" aria-label="Chọn ngày xem">
                {weekDays.map(day => {
                  const { weekdayShort, dayNum } = parseDay(day);
                  const hasPlan = myPlans.some(p => p.work_date === day);
                  return (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={day === activeMobileDay}
                      className={[
                        "scv-day-pill",
                        day === today ? "scv-day-pill--today" : "",
                        day === activeMobileDay ? "scv-day-pill--active" : "",
                        hasPlan ? "scv-day-pill--has-plan" : "",
                      ].join(" ")}
                      onClick={() => setActiveMobileDay(day)}
                    >
                      <span className="pill-abbr">{weekdayShort}</span>
                      <strong className="pill-num">{dayNum}</strong>
                      <span className="pill-dot" />
                    </button>
                  );
                })}
              </div>

              {/* 7-day agenda cards */}
              <div className="scv-agenda-grid">
                {weekDays.map(day => {
                  const { weekdayFull, dayNum, monthNum } = parseDay(day);
                  const plan = myPlans.find(p => p.work_date === day);
                  const details = plan ? planDetailsMap.get(plan.id) : null;
                  const isToday = day === today;
                  const isMobileActive = day === activeMobileDay;

                  return (
                    <article
                      key={day}
                      className={[
                        "scv-agenda-card",
                        isToday ? "scv-agenda-card--today" : "",
                        plan ? "scv-agenda-card--work" : "scv-agenda-card--off",
                        isMobileActive ? "scv-agenda-card--mobile-active" : "",
                      ].join(" ")}
                    >
                      {/* Card header */}
                      <div className="agenda-card-head">
                        <div>
                          <span className="agenda-weekday">{weekdayFull}</span>
                          <span className="agenda-date">{dayNum}/{monthNum}</span>
                        </div>
                        {isToday && <span className="agenda-today-tag">Hôm nay</span>}
                      </div>

                      {/* Card body */}
                      {plan ? (
                        <div className="agenda-card-body">
                          <span className={`agenda-status-chip ${STATUS_COLORS[plan.status] || ""}`}>
                            {STATUS_LABELS[plan.status] || plan.status}
                          </span>

                          <div className="agenda-sessions">
                            {details?.sessions && details.sessions.length > 0 ? (
                              details.sessions.map(({ session, rooms: sr }) => (
                                <div key={session.id} className="agenda-session">
                                  <div className="agenda-session-time">
                                    <span className="session-time-icon">🕐</span>
                                    <strong>{localTime(session.starts_at)} – {localTime(session.ends_at)}</strong>
                                  </div>
                                  <div className="agenda-session-room">
                                    <span className="session-room-icon">🏢</span>
                                    <span>
                                      {sr.length > 0 ? sr.map(r => r.code).join(", ") : (
                                        <em className="room-pending-text">Chờ xếp phòng</em>
                                      )}
                                    </span>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="agenda-no-session">Chưa có ca live nào được ghi nhận.</p>
                            )}
                          </div>

                          {day >= today && (
                            <button
                              type="button"
                              className="agenda-change-btn"
                              onClick={() => switchTab("register")}
                            >
                              Đổi ca / Hủy lịch →
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="agenda-card-off">
                          <span className="off-emoji">{day < today ? "⌛" : "🌿"}</span>
                          <span className="off-label">{day < today ? "Không có ca" : "Ngày nghỉ"}</span>
                          {day >= today && (
                            <button
                              type="button"
                              className="agenda-register-btn"
                              onClick={() => switchTab("register")}
                            >
                              + Đăng ký live
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            /* ── OPERATOR / ADMIN view ── */
            <div className="scv-operator-board">
              {/* Toolbar */}
              <div className="scv-op-toolbar">
                <div className="scv-op-search-wrap">
                  <svg className="scv-search-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Tìm Idol theo tên hoặc @tiktok…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="scv-op-search"
                    aria-label="Tìm kiếm Idol"
                  />
                  {searchQuery && (
                    <button type="button" className="scv-search-clear" onClick={() => setSearchQuery("")} aria-label="Xóa tìm kiếm">✕</button>
                  )}
                </div>

                <div className="scv-op-filters">
                  <select
                    value={roomFilter}
                    onChange={e => setRoomFilter(e.target.value)}
                    className="scv-filter-select"
                    aria-label="Lọc theo phòng"
                  >
                    <option value="all">Tất cả phòng</option>
                    {rooms.map(r => (
                      <option key={r.id} value={r.id}>{r.code} — {r.name}</option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value as "all" | "approved" | "pending")}
                    className="scv-filter-select"
                    aria-label="Lọc theo trạng thái"
                  >
                    <option value="all">Mọi trạng thái</option>
                    <option value="approved">Đã xếp phòng</option>
                    <option value="pending">Đang chờ duyệt</option>
                  </select>
                </div>

                <div className="scv-view-switcher" role="group" aria-label="Chế độ xem">
                  {(["roster", "room", "classic"] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      className={`scv-view-btn${viewMode === mode ? " scv-view-btn--active" : ""}`}
                      onClick={() => setViewMode(mode)}
                      aria-pressed={viewMode === mode}
                    >
                      {mode === "roster" ? "📋 Ma trận" : mode === "room" ? "🏢 Phòng" : "📅 7 ngày"}
                    </button>
                  ))}
                </div>
              </div>

              {/* KPI strip */}
              <div className="scv-kpi-strip">
                <div className="scv-kpi">
                  <strong className="kpi-val">{kpi.totalPlans}</strong>
                  <span className="kpi-lbl">Ca live tuần này</span>
                </div>
                <div className="scv-kpi-sep" />
                <div className="scv-kpi">
                  <strong className="kpi-val">{kpi.idolsWithPlans}<span className="kpi-of">/{visibleIdols.length}</span></strong>
                  <span className="kpi-lbl">Idol có lịch</span>
                </div>
                <div className="scv-kpi-sep" />
                <div className="scv-kpi">
                  <strong className={`kpi-val${kpi.pendingCount > 0 ? " kpi-alert" : ""}`}>{kpi.pendingCount}</strong>
                  <span className="kpi-lbl">Ca chờ duyệt</span>
                </div>
                <div className="scv-kpi-sep" />
                <div className="scv-kpi">
                  <strong className="kpi-val">{rooms.length}</strong>
                  <span className="kpi-lbl">Phòng live</span>
                </div>
              </div>

              {/* ── View: Roster Matrix ── */}
              {viewMode === "roster" && (
                <div className="scv-roster-wrap" tabIndex={0}>
                  <table className="scv-roster-table" aria-label="Ma trận phân ca Idol theo tuần">
                    <thead>
                      <tr>
                        <th scope="col" className="scv-col-sticky">
                          Idol ({visibleIdols.length})
                        </th>
                        {weekDays.map(day => {
                          const { weekdayShort, dayNum, monthNum } = parseDay(day);
                          const count = filteredPlans.filter(p => p.work_date === day).length;
                          return (
                            <th
                              key={day}
                              scope="col"
                              className={`scv-col-day${day === today ? " scv-col-day--today" : ""}`}
                            >
                              <span className="th-weekday">{weekdayShort}</span>
                              <span className="th-date">{dayNum}/{monthNum}</span>
                              {day === today && <span className="th-today-pip">●</span>}
                              <span className="th-count">{count} ca</span>
                            </th>
                          );
                        })}
                        <th scope="col" className="scv-col-total">Tổng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleIdols.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="scv-table-empty">
                            Không tìm thấy Idol nào phù hợp với bộ lọc.
                          </td>
                        </tr>
                      ) : visibleIdols.map(idol => {
                        const idolPlans = filteredPlans.filter(p => p.idol_id === idol.id);
                        const acc = accounts.find(a => a.idol_id === idol.id);
                        return (
                          <tr key={idol.id} className="scv-roster-row">
                            <th scope="row" className="scv-cell-idol">
                              <div className="scv-idol-cell">
                                <span className="scv-avatar">{idol.full_name?.charAt(0).toUpperCase() || "?"}</span>
                                <div className="scv-idol-cell-meta">
                                  <span className="scv-idol-name" title={idol.full_name}>{idol.full_name || "—"}</span>
                                  {acc?.username && <span className="scv-idol-handle">@{acc.username}</span>}
                                </div>
                              </div>
                            </th>
                            {weekDays.map(day => {
                              const plan = idolPlans.find(p => p.work_date === day);
                              const details = plan ? planDetailsMap.get(plan.id) : null;
                              return (
                                <td
                                  key={day}
                                  className={[
                                    "scv-cell-slot",
                                    day === today ? "scv-cell-slot--today" : "",
                                    plan ? `scv-cell-slot--${plan.status}` : "scv-cell-slot--off",
                                  ].join(" ")}
                                >
                                  {plan ? (
                                    <div className="scv-slot-chip">
                                      {details?.sessions && details.sessions.length > 0 ? (
                                        details.sessions.map(({ session, rooms: sr }, si) => (
                                          <div key={si} className="scv-chip-row">
                                            <span className="chip-time">
                                              {localTime(session.starts_at).slice(0, 5)}–{localTime(session.ends_at).slice(0, 5)}
                                            </span>
                                            {sr.length > 0 && (
                                              <span className="chip-room">{sr[0].code}</span>
                                            )}
                                          </div>
                                        ))
                                      ) : (
                                        <span className="chip-hours">5 tiếng</span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="scv-slot-dash" aria-label="Nghỉ">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="scv-cell-total">
                              <strong>{idolPlans.length}</strong>
                              <span>ca</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── View: Room-centric ── */}
              {viewMode === "room" && (
                <div className="scv-room-grid">
                  {rooms.length === 0 ? (
                    <p className="scv-empty-note">Chưa có phòng live nào được thiết lập.</p>
                  ) : rooms.map(room => {
                    const roomSessionCount = sessions.filter(s => {
                      const plan = plans.find(p => p.id === s.daily_plan_id);
                      if (!plan) return false;
                      return segments.some(g => g.session_id === s.id && g.room_id === room.id);
                    }).length;

                    return (
                      <div key={room.id} className="scv-room-card">
                        <div className="scv-room-head">
                          <div>
                            <strong className="scv-room-code">🏢 {room.code}</strong>
                            <span className="scv-room-name">{room.name}</span>
                          </div>
                          <span className="scv-room-count">{roomSessionCount} ca tuần này</span>
                        </div>

                        <div className="scv-room-days">
                          {weekDays.map(day => {
                            const { weekdayShort } = parseDay(day);
                            const isToday = day === today;
                            const dayBookings = sessions.filter(s => {
                              const plan = plans.find(p => p.id === s.daily_plan_id && p.work_date === day);
                              if (!plan) return false;
                              return segments.some(g => g.session_id === s.id && g.room_id === room.id);
                            });

                            return (
                              <div key={day} className={`scv-room-day${isToday ? " scv-room-day--today" : ""}`}>
                                <div className="room-day-label">
                                  <span>{weekdayShort}</span>
                                  <span className="room-day-count">{dayBookings.length}</span>
                                </div>
                                <div className="room-day-bookings">
                                  {dayBookings.length === 0 ? (
                                    <span className="room-day-free">Trống</span>
                                  ) : dayBookings.map(s => {
                                    const idolName = idolInfoMap.get(s.idol_id)?.name || "Idol";
                                    return (
                                      <div key={s.id} className="room-booking-item" title={`${idolName} — ${localTime(s.starts_at)}–${localTime(s.ends_at)}`}>
                                        <strong className="rb-idol">{idolName}</strong>
                                        <span className="rb-time">{localTime(s.starts_at).slice(0, 5)}–{localTime(s.ends_at).slice(0, 5)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── View: Classic 7-day columns ── */}
              {viewMode === "classic" && (
                <div className="scv-classic-grid">
                  {weekDays.map(day => {
                    const { weekdayShort, dayNum, monthNum } = parseDay(day);
                    const dayPlans = filteredPlans.filter(p => p.work_date === day);
                    const isToday = day === today;
                    return (
                      <div key={day} className={`scv-classic-col${isToday ? " scv-classic-col--today" : ""}`}>
                        <div className="classic-col-head">
                          <strong>{weekdayShort}</strong>
                          <span>{dayNum}/{monthNum}</span>
                          {isToday && <span className="classic-today-dot" />}
                        </div>
                        <div className="classic-col-body">
                          {dayPlans.length === 0 ? (
                            <div className="classic-empty">Nghỉ</div>
                          ) : dayPlans.map(plan => {
                            const details = planDetailsMap.get(plan.id);
                            const idolInfo = idolInfoMap.get(plan.idol_id);
                            return (
                              <article key={plan.id} className={`scv-classic-card scv-classic-card--${plan.status}`}>
                                <div className="classic-idol-name">{idolInfo?.name || "Idol"}</div>
                                {details?.sessions.map(({ session, rooms: sr }) => (
                                  <div key={session.id} className="classic-session">
                                    <span className="classic-time">{localTime(session.starts_at)}–{localTime(session.ends_at)}</span>
                                    {sr.length > 0 && <span className="classic-room">{sr[0].code}</span>}
                                  </div>
                                ))}
                                <span className={`classic-status ${STATUS_COLORS[plan.status] || ""}`}>
                                  {STATUS_LABELS[plan.status] || plan.status}
                                </span>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: register / create
      ══════════════════════════════════════════════════════════════════ */}
      {(activeTab === "register" || activeTab === "create") && (
        <div className="scv-panel" role="tabpanel">
          <div className="scv-form-header">
            <div>
              <h2 className="scv-form-title">
                {isIdol ? "Đăng ký & thao tác lịch live" : "Tạo & xử lý lịch cho Idol"}
              </h2>
              <p className="scv-form-hint">
                {isIdol
                  ? "Mỗi ngày làm tổng đúng 5 tiếng. Đổi hoặc hủy lịch phải thực hiện ít nhất 1 giờ trước ca."
                  : "Tạo lịch trực tiếp hoặc xử lý yêu cầu thay đổi của Idol trong team."}
              </p>
            </div>
            <button type="button" className="scv-view-week-btn" onClick={() => switchTab("week")}>
              ← Xem lịch tuần
            </button>
          </div>

          {!isIdol && <div className="trial-register-shortcut">
            <div><strong>Idol đang test live?</strong><p className="hint">Chỉ cần tên · 2 tiếng/ngày · Tối đa 5 ngày test.</p></div>
            <Link className="btn secondary" href={`/${role}/schedule/trials`}>Đăng ký test live</Link>
          </div>}
          <ScheduleActions
            key={selected}
            idols={idols.filter(i => i.status === "active")}
            ownId={isIdol ? profile.id : undefined}
            day={selected < today ? today : selected}
            minDay={today}
            maxDay={addDays(today, 90)}
            opening={settings.opening_hour}
            closing={settings.closing_hour}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: requests
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "requests" && (
        <div className="scv-panel" role="tabpanel">
          <div className="scv-section-head">
            <div>
              <h2>Yêu cầu lịch trong tuần</h2>
              <span className="scv-count-tag">{requestsCount} yêu cầu</span>
            </div>
            <p className="scv-section-sub">
              Gom nhóm theo từng Idol · Xếp phòng và xử lý theo từng ca đăng ký trong tuần.
            </p>
          </div>

          {/* Search & Status Filter Strip for Requests */}
          <div className="scv-req-toolbar">
            <div className="scv-req-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Tìm Idol, @username, ngày làm việc…"
                value={reqSearch}
                onChange={(e) => setReqSearch(e.target.value)}
                className="scv-req-search-input"
              />
              {reqSearch && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setReqSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="scv-req-filter-pills">
              {(
                [
                  ["all", "Tất cả"],
                  ["pending", "Chờ duyệt"],
                  ["approved", "Đã duyệt"],
                  ["rejected", "Từ chối"],
                ] as const
              ).map(([st, lbl]) => (
                <button
                  key={st}
                  type="button"
                  className={`scv-req-filter-btn ${reqStatusFilter === st ? "active" : ""}`}
                  onClick={() => setReqStatusFilter(st)}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div className="scv-req-expand-toggles">
              <button
                type="button"
                className="btn secondary btn-compact"
                onClick={() => setExpandedReqIdols(new Set(groupedRequests.map((g) => g.idolId)))}
              >
                Mở tất cả ({groupedRequests.length})
              </button>
              <button
                type="button"
                className="btn secondary btn-compact"
                onClick={() => setExpandedReqIdols(new Set())}
              >
                Thu gọn tất cả
              </button>
            </div>
          </div>

          {groupedRequests.length === 0 ? (
            <div className="scv-empty-state">
              <span className="scv-empty-icon">📋</span>
              <strong>Không có yêu cầu nào phù hợp</strong>
              <span>
                {reqSearch
                  ? `Không tìm thấy yêu cầu nào khớp với "${reqSearch}".`
                  : "Tất cả lịch làm việc đang ổn định hoặc chưa có yêu cầu mới."}
              </span>
            </div>
          ) : (
            <div className="scv-req-group-list">
              {groupedRequests.map((group) => {
                const hasPending = group.pendingCount > 0;
                const isExpanded = expandedReqIdols.has(group.idolId);

                return (
                  <article
                    key={group.idolId}
                    className={`scv-idol-req-card ${hasPending ? "has-pending" : "all-settled"} ${
                      isExpanded ? "is-expanded" : "is-collapsed"
                    }`}
                  >
                    {/* Header: Idol Profile & Summary Badges - Click to toggle */}
                    <div
                      className="idol-req-card-header"
                      onClick={() => toggleReqIdol(group.idolId)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                    >
                      <div className="idol-req-profile">
                        <span className="scv-avatar">
                          {group.idolName.charAt(0).toUpperCase()}
                        </span>
                        <div className="idol-req-names">
                          <strong className="idol-req-name">{group.idolName}</strong>
                          {group.username && (
                            <span className="idol-req-handle">@{group.username}</span>
                          )}
                        </div>
                      </div>

                      <div className="idol-req-summary-tags">
                        <span className="req-count-badge">
                          {group.requests.length} ngày đăng ký
                        </span>
                        {hasPending ? (
                          <span className="req-pending-badge">
                            ⏳ {group.pendingCount} ca cần duyệt xếp
                          </span>
                        ) : (
                          <span className="req-settled-badge">
                            ✓ Đã xử lý toàn bộ
                          </span>
                        )}
                        <span className="scv-req-expand-btn">
                          {isExpanded ? "Thu gọn ▲" : "Xem chi tiết ▼"}
                        </span>
                      </div>
                    </div>

                    {/* Table of days requested by this Idol - Only when expanded */}
                    {isExpanded && (
                      <div className="idol-req-days-table-wrap">
                        <table className="idol-req-days-table">
                        <thead>
                          <tr>
                            <th>Ngày làm việc</th>
                            <th>Loại yêu cầu</th>
                            <th>Ca phát sóng</th>
                            <th>Ghi chú & Trạng thái</th>
                            <th>Thao tác</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.requests.map((r) => {
                            const isPending = r.status === "pending";

                            return (
                              <tr
                                key={r.id}
                                className={`req-day-row req-row--${r.status}`}
                              >
                                {/* Work Date */}
                                <td>
                                  <strong className="req-day-date">
                                    📅 {r.details.work_date}
                                  </strong>
                                </td>

                                {/* Kind */}
                                <td>
                                  <span className="req-kind-badge">
                                    {REQUEST_KIND_LABELS[r.kind] || r.kind}
                                  </span>
                                </td>

                                {/* Shifts */}
                                <td>
                                  <span className="req-shift-time">
                                    {r.details.shifts
                                      ?.map(
                                        (s: { start_hour: number; end_hour: number }) =>
                                          `${s.start_hour}:00–${s.end_hour}:00`
                                      )
                                      .join(" / ") || "5 tiếng"}
                                  </span>
                                </td>

                                {/* Reason & Status */}
                                <td>
                                  <div className="req-status-cell">
                                    <span
                                      className={`req-status-pill ${
                                        STATUS_COLORS[r.status] || ""
                                      }`}
                                    >
                                      {STATUS_LABELS[r.status] || r.status}
                                    </span>

                                    {r.details.reason && (
                                      <small className="req-reason-text muted">
                                        Lý do: {r.details.reason}
                                      </small>
                                    )}

                                    {r.decision_reason && (
                                      <small className="req-decision-text text-muted">
                                        QĐ: {r.decision_reason}
                                      </small>
                                    )}

                                    {isPending && r.details.prepared_by && (
                                      <small className="text-amber font-bold block">
                                        ⏳ Đã xếp phòng — chờ chủ phòng duyệt
                                      </small>
                                    )}
                                  </div>
                                </td>

                                {/* Action link for Operator */}
                                <td>
                                  {role !== "idol" && isPending ? (
                                    <Link
                                      className="btn btn-compact req-action-btn"
                                      href={`${base}/requests/${r.id}`}
                                    >
                                      Xếp phòng & Xử lý →
                                    </Link>
                                  ) : (
                                    <span className="text-muted text-sm">—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          )}

          {requestsCount > 30 && (
            <div className="scv-pagination">
              {page > 1 && (
                <Link href={`${base}?date=${selected}&tab=requests&page=${page - 1}`} className="btn secondary btn-compact">
                  ← Trang trước
                </Link>
              )}
              <span>Trang {page}</span>
              {page * 30 < requestsCount && (
                <Link href={`${base}?date=${selected}&tab=requests&page=${page + 1}`} className="btn secondary btn-compact">
                  Trang sau →
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB: borrow (operator/admin only)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "borrow" && !isIdol && (
        <div className="scv-panel" role="tabpanel">
          <div className="scv-section-head">
            <div>
              <h2>Duyệt yêu cầu mượn phòng</h2>
              <span className="scv-count-tag">{inboxCount} đang chờ</span>
            </div>
            <p className="scv-section-sub">Kiểm tra xem phòng có trống không trước khi đồng ý cho mượn.</p>
          </div>

          {inbox.length === 0 ? (
            <div className="scv-empty-state">
              <span className="scv-empty-icon">🏢</span>
              <strong>Không có yêu cầu mượn phòng nào</strong>
              <span>Không có team nào đang chờ mượn phòng live của bạn.</span>
            </div>
          ) : (
            <div className="scv-borrow-list">
              {inbox.map(r => (
                <article key={r.id} className="scv-borrow-card">
                  <div className="borrow-card-info">
                    <div className="borrow-room-badge">🏢 {r.room_code}</div>
                    <div className="borrow-details">
                      <span className="borrow-date">📅 {r.work_date}</span>
                      <span className="borrow-hours">
                        ⏰ {r.hours.map((h: number) => `${h}:00–${h + 1}:00`).join(", ")}
                      </span>
                    </div>
                  </div>
                  <div className="borrow-card-actions">
                    <DecisionForm key={r.revision} id={r.id} revision={r.revision} borrow />
                  </div>
                </article>
              ))}
            </div>
          )}

          {inboxCount > 30 && (
            <div className="scv-pagination">
              {borrowPage > 1 && (
                <Link href={`${base}?date=${selected}&tab=borrow&borrowPage=${borrowPage - 1}`} className="btn secondary btn-compact">
                  ← Trang trước
                </Link>
              )}
              <span>Trang {borrowPage}</span>
              {borrowPage * 30 < inboxCount && (
                <Link href={`${base}?date=${selected}&tab=borrow&borrowPage=${borrowPage + 1}`} className="btn secondary btn-compact">
                  Trang sau →
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
