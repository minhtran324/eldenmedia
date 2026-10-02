"use client";

import { useState } from "react";
import Link from "next/link";
import { addDays } from "@/lib/scheduling";
import { lateMinutes, type OperationRow } from "@/lib/operations-flow";

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

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  waiting: { label: "Chưa check-in", class: "status-waiting" },
  in_room: { label: "Đang trong ca live", class: "status-live" },
  completed: { label: "Đã hoàn thành ca", class: "status-completed" },
  skipped: { label: "Đã bỏ qua", class: "status-skipped" },
};

export function IdolPersonalHistory({
  rows,
  day,
  today,
  base,
}: {
  rows: OperationRow[];
  day: string;
  today: string;
  base: string;
}) {
  const previousDay = addDays(day, -1);
  const nextDay = addDays(day, 1);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const completedCount = rows.filter((r) => r.status === "completed").length;
  const inRoomCount = rows.filter((r) => r.status === "in_room").length;

  return (
    <section className="surface idol-history-mobile-surface">
      <div className="idol-history-head">
        <div>
          <span className="section-eyebrow">NHẬT KÝ CA CỦA BẠN</span>
          <h2 className="idol-history-title">Lịch sử ca làm việc</h2>
          <p className="idol-history-sub">
            Xem lại giờ check-in, check-out thực tế và thiết bị đã sử dụng theo ngày.
          </p>
        </div>

        {/* Date Navigator Bar */}
        <div className="idol-date-nav">
          <Link
            className="idol-date-btn"
            href={`${base}?day=${previousDay}`}
            aria-label="Xem ngày trước"
          >
            ←
          </Link>

          <form action={base} method="get" className="idol-date-picker-form">
            <input
              type="date"
              name="day"
              defaultValue={day}
              className="idol-date-input"
              aria-label="Chọn ngày xem lịch sử"
            />
            <button type="submit" className="idol-date-btn">
              Xem
            </button>
          </form>

          <Link
            className="idol-date-btn"
            href={`${base}?day=${nextDay}`}
            aria-label="Xem ngày sau"
          >
            →
          </Link>

          {day !== today && (
            <Link className="idol-date-btn today-btn" href={base}>
              Hôm nay
            </Link>
          )}
        </div>
      </div>

      {/* Daily quick summary pills */}
      <div className="idol-history-metrics">
        <div className="metric-pill">
          <span>Tổng ca trong ngày:</span>
          <strong>{rows.length} lượt phòng</strong>
        </div>
        {inRoomCount > 0 && (
          <div className="metric-pill live">
            <span className="live-dot" />
            <strong>{inRoomCount} ca đang live</strong>
          </div>
        )}
        {completedCount > 0 && (
          <div className="metric-pill done">
            <strong>{completedCount} ca đã hoàn thành</strong>
          </div>
        )}
      </div>

      {/* Turn list for the selected day */}
      {rows.length === 0 ? (
        <div className="idol-empty-history">
          <span className="empty-icon">📅</span>
          <strong>Không có ca live nào trong ngày {day}</strong>
          <p className="muted">
            {day === today
              ? "Hôm nay bạn chưa có lịch phân phòng nào được xếp."
              : "Ngày này bạn không có ca live hoặc không được phân phòng."}
          </p>
          <Link href="/idol/schedule" className="btn secondary btn-compact">
            Xem lịch tuần tổng quan →
          </Link>
        </div>
      ) : (
        <div className="idol-turn-cards-list">
          {rows.map((row) => {
            const isExpanded = expandedRow === row.segment_id;
            const statusConfig = STATUS_LABELS[row.status] || {
              label: row.status,
              class: "status-default",
            };
            const hasViolation = row.late_seconds > 0;

            return (
              <article
                key={row.segment_id}
                className={`idol-turn-card ${row.status === "in_room" ? "is-live" : ""}`}
              >
                {/* Header row */}
                <div className="turn-card-top">
                  <div className="turn-room-badge">
                    <span className="room-icon">🏢</span>
                    <strong>Phòng {row.room_code}</strong>
                  </div>

                  <span className={`turn-status-badge ${statusConfig.class}`}>
                    {statusConfig.label}
                  </span>
                </div>

                {/* Scheduled vs Actual time */}
                <div className="turn-time-grid">
                  <div className="time-block">
                    <span className="time-label">Lịch dự kiến</span>
                    <strong className="time-value">
                      {time(row.scheduled_start)} → {time(row.scheduled_end)}
                    </strong>
                  </div>

                  <div className="time-block">
                    <span className="time-label">Vào / Ra thực tế</span>
                    <strong className="time-value">
                      {row.checked_in_at ? time(row.checked_in_at) : "Chưa vào"}
                      {" → "}
                      {row.checked_out_at ? time(row.checked_out_at) : "Chưa ra"}
                    </strong>
                  </div>
                </div>

                {/* Device and warnings info */}
                <div className="turn-meta-row">
                  <div className="meta-item">
                    <span className="meta-icon">📱</span>
                    <span>
                      {row.device_code ? (
                        <strong>{row.device_code}</strong>
                      ) : row.device_choice === "own" ? (
                        "Máy cá nhân"
                      ) : row.pending_device_request ? (
                        "Chờ duyệt mượn máy"
                      ) : (
                        "Không dùng máy"
                      )}
                    </span>
                  </div>

                  {hasViolation && (
                    <div className="meta-warning">
                      <span>⚠️ Trễ {lateMinutes(row.late_seconds)} phút</span>
                    </div>
                  )}
                </div>

                {/* Photos links if available */}
                {row.photos && row.photos.length > 0 && (
                  <div className="turn-photos-row">
                    <span className="photos-title">Ảnh chụp đối chiếu:</span>
                    <div className="photos-links">
                      {row.photos.map((p) => (
                        <a
                          key={p.id}
                          href={`/api/attendance/photos/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="photo-tag-link"
                        >
                          📷 {p.phase === "checkin" ? "Ảnh vào phòng" : "Ảnh ra phòng"}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Expandable audit timeline */}
                {row.events && row.events.length > 0 && (
                  <div className="turn-events-accordion">
                    <button
                      type="button"
                      className="events-toggle-btn"
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : row.segment_id)
                      }
                      aria-expanded={isExpanded}
                    >
                      <span>
                        {isExpanded ? "Ẩn nhật ký chi tiết" : "Xem nhật ký chi tiết"} ({row.events.length})
                      </span>
                      <span className="toggle-chevron">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {isExpanded && (
                      <ol className="idol-timeline-list">
                        {row.events.map((evt) => (
                          <li
                            key={evt.id}
                            className={`timeline-entry ${evt.important ? "important" : ""}`}
                          >
                            <span className="timeline-time">
                              {fullDate(evt.happened_at)}
                            </span>
                            <span className="timeline-msg">
                              {evt.important && <strong>[LƯU Ý] </strong>}
                              {evt.message}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
