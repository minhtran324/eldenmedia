"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { addDays } from "@/lib/scheduling";
import { submitWeek, requestLateWeek, reviewLateWeek } from "@/features/scheduling/weekly-actions";
import { SubmitButton } from "./account-forms";
import { ActionFeedback } from "./toast";
import type { Shift } from "@/types/database";

type DayChoice = {
  date: string;
  mode: "unset" | "work" | "off" | "existing" | "past";
  shifts: Shift[];
};

export function DecisionButton({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`btn ${value === "false" ? "secondary" : ""}`}
      name="approve"
      value={value}
      disabled={pending}
    >
      {pending ? "Đang xử lý…" : children}
    </button>
  );
}

export function LateRequestForm({ week }: { week: string }) {
  const [state, action] = useActionState(requestLateWeek, {});
  return (
    <form action={action} className="stack-form modern-late-form">
      <input type="hidden" name="week" value={week} />
      <div className="form-group">
        <label htmlFor="reason" className="form-label font-semibold">
          Lý do đăng ký trễ
        </label>
        <textarea
          id="reason"
          name="reason"
          required
          maxLength={500}
          rows={3}
          placeholder="Nhập lý do gửi trễ để Vận hành phụ trách hoặc Admin xem xét..."
          className="form-textarea"
        />
      </div>
      <SubmitButton>Gửi yêu cầu đăng ký trễ</SubmitButton>
      <ActionFeedback state={state} />
    </form>
  );
}

export function LateDecisionForm({
  id,
  revision,
}: {
  id: string;
  revision: number;
}) {
  const [state, action] = useActionState(reviewLateWeek, {});
  return (
    <form action={action} className="stack-form modern-late-decision">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      <div className="form-group">
        <label htmlFor="reject-reason" className="form-label font-semibold">
          Lý do nếu từ chối
        </label>
        <input
          id="reject-reason"
          name="reason"
          maxLength={500}
          placeholder="Nhập lý do nếu không chấp nhận (tùy chọn)..."
          className="form-input"
        />
      </div>
      <div className="inline-actions">
        <DecisionButton value="true">✓ Cho phép đăng ký trễ</DecisionButton>
        <DecisionButton value="false">✕ Từ chối</DecisionButton>
      </div>
      <ActionFeedback state={state} />
    </form>
  );
}

function formatDayDetails(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const days = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  const fullDays = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  const dayIndex = d.getUTCDay();
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();

  return {
    shortLabel: `${days[dayIndex]} · ${dd}/${mm}`,
    weekday: days[dayIndex],
    date: `${dd}/${mm}`,
    fullTitle: `${fullDays[dayIndex]}, ngày ${dd}/${mm}/${yyyy}`,
  };
}

export function WeeklyRegistration({
  week,
  today,
  existing,
  opening,
  closing,
}: {
  week: string;
  today: string;
  existing: string[];
  opening: number;
  closing: number;
}) {
  const [state, action] = useActionState(submitWeek, {});
  const [days, setDays] = useState<DayChoice[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(week, i);
      return {
        date,
        mode: existing.includes(date) ? "existing" : date < today ? "past" : "unset",
        shifts: [],
      };
    })
  );

  const [active, setActive] = useState(
    Math.max(0, days.findIndex(d => d.mode === "unset"))
  );
  const selected = days[active] || days[0];

  const presetDefault = (): Shift[] => [
    { start_hour: opening, end_hour: Math.min(opening + 5, closing) },
  ];

  const setDay = (patch: Partial<DayChoice>) =>
    setDays(values =>
      values.map((v, i) => (i === active ? { ...v, ...patch } : v))
    );

  const valid = (day: DayChoice) =>
    day.mode !== "unset" &&
    (day.mode !== "work" ||
      (day.shifts.reduce((sum, s) => sum + s.end_hour - s.start_hour, 0) === 5 &&
        day.shifts.every(
          s =>
            s.start_hour >= opening &&
            s.end_hour <= closing &&
            s.end_hour > s.start_hour
        ) &&
        (day.shifts.length === 1 ||
          day.shifts[0].end_hour <= day.shifts[1].start_hour ||
          day.shifts[1].end_hour <= day.shifts[0].start_hour)));

  const complete = days.filter(valid).length;
  const workDaysCount = days.filter(d => d.mode === "work").length;
  const offDaysCount = days.filter(d => d.mode === "off").length;

  function shiftStart(index: number, start: number) {
    if (!selected) return;
    setDay({
      shifts: selected.shifts.map((s, i) =>
        i === index
          ? { start_hour: start, end_hour: start + s.end_hour - s.start_hour }
          : s
      ),
    });
  }

  // Quick preset apply for current active day
  const applyPreset = (start: number) => {
    setDay({
      mode: "work",
      shifts: [{ start_hour: start, end_hour: start + 5 }],
    });
  };

  const selectedDuration1 =
    selected?.shifts?.[0] ? selected.shifts[0].end_hour - selected.shifts[0].start_hour : 3;

  return (
    <form action={action} className="stack-form weekly-registration-form">
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="days" value={JSON.stringify(days)} />

      {/* Progress & Summary Bar */}
      <div className="weekly-progress-card">
        <div className="weekly-progress-header">
          <div className="progress-info">
            <span className="progress-label">Tiến độ hoàn thành</span>
            <div className="progress-status-row">
              <strong className="progress-count">
                {complete}/7 ngày
              </strong>
              {complete === 7 ? (
                <span className="badge-complete-pill">✓ Đã đủ 7 ngày</span>
              ) : (
                <span className="badge-pending-pill">Còn {7 - complete} ngày chưa chọn</span>
              )}
            </div>
          </div>
          <div className="weekly-stats-pills">
            <span className="stat-pill stat-work">
              💼 <strong>{workDaysCount}</strong> ngày làm ({workDaysCount * 5}h live)
            </span>
            <span className="stat-pill stat-off">
              🏖️ <strong>{offDaysCount}</strong> ngày nghỉ
            </span>
          </div>
        </div>

        {/* 7-Segment Progress Visualizer */}
        <div className="weekly-progress-segments">
          {days.map((day, idx) => {
            const isDone = valid(day);
            const isCurrent = active === idx;
            return (
              <div
                key={day.date}
                className={`segment-slot ${isDone ? "is-valid" : "is-empty"} ${isCurrent ? "is-active" : ""}`}
                title={`${formatDayDetails(day.date).weekday}: ${isDone ? "Đã chọn" : "Chưa chọn"}`}
              />
            );
          })}
        </div>
      </div>

      {/* 7-Day Interactive Card Strip */}
      <div className="weekly-days-grid" role="group" aria-label="Chọn ngày trong tuần">
        {days.map((day, i) => {
          const { weekday, date } = formatDayDetails(day.date);
          const isSelected = active === i;
          const isComplete = valid(day);

          return (
            <button
              key={day.date}
              type="button"
              className={`weekly-day-card ${isSelected ? "card-selected" : ""} ${isComplete ? "card-complete" : "card-incomplete"}`}
              aria-pressed={isSelected}
              onClick={() => setActive(i)}
            >
              <div className="card-day-header">
                <span className="card-weekday">{weekday}</span>
                <span className="card-date">{date}</span>
              </div>

              <div className="card-day-content">
                {day.mode === "work" && (
                  <div className="card-work-info">
                    <span className="badge-work-tag">💼 5 giờ live</span>
                    <span className="card-shifts-time">
                      {day.shifts.map(s => `${s.start_hour}–${s.end_hour}h`).join(" / ")}
                    </span>
                  </div>
                )}
                {day.mode === "off" && (
                  <span className="badge-status-chip chip-off">🏖️ Nghỉ ngơi</span>
                )}
                {day.mode === "existing" && (
                  <span className="badge-status-chip chip-existing">🔒 Đã có lịch</span>
                )}
                {day.mode === "past" && (
                  <span className="badge-status-chip chip-past">⏳ Đã qua</span>
                )}
                {day.mode === "unset" && (
                  <span className="badge-status-chip chip-unset">⚠️ Chưa chọn</span>
                )}
              </div>

              <div className="card-footer-indicator">
                {isComplete ? (
                  <span className="indicator-icon valid">✓</span>
                ) : (
                  <span className="indicator-icon pending">●</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Day Detail Editor */}
      <section className="weekly-editor-panel">
        <div className="editor-header">
          <div className="editor-title-wrap">
            <span className="editor-eyebrow">ĐANG CHỈNH SỬA LỊCH NGÀY</span>
            <h3 className="editor-title">{formatDayDetails(selected.date).fullTitle}</h3>
          </div>
          <span className="editor-day-badge">
            {valid(selected) ? "✓ Đã hợp lệ" : "Chưa hoàn tất"}
          </span>
        </div>

        {selected.mode === "existing" || selected.mode === "past" ? (
          <div className="locked-day-banner">
            <span className="banner-icon">ℹ️</span>
            <div>
              <strong>
                {selected.mode === "existing"
                  ? "Ngày này đã có lịch live hoặc yêu cầu xử lý trước đó."
                  : "Ngày này đã qua theo giờ Việt Nam."}
              </strong>
              <p>
                {selected.mode === "existing"
                  ? "Hệ thống tự động giữ nguyên lịch cũ để tránh ghi đè. Muốn đổi lịch hoặc hủy ca, vui lòng dùng chức năng ở trang Lịch live."
                  : "Không thể đăng ký bù vào các ngày trong quá khứ."}
              </p>
            </div>
          </div>
        ) : (
          <div className="editor-body">
            {/* Mode selection: Work vs Off */}
            <div className="mode-toggle-group">
              <button
                type="button"
                className={`mode-toggle-btn ${selected.mode === "work" ? "btn-active-work" : ""}`}
                aria-pressed={selected.mode === "work"}
                onClick={() =>
                  setDay({
                    mode: "work",
                    shifts: selected.shifts.length ? selected.shifts : presetDefault(),
                  })
                }
              >
                💼 <strong>Đăng ký Live (5 tiếng)</strong>
                <small>Idol live đúng 5 tiếng theo quy định</small>
              </button>

              <button
                type="button"
                className={`mode-toggle-btn ${selected.mode === "off" ? "btn-active-off" : ""}`}
                aria-pressed={selected.mode === "off"}
                onClick={() => setDay({ mode: "off", shifts: [] })}
              >
                🏖️ <strong>Nghỉ ngày này</strong>
                <small>Không tham gia phiên live trong ngày</small>
              </button>
            </div>

            {selected.mode === "work" && (
              <div className="work-shifts-builder">
                {/* 1-Click Quick Presets */}
                <div className="quick-presets-section">
                  <span className="section-label">⚡ Chọn nhanh khung giờ chuẩn (5 tiếng):</span>
                  <div className="quick-presets-row">
                    <button
                      type="button"
                      className="preset-btn"
                      onClick={() => applyPreset(9)}
                      title="Ca Sáng từ 09:00 đến 14:00"
                    >
                      ☀️ Ca Sáng (09:00 – 14:00)
                    </button>
                    {closing >= 19 && (
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => applyPreset(14)}
                        title="Ca Chiều từ 14:00 đến 19:00"
                      >
                        ⛅ Ca Chiều (14:00 – 19:00)
                      </button>
                    )}
                    {closing >= 24 && (
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => applyPreset(19)}
                        title="Ca Tối từ 19:00 đến 24:00"
                      >
                        🌙 Ca Tối (19:00 – 24:00)
                      </button>
                    )}
                  </div>
                </div>

                {/* Shift Count Switcher */}
                <div className="shift-count-selector">
                  <span className="section-label">Cấu trúc ca làm:</span>
                  <div className="shift-count-buttons">
                    <button
                      type="button"
                      className={`btn-count-opt ${selected.shifts.length === 1 ? "count-selected" : ""}`}
                      aria-pressed={selected.shifts.length === 1}
                      onClick={() => setDay({ shifts: presetDefault() })}
                    >
                      1 ca liên tục (5 tiếng)
                    </button>
                    <button
                      type="button"
                      className={`btn-count-opt ${selected.shifts.length === 2 ? "count-selected" : ""}`}
                      aria-pressed={selected.shifts.length === 2}
                      onClick={() =>
                        setDay({
                          shifts: [
                            { start_hour: opening, end_hour: opening + 3 },
                            { start_hour: Math.min(opening + 4, closing - 2), end_hour: Math.min(opening + 4, closing - 2) + 2 },
                          ],
                        })
                      }
                    >
                      2 ca phân đoạn (tổng 5 tiếng)
                    </button>
                  </div>
                </div>

                {/* 2 Shifts Ratio Chips */}
                {selected.shifts.length === 2 && (
                  <div className="duration-split-selector">
                    <span className="section-label">Tỷ lệ chia 2 ca (Tổng 5h):</span>
                    <div className="split-chips-row">
                      {[1, 2, 3, 4].map(dur => (
                        <button
                          type="button"
                          key={dur}
                          className={`chip-ratio ${selectedDuration1 === dur ? "ratio-active" : ""}`}
                          aria-pressed={selectedDuration1 === dur}
                          onClick={() => {
                            const curStart0 = selected.shifts[0].start_hour;
                            const curStart1 = selected.shifts[1].start_hour;
                            setDay({
                              shifts: [
                                { start_hour: curStart0, end_hour: curStart0 + dur },
                                { start_hour: curStart1, end_hour: curStart1 + (5 - dur) },
                              ],
                            });
                          }}
                        >
                          Ca 1: {dur}h + Ca 2: {5 - dur}h
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Visual Daily Timeline Track */}
                <div className="daily-timeline-visual">
                  <div className="timeline-header">
                    <span className="timeline-title">Khung giờ live trong ngày ({opening}h – {closing}h)</span>
                    <span className="timeline-total">Tổng: 5 / 5 tiếng</span>
                  </div>
                  <div className="timeline-slots-strip">
                    {Array.from({ length: closing - opening }, (_, i) => opening + i).map(hour => {
                      const inShift1 =
                        selected.shifts[0] &&
                        hour >= selected.shifts[0].start_hour &&
                        hour < selected.shifts[0].end_hour;
                      const inShift2 =
                        selected.shifts[1] &&
                        hour >= selected.shifts[1].start_hour &&
                        hour < selected.shifts[1].end_hour;
                      const isOverlap = inShift1 && inShift2;

                      return (
                        <div
                          key={hour}
                          className={`timeline-hour-slot ${
                            isOverlap
                              ? "slot-overlap"
                              : inShift1
                              ? "slot-shift-primary"
                              : inShift2
                              ? "slot-shift-secondary"
                              : ""
                          }`}
                          title={`${hour}:00 - ${hour + 1}:00`}
                        >
                          <span className="slot-hour-label">{hour}h</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Hour Selection Blocks for Each Shift */}
                <div className="shifts-editor-grid">
                  {selected.shifts.map((shift, index) => {
                    const duration = shift.end_hour - shift.start_hour;
                    const maxStart = closing - duration;
                    const availableHours = Array.from(
                      { length: Math.max(0, maxStart - opening + 1) },
                      (_, i) => opening + i
                    );

                    return (
                      <div className="single-shift-box" key={index}>
                        <div className="shift-box-header">
                          <strong className="shift-index-title">
                            Ca {index + 1}
                          </strong>
                          <span className="shift-time-range-badge">
                            {shift.start_hour}:00 – {shift.end_hour}:00 ({duration} tiếng)
                          </span>
                        </div>
                        <span className="hour-select-label">Chọn giờ bắt đầu ca:</span>
                        <div className="hour-buttons-compact">
                          {availableHours.map(hour => (
                            <button
                              type="button"
                              key={hour}
                              className={`hour-btn ${shift.start_hour === hour ? "hour-active" : ""}`}
                              aria-pressed={shift.start_hour === hour}
                              onClick={() => shiftStart(index, hour)}
                            >
                              {hour}:00
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!valid(selected) && (
                  <p role="alert" className="validation-alert-box">
                    ⚠️ Hai ca đang trùng giờ hoặc vượt khung giờ mở cửa ({opening}h–{closing}h). Vui lòng chọn lại giờ bắt đầu.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Quick Batch Tools */}
      <div className="batch-actions-bar">
        <span className="batch-title">⚡ Thao tác nhanh cho các ngày còn lại:</span>
        <div className="batch-buttons">
          <button
            type="button"
            className="btn secondary btn-sm"
            disabled={selected.mode !== "work" || !valid(selected)}
            onClick={() =>
              setDays(values =>
                values.map(d =>
                  d.mode === "unset"
                    ? {
                        ...d,
                        mode: "work",
                        shifts: selected.shifts.map(s => ({ ...s })),
                      }
                    : d
                )
              )
            }
          >
            📋 Sao chép ca {formatDayDetails(selected.date).weekday} cho các ngày chưa chọn
          </button>

          <button
            type="button"
            className="btn secondary btn-sm"
            onClick={() =>
              setDays(values =>
                values.map(d => (d.mode === "unset" ? { ...d, mode: "off", shifts: [] } : d))
              )
            }
          >
            🏖️ Tất cả các ngày chưa chọn đều Nghỉ
          </button>
        </div>
      </div>

      {/* Submission Footer */}
      <div className="weekly-submit-footer">
        <div className="submit-disclaimer">
          <strong>Lưu ý:</strong> Vui lòng chọn rõ cả 7 ngày để gửi một lần. Mỗi ngày làm đúng 5 tiếng. Vận hành sẽ điều phối phòng live và duyệt lịch sau khi nhận đăng ký.
        </div>
        <fieldset className="content-fields" disabled={complete !== 7}>
          <SubmitButton>
            {complete === 7
              ? `✓ Gửi đăng ký cả tuần (${workDaysCount} ngày làm · ${offDaysCount} ngày nghỉ)`
              : `Vui lòng hoàn tất đủ 7 ngày trước khi gửi (${complete}/7)`}
          </SubmitButton>
        </fieldset>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}
