"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { manageRoomTurn } from "@/features/operations/actions";
import { DeviceDecision } from "./device-decision";
import { addDays } from "@/lib/scheduling";
import {
  groupIdolOperations,
  lateMinutes,
  entryState,
  type OperationRow,
} from "@/lib/operations-flow";
import type { DeviceRequestSummary, OperationalLoan } from "@/types/database";

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "—";

const fullDate = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "—";

const STATUS_LABELS: Record<string, string> = {
  waiting: "Chưa check-in",
  in_room: "Đang trong phòng",
  completed: "Đã trả phòng",
  skipped: "Đã bỏ qua",
  blocked: "Chờ phòng / lượt trước",
  early: "Chưa đến giờ",
  ready: "Đến lượt",
  overdue: "Quá hạn check-in",
};

function OperatorTurnControls({
  row,
  isActionable,
}: {
  row: OperationRow;
  isActionable: boolean;
}) {
  const [state, action, pending] = useActionState(manageRoomTurn, {});
  const [open, setOpen] = useState(false);

  if (!isActionable) {
    return (
      <span className="text-muted text-xs">
        {row.status === "completed"
          ? "✓ Đã hoàn tất"
          : row.status === "skipped"
          ? "Đã bỏ qua"
          : "Đã qua"}
      </span>
    );
  }

  return (
    <div className="op-turn-controls-wrap">
      <button
        type="button"
        className="btn secondary btn-compact"
        onClick={() => setOpen(!open)}
      >
        ⚙️ Điều phối lượt {open ? "▲" : "▼"}
      </button>

      {open && (
        <form action={action} className="op-turn-form">
          <input type="hidden" name="segment" value={row.segment_id} />
          <div className="op-turn-input-group">
            <label htmlFor={`reason-${row.segment_id}`}>Lý do điều phối (nếu có):</label>
            <input
              id={`reason-${row.segment_id}`}
              name="reason"
              maxLength={500}
              placeholder="VD: Idol xin nghỉ, phòng cần dọn dẹp..."
              className="op-reason-input"
            />
          </div>

          <div className="op-turn-buttons">
            {row.status === "waiting" && (
              <button
                className="btn secondary btn-compact text-danger"
                name="action"
                value="skip"
                disabled={pending}
              >
                Bỏ qua lượt này
              </button>
            )}

            {row.room_on_hold ? (
              <button
                className="btn btn-compact"
                name="action"
                value="release"
                disabled={pending}
              >
                ✓ Phòng đã sẵn sàng
              </button>
            ) : (
              <button
                className="btn secondary btn-compact"
                name="action"
                value="hold"
                disabled={pending}
              >
                ⚠️ Đánh dấu phòng chưa sẵn sàng
              </button>
            )}
          </div>

          {state.error && <p className="feedback error" role="alert">{state.error}</p>}
          {state.success && <p className="feedback success" role="status">{state.success}</p>}
        </form>
      )}
    </div>
  );
}

export function OperatorOperationsView({
  rows,
  inbox,
  inboxCount,
  loans,
  day,
  today,
  base,
  serverNow,
  initialIdol = "",
  currentPage = 1,
}: {
  rows: OperationRow[];
  inbox: DeviceRequestSummary[];
  inboxCount: number;
  loans: OperationalLoan[];
  day: string;
  today: string;
  base: string;
  serverNow: number;
  initialIdol?: string;
  currentPage?: number;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"monitor" | "devices">("monitor");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "waiting" | "late">("all");
  const [now, setNow] = useState(serverNow);
  const [idolFilter, setIdolFilter] = useState(initialIdol);
  const [expandedIdols, setExpandedIdols] = useState<Set<string>>(() => new Set());

  const previousDay = addDays(day, -1);
  const nextDay = addDays(day, 1);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setNow(serverNow + Date.now() - start), 1000);
    const refresh = () => {
      if (!document.hidden && navigator.onLine) router.refresh();
    };
    const poll = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("notifications-changed", refresh);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("notifications-changed", refresh);
    };
  }, [router, serverNow]);

  const groups = useMemo(() => groupIdolOperations(rows), [rows]);

  // Filter groups
  const filtered = useMemo(() => {
    return groups.filter((g) => {
      if (idolFilter && g.idol_id !== idolFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = `${g.username} ${g.idol_name}`.toLowerCase().includes(q);
        if (!matchesName) return false;
      }
      if (filter === "late") return g.late_minutes > 0;
      if (filter === "open") return g.rows.some((r) => r.status === "in_room");
      if (filter === "waiting") return g.rows.some((r) => r.status === "waiting");
      return true;
    });
  }, [groups, idolFilter, search, filter]);

  // KPI stats
  const stats = useMemo(() => {
    const totalIdols = groups.length;
    const inRoom = groups.filter((g) => g.rows.some((r) => r.status === "in_room")).length;
    const waiting = groups.filter((g) => g.rows.some((r) => r.status === "waiting")).length;
    const late = groups.filter((g) => g.late_minutes > 0).length;
    return { totalIdols, inRoom, waiting, late };
  }, [groups]);

  const totalDeviceAlerts = inboxCount + loans.length;

  const toggleExpand = (key: string) => {
    setExpandedIdols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="operator-ops-container">
      {/* 2 Main Sub-Tabs */}
      <nav className="schedule-tab-strip" aria-label="Phân hệ vận hành ca live">
        <button
          type="button"
          className={`schedule-tab-btn ${activeTab === "monitor" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("monitor")}
          aria-pressed={activeTab === "monitor"}
        >
          <span>👁️</span>
          <span>Theo dõi theo Idol</span>
          {stats.late > 0 && <span className="tab-count-badge">{stats.late} trễ</span>}
        </button>

        <button
          type="button"
          className={`schedule-tab-btn ${activeTab === "devices" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("devices")}
          aria-pressed={activeTab === "devices"}
        >
          <span>📱</span>
          <span>Duyệt & Quản lý thiết bị</span>
          {totalDeviceAlerts > 0 && (
            <span className="tab-count-badge">{totalDeviceAlerts}</span>
          )}
        </button>
      </nav>

      {/* ══════════════════════════════════════════════════════════════════
          TAB 1: THEO DÕI THEO IDOL (MONITOR)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "monitor" && (
        <div className="tab-content-panel">
          {/* Executive KPI Bar */}
          <div className="op-kpi-grid">
            <div className="op-kpi-card">
              <span className="kpi-label">Idol có ca hôm nay</span>
              <strong className="kpi-value text-primary">{stats.totalIdols}</strong>
              <span className="kpi-sub">Lịch phân công trong ngày</span>
            </div>

            <div className="op-kpi-card">
              <span className="kpi-label">Đang live trong phòng</span>
              <strong className="kpi-value text-success">{stats.inRoom}</strong>
              <span className="kpi-sub">Đã check-in thực tế</span>
            </div>

            <div className="op-kpi-card">
              <span className="kpi-label">Chưa check-in</span>
              <strong className="kpi-value text-muted">{stats.waiting}</strong>
              <span className="kpi-sub">Đang chờ đến lượt / ca</span>
            </div>

            <div className={`op-kpi-card ${stats.late > 0 ? "kpi-alert-red" : ""}`}>
              <span className="kpi-label">Vi phạm trễ giờ</span>
              <strong className="kpi-value text-danger">{stats.late}</strong>
              <span className="kpi-sub">
                {stats.late > 0 ? "Cần nhắc nhở / xử lý" : "Không có vi phạm"}
              </span>
            </div>
          </div>

          {/* Date Navigator Bar */}
          <div className="op-toolbar-row">
            <div className="op-date-navigator">
              <Link
                className="btn secondary btn-compact"
                href={`${base}?day=${previousDay}`}
                title="Xem ngày trước"
              >
                ← Ngày trước
              </Link>

              <form action={base} method="get" className="op-date-form-inline">
                <input
                  type="date"
                  name="day"
                  defaultValue={day}
                  className="op-date-picker-input"
                  aria-label="Chọn ngày giám sát"
                />
                <button type="submit" className="btn secondary btn-compact">
                  Xem ngày
                </button>
              </form>

              <Link
                className="btn secondary btn-compact"
                href={`${base}?day=${nextDay}`}
                title="Xem ngày sau"
              >
                Ngày sau →
              </Link>

              {day !== today && (
                <Link className="btn btn-compact" href={base}>
                  Hôm nay
                </Link>
              )}
            </div>

            <div className="op-refresh-wrap">
              <span className="op-poll-indicator">● Tự cập nhật 15s</span>
              <button
                type="button"
                className="btn secondary btn-compact"
                onClick={() => router.refresh()}
              >
                🔄 Tải mới
              </button>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="op-filter-strip">
            <div className="op-search-box">
              <span className="search-icon">🔍</span>
              <input
                type="search"
                placeholder="Tìm Idol theo tên, @username TikTok…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="op-search-input"
              />
              {search && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="op-filter-buttons">
              {(
                [
                  ["all", "Tất cả"],
                  ["open", "Đang trong phòng"],
                  ["waiting", "Chưa check-in"],
                  ["late", "Vi phạm trễ"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`op-filter-btn ${filter === key ? "active" : ""}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {idolFilter && (
              <button
                type="button"
                className="btn secondary btn-compact"
                onClick={() => setIdolFilter("")}
              >
                Bỏ lọc theo thông báo (✕)
              </button>
            )}
          </div>

          {/* Idol Operations Cards List */}
          {filtered.length === 0 ? (
            <div className="tab-empty-state">
              <div className="tab-empty-icon">👥</div>
              <p className="tab-empty-title">Không tìm thấy ca live nào phù hợp</p>
              <p className="tab-empty-sub">
                {search
                  ? `Không có kết quả nào khớp với "${search}".`
                  : `Ngày ${day} chưa có ca phân công nào hoặc không có ca thỏa bộ lọc.`}
              </p>
            </div>
          ) : (
            <div className="op-idols-grid">
              {filtered.map((group) => {
                const isExpanded = expandedIdols.has(group.key) || Boolean(idolFilter);
                const isInRoom = group.rows.some((r) => r.status === "in_room");
                const hasViolation = group.late_minutes > 0;

                return (
                  <article
                    key={group.key}
                    className={`op-idol-card ${isInRoom ? "is-live" : ""} ${hasViolation ? "has-violation" : ""}`}
                  >
                    {/* Header */}
                    <div
                      className="op-idol-card-header"
                      onClick={() => toggleExpand(group.key)}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                    >
                      <div className="op-idol-profile">
                        <div className="initial-avatar-sm">
                          {group.idol_name?.charAt(0).toUpperCase() || "?"}
                        </div>
                        <div className="op-idol-names">
                          <strong className="op-idol-fullname">{group.idol_name}</strong>
                          <span className="op-idol-username">@{group.username}</span>
                        </div>
                      </div>

                      <div className="op-idol-badges">
                        <span className="op-turns-tag">
                          {group.rows.length} ca live
                        </span>

                        {isInRoom && (
                          <span className="status-chip-live">
                            <span className="live-dot" />
                            Đang trong phòng
                          </span>
                        )}

                        {hasViolation && (
                          <span className="status-chip-late">
                            ⚠️ Trễ {group.late_minutes} phút
                          </span>
                        )}

                        <span className="expand-indicator">
                          {isExpanded ? "Thu gọn ▲" : "Chi tiết ▼"}
                        </span>
                      </div>
                    </div>

                    {/* Expandable Body */}
                    {isExpanded && (
                      <div className="op-idol-card-body">
                        <div className="op-turns-table-wrap">
                          <table className="op-turns-table">
                            <thead>
                              <tr>
                                <th>Phòng & Lịch dự kiến</th>
                                <th>Hạn nhận phòng</th>
                                <th>Vào / Ra thực tế</th>
                                <th>Thiết bị</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {group.rows.map((row) => {
                                const currentEntryState = entryState(row, now);
                                const isRowLive = row.status === "in_room";

                                return (
                                  <tr
                                    key={row.segment_id}
                                    className={isRowLive ? "row-live" : ""}
                                  >
                                    {/* Room & Scheduled Hours */}
                                    <td>
                                      <div className="room-cell">
                                        <strong className="room-code-tag">
                                          🏢 {row.room_code}
                                        </strong>
                                        <span className="scheduled-hours">
                                          {time(row.scheduled_start)} → {time(row.scheduled_end)}
                                        </span>
                                      </div>
                                    </td>

                                    {/* Entry Deadline */}
                                    <td>
                                      <span className="due-time">
                                        {row.entry_due_at ? time(row.entry_due_at) : "Chờ phòng"}
                                      </span>
                                      {row.late_seconds > 0 && (
                                        <small className="text-danger font-bold block">
                                          Trễ {lateMinutes(row.late_seconds)}p
                                        </small>
                                      )}
                                    </td>

                                    {/* Actual times */}
                                    <td>
                                      <span className="checkin-time">
                                        Vào: {time(row.checked_in_at)}
                                      </span>
                                      <small className="checkout-time muted block">
                                        Ra: {time(row.checked_out_at)}
                                      </small>
                                    </td>

                                    {/* Device info */}
                                    <td>
                                      {row.device_code ? (
                                        <>
                                          <strong className="device-code">
                                            📱 {row.device_code}
                                          </strong>
                                          <small className="muted block">
                                            {row.device_returned_at
                                              ? `Đã trả lúc ${time(row.device_returned_at)}`
                                              : "Chưa trả máy"}
                                          </small>
                                        </>
                                      ) : row.device_choice === "own" ? (
                                        <span className="text-muted">Máy cá nhân</span>
                                      ) : row.pending_device_request ? (
                                        <span className="text-amber font-bold">
                                          Chờ duyệt {row.requested_device_code ?? "máy"}
                                        </span>
                                      ) : (
                                        <span className="text-muted">Chưa nhận máy</span>
                                      )}
                                    </td>

                                    {/* Status Badge */}
                                    <td>
                                      <span
                                        className={`op-status-chip status-${row.status} ${
                                          isRowLive ? "live" : ""
                                        }`}
                                      >
                                        {STATUS_LABELS[currentEntryState] || currentEntryState}
                                      </span>
                                      {row.skip_reason && (
                                        <small className="text-muted block">{row.skip_reason}</small>
                                      )}
                                    </td>

                                    {/* Actions & Turn Controls */}
                                    <td>
                                      {(() => {
                                        const isPastDate = row.work_date < today;
                                        const isEnded = row.status === "completed" || row.status === "skipped";
                                        const isPastTime =
                                          row.work_date === today &&
                                          row.status !== "in_room" &&
                                          now > new Date(row.scheduled_end).getTime();
                                        const isActionable = !isPastDate && !isEnded && !isPastTime;

                                        return (
                                          <OperatorTurnControls
                                            row={row}
                                            isActionable={isActionable}
                                          />
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Audit Details per segment */}
                        {group.rows.map((row) => (
                          <div key={row.segment_id} className="op-segment-audit">
                            <div className="audit-header">
                              <strong>Phòng {row.room_code} · Nhật ký thao tác & hình ảnh</strong>
                              {row.photos && row.photos.length > 0 && (
                                <div className="audit-photos">
                                  {row.photos.map((photo) => (
                                    <a
                                      key={photo.id}
                                      href={`/api/attendance/photos/${photo.id}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="photo-preview-link"
                                    >
                                      📷 {photo.phase === "checkin" ? "Ảnh vào phòng" : "Ảnh ra phòng"}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>

                            {row.events && row.events.length > 0 ? (
                              <ol className="op-timeline-list">
                                {row.events.map((evt) => (
                                  <li
                                    key={evt.id}
                                    className={`timeline-item ${evt.important ? "important" : ""}`}
                                  >
                                    <span className="time-badge">{fullDate(evt.happened_at)}</span>
                                    <span className="message-text">
                                      {evt.important && <strong className="text-danger">[QUAN TRỌNG] </strong>}
                                      {evt.message}
                                    </span>
                                  </li>
                                ))}
                              </ol>
                            ) : (
                              <p className="hint text-sm">Chưa có thao tác nào được ghi nhận.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          TAB 2: DUYỆT & QUẢN LÝ THIẾT BỊ (DEVICES)
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "devices" && (
        <div className="tab-content-panel">
          {/* Section 1: Device Requests Inbox */}
          <section className="surface ops-device-inbox-section">
            <div className="section-title">
              <div>
                <h2>Yêu cầu duyệt mượn máy ngoài phòng ({inboxCount})</h2>
                <p className="muted text-sm">
                  Idol quét nhận thiết bị không gắn mặc định với phòng live. Chỉ Vận hành hoặc Admin được duyệt.
                </p>
              </div>
              <span className="ops-inbox-count-badge">
                {inboxCount} yêu cầu đang chờ
              </span>
            </div>

            {inbox.length === 0 ? (
              <div className="tab-empty-state">
                <div className="tab-empty-icon">✅</div>
                <p className="tab-empty-title">Không có yêu cầu mượn máy nào đang chờ duyệt</p>
                <p className="tab-empty-sub">
                  Tất cả các lượt nhận thiết bị đều đúng phòng hoặc đã được xử lý xong.
                </p>
              </div>
            ) : (
              <div className="ops-device-cards-grid">
                {inbox.map((r) => (
                  <article key={r.id} className="ops-device-request-card">
                    <div className="device-card-left">
                      <div className="device-badge">
                        📱 <strong>{r.device_code}</strong>
                      </div>
                      <div className="device-meta">
                        <strong className="idol-request-name">{r.idol_name}</strong>
                        <span className="request-time muted">
                          Yêu cầu lúc: {fullDate(r.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="device-card-actions">
                      <DeviceDecision key={r.revision} id={r.id} revision={r.revision} />
                    </div>
                  </article>
                ))}
              </div>
            )}

            {inboxCount > 50 && (
              <nav className="pagination">
                {currentPage > 1 && (
                  <Link
                    href={`${base}?day=${day}&page=${currentPage - 1}`}
                    className="btn secondary btn-compact"
                  >
                    ← Trước
                  </Link>
                )}
                <span>Trang {currentPage}</span>
                {currentPage * 50 < inboxCount && (
                  <Link
                    href={`${base}?day=${day}&page=${currentPage + 1}`}
                    className="btn secondary btn-compact"
                  >
                    Tiếp →
                  </Link>
                )}
              </nav>
            )}
          </section>

          {/* Section 2: Active Device Loans */}
          <section className="surface ops-loans-table-section">
            <div className="section-title">
              <div>
                <h2>Thiết bị đang được mượn / chưa trả ({loans.length})</h2>
                <p className="muted text-sm">
                  Bao gồm máy đang live, máy mượn từ ca trước hoặc phòng đã checkout nhưng Idol chưa quét trả máy.
                </p>
              </div>
              <span className="small-tag">{loans.length} máy đang ở ngoài</span>
            </div>

            {loans.length === 0 ? (
              <div className="tab-empty-state">
                <div className="tab-empty-icon">📱</div>
                <p className="tab-empty-title">Tất cả thiết bị đã được trả về kệ</p>
                <p className="tab-empty-sub">
                  Hiện không có thiết bị nào đang bị giữ ngoài quy định.
                </p>
              </div>
            ) : (
              <div className="ops-loans-grid">
                {loans.map((loan) => (
                  <article className="ops-loan-item-card" key={loan.id}>
                    <div className="loan-card-top">
                      <span className="loan-device-code">📱 {loan.device_code}</span>
                      <span className="loan-warning-pill">Chưa quét trả</span>
                    </div>

                    <div className="loan-card-body">
                      <strong className="loan-idol-name">{loan.idol_name}</strong>
                      <span className="loan-checkout-time muted">
                        Nhận lúc: {fullDate(loan.checked_out_at)}
                      </span>
                      {loan.return_requested_at && (
                        <span className="loan-return-requested text-amber">
                          Đã yêu cầu trả lúc: {fullDate(loan.return_requested_at)}
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
