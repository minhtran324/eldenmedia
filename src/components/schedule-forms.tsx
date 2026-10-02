"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RoomMatrix } from "./room-matrix";
import { DecisionButton } from "./weekly-registration";
import { useActionState, useState } from "react";
import { submitSchedule, prepareSchedule, reviewSchedule } from "@/features/scheduling/actions";
import { shiftHours, suggestRooms, weekStart, vietnamToday } from "@/lib/scheduling";
import { SubmitButton } from "./account-forms";
import { ActionFeedback } from "./toast";
import type { Room, ScheduleRequest, Shift, RoomSlot } from "@/types/database";

export function ScheduleForm({
  idols,
  ownId,
  day,
  minDay,
  maxDay,
  opening,
  closing,
  mode = "register",
}: {
  mode?: "register" | "change" | "cancel";
  idols: { id: string; full_name: string }[];
  ownId?: string;
  day: string;
  minDay: string;
  maxDay: string;
  opening: number;
  closing: number;
}) {
  const [state, action] = useActionState(submitSchedule, {});
  const [shiftCount, setShiftCount] = useState<1 | 2>(1);
  const [splitRatio, setSplitRatio] = useState<2 | 3 | 1 | 4>(2); // duration of shift 1 for 2-shift mode

  const [shifts, setShifts] = useState<Shift[]>([
    { start_hour: opening, end_hour: Math.min(opening + 5, closing) },
  ]);

  const cancel = mode === "cancel";
  const total = shifts.reduce((n, s) => n + s.end_hour - s.start_hour, 0);
  const isValidTotal = total === 5;
  const isOverlapping =
    shifts.length === 2 &&
    shifts[0].start_hour < shifts[1].end_hour &&
    shifts[1].start_hour < shifts[0].end_hour;

  // Preset 1-shift shortcuts
  const oneShiftPresets = [
    { label: "Ca sáng (09:00 – 14:00)", start: 9, end: 14 },
    { label: "Ca chiều (14:00 – 19:00)", start: 14, end: 19 },
    { label: "Ca tối (19:00 – 24:00)", start: 19, end: 24 },
  ];

  function apply1ShiftPreset(start: number, end: number) {
    setShiftCount(1);
    setShifts([{ start_hour: start, end_hour: end }]);
  }

  function set1ShiftStart(start: number) {
    setShiftCount(1);
    setShifts([{ start_hour: start, end_hour: Math.min(start + 5, closing) }]);
  }

  function set2ShiftRatio(s1Duration: 1 | 2 | 3 | 4) {
    setSplitRatio(s1Duration);
    const s2Duration = 5 - s1Duration;
    const s1Start = shifts[0]?.start_hour ?? opening;
    const s1End = s1Start + s1Duration;
    // Default s2 start after s1
    const s2Start = Math.min(s1End + 1, closing - s2Duration);
    const s2End = s2Start + s2Duration;

    setShifts([
      { start_hour: s1Start, end_hour: s1End },
      { start_hour: s2Start, end_hour: s2End },
    ]);
  }

  function updateShiftStart(index: number, start: number) {
    const currentDuration = shifts[index].end_hour - shifts[index].start_hour;
    const newEnd = start + currentDuration;
    setShifts(shifts.map((s, i) => (i === index ? { start_hour: start, end_hour: newEnd } : s)));
  }

  return (
    <form action={action} className="schedule-form-card">
      <div className="schedule-form-header">
        <div>
          <span className="section-eyebrow">
            {cancel ? "YÊU CẦU HỦY NGÀY" : mode === "change" ? "ĐỔI LỊCH ĐÃ DUYỆT" : "ĐĂNG KÝ CA MỚI"}
          </span>
          <h3 className="form-title">
            {cancel ? "Hủy ngày làm việc" : mode === "change" ? "Thay đổi ca live trong ngày" : "Đăng ký ca live (tổng đúng 5 tiếng)"}
          </h3>
        </div>
      </div>

      <div className="schedule-fields-row">
        {ownId ? (
          <input type="hidden" name="idol_id" value={ownId} />
        ) : (
          <div className="input-group">
            <label htmlFor="select-idol">Idol phụ trách</label>
            <select id="select-idol" name="idol_id" required defaultValue="">
              <option value="" disabled>
                Chọn Idol
              </option>
              {idols.map(i => (
                <option key={i.id} value={i.id}>
                  {i.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="input-group">
          <label htmlFor="select-day">Ngày làm việc</label>
          <input
            id="select-day"
            name="day"
            type="date"
            required
            defaultValue={day}
            min={minDay}
            max={maxDay}
          />
        </div>
      </div>

      <input type="hidden" name="cancel" value={String(cancel)} />

      {!cancel && (
        <div className="shift-builder-section">
          <input type="hidden" name="shift_count" value={shifts.length} />

          {/* Mode Switch: 1 Ca vs 2 Ca */}
          <div className="shift-mode-selector">
            <button
              type="button"
              className={`mode-btn ${shiftCount === 1 ? "active" : ""}`}
              onClick={() => {
                setShiftCount(1);
                apply1ShiftPreset(opening, opening + 5);
              }}
            >
              <span className="mode-btn-icon">⚡</span>
              <div>
                <strong>1 Ca làm việc</strong>
                <small>5 tiếng liên tục</small>
              </div>
            </button>

            <button
              type="button"
              className={`mode-btn ${shiftCount === 2 ? "active" : ""}`}
              onClick={() => {
                setShiftCount(2);
                set2ShiftRatio(2);
              }}
            >
              <span className="mode-btn-icon">🔄</span>
              <div>
                <strong>2 Ca trong ngày</strong>
                <small>Tổng đúng 5 tiếng (nghỉ giữa ca)</small>
              </div>
            </button>
          </div>

          {/* 1-Shift Quick Presets & Start Hour Slider */}
          {shiftCount === 1 && (
            <div className="shift-config-box">
              <span className="config-label">Chọn nhanh khung giờ chuẩn:</span>
              <div className="preset-chips-row">
                {oneShiftPresets.map(preset => {
                  const isCurrent =
                    shifts[0].start_hour === preset.start && shifts[0].end_hour === preset.end;
                  return (
                    <button
                      key={preset.start}
                      type="button"
                      className={`preset-chip ${isCurrent ? "chip-active" : ""}`}
                      onClick={() => apply1ShiftPreset(preset.start, preset.end)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <div className="hour-picker-group">
                <span className="config-label">Hoặc chọn giờ bắt đầu ca (5 tiếng):</span>
                <div className="hour-buttons-grid">
                  {Array.from({ length: closing - opening - 5 + 1 }, (_, i) => opening + i).map(h => {
                    const isSelected = shifts[0].start_hour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        className={`hour-btn ${isSelected ? "hour-selected" : ""}`}
                        onClick={() => set1ShiftStart(h)}
                      >
                        {h}:00 → {h + 5}:00
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 2-Shift Ratios & Start Hours */}
          {shiftCount === 2 && (
            <div className="shift-config-box">
              <span className="config-label">Chọn tỉ lệ chia thời lượng (Ca 1 + Ca 2 = 5 tiếng):</span>
              <div className="preset-chips-row">
                {([2, 3, 1, 4] as const).map(r1 => (
                  <button
                    key={r1}
                    type="button"
                    className={`preset-chip ${splitRatio === r1 ? "chip-active" : ""}`}
                    onClick={() => set2ShiftRatio(r1)}
                  >
                    Ca 1: {r1} tiếng + Ca 2: {5 - r1} tiếng
                  </button>
                ))}
              </div>

              <div className="shifts-double-grid">
                {shifts.map((shift, idx) => {
                  const duration = shift.end_hour - shift.start_hour;
                  return (
                    <div key={idx} className="single-shift-card">
                      <div className="single-shift-header">
                        <strong className="single-shift-title">
                          Ca {idx + 1} ({duration} tiếng)
                        </strong>
                        <span className="single-shift-time">
                          {shift.start_hour}:00 → {shift.end_hour}:00
                        </span>
                      </div>

                      <div className="hour-buttons-grid compact">
                        {Array.from(
                          { length: closing - opening - duration + 1 },
                          (_, i) => opening + i
                        ).map(h => {
                          const isSel = shift.start_hour === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              className={`hour-btn-sm ${isSel ? "hour-selected" : ""}`}
                              onClick={() => updateShiftStart(idx, h)}
                            >
                              {h}:00
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isOverlapping && (
                <p className="validation-alert" role="alert">
                  ⚠️ Hai ca đang bị chồng lấn giờ. Vui lòng chọn giờ bắt đầu Ca 2 sau khi Ca 1 kết thúc.
                </p>
              )}
            </div>
          )}

          {/* Hidden inputs for form action submission */}
          {shifts.map((s, i) => (
            <span key={i}>
              <input type="hidden" name={`start_${i}`} value={s.start_hour} />
              <input type="hidden" name={`end_${i}`} value={s.end_hour} />
            </span>
          ))}

          {/* Visual Timeline & Progress Indicator */}
          <div className="schedule-summary-bar">
            <div className="timeline-visual-wrap">
              <span className="timeline-label">Sơ đồ thời gian trong ngày:</span>
              <div className="timeline-track">
                {Array.from({ length: closing - opening }, (_, i) => opening + i).map(h => {
                  const isInShift1 =
                    h >= shifts[0].start_hour && h < shifts[0].end_hour;
                  const isInShift2 =
                    shifts.length === 2 &&
                    h >= shifts[1].start_hour &&
                    h < shifts[1].end_hour;

                  return (
                    <div
                      key={h}
                      className={`timeline-slot ${
                        isInShift1
                          ? "slot-shift-1"
                          : isInShift2
                          ? "slot-shift-2"
                          : ""
                      }`}
                      title={`${h}:00–${h + 1}:00`}
                    >
                      <span className="slot-num">{h}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="total-badge-block">
              <span className="total-label">Tổng thời lượng:</span>
              <strong className={`total-count ${isValidTotal && !isOverlapping ? "valid" : "invalid"}`}>
                {total} / 5 tiếng {isValidTotal && !isOverlapping ? "✓" : "✗"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* Note / Reason */}
      <div className="input-group">
        <label htmlFor="reason-field">
          {cancel ? "Lý do hủy ngày (bắt buộc)" : "Lý do / Ghi chú cho Vận hành"}
        </label>
        <input
          id="reason-field"
          name="reason"
          maxLength={500}
          required={cancel}
          placeholder={cancel ? "Nhập lý do cần hủy ngày làm việc này..." : "Ghi chú thêm (nếu có)..."}
        />
      </div>

      <ActionFeedback state={state} />

      <div className="form-submit-row">
        <SubmitButton busy="Đang gửi yêu cầu…">
          {cancel
            ? "Xác nhận gửi yêu cầu hủy ngày"
            : mode === "change"
            ? "Xác nhận gửi yêu cầu đổi lịch"
            : "Xác nhận gửi lịch live"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function ScheduleActions(props: React.ComponentProps<typeof ScheduleForm>) {
  const [mode, setMode] = useState<"register" | "change" | "cancel" | null>(null);

  return (
    <div className="schedule-actions-container">
      <div className="schedule-action-buttons">
        {props.ownId ? (
          <>
            <Link className="btn primary action-link-btn" href="/idol/schedule/register">
              <span>📅 Đăng ký cả tuần (7 ngày)</span>
            </Link>
            <Link
              className="btn secondary action-link-btn"
              href={`/idol/schedule/register?week=${weekStart(vietnamToday())}`}
            >
              <span>Xin đăng ký trễ</span>
            </Link>
          </>
        ) : (
          <button
            type="button"
            className={`btn secondary action-link-btn ${mode === "register" ? "btn-active" : ""}`}
            onClick={() => setMode(mode === "register" ? null : "register")}
          >
            <span>+ Tạo lịch cho Idol</span>
          </button>
        )}

        <button
          type="button"
          className={`btn secondary action-link-btn ${mode === "change" ? "btn-active" : ""}`}
          onClick={() => setMode(mode === "change" ? null : "change")}
        >
          <span>🔄 Đổi lịch ngày</span>
        </button>

        <button
          type="button"
          className={`btn secondary action-link-btn ${mode === "cancel" ? "btn-active" : ""}`}
          onClick={() => setMode(mode === "cancel" ? null : "cancel")}
        >
          <span>❌ Hủy ngày</span>
        </button>

        {mode && (
          <button
            type="button"
            className="btn secondary close-mode-btn"
            onClick={() => setMode(null)}
          >
            Đóng biểu mẫu ✕
          </button>
        )}
      </div>

      {mode && (
        <div className="expanded-form-drawer">
          <ScheduleForm key={mode} {...props} mode={mode} />
        </div>
      )}
    </div>
  );
}

export function DecisionForm({
  id,
  revision,
  borrow = false,
}: {
  id: string;
  revision: number;
  borrow?: boolean;
}) {
  const [state, action] = useActionState(reviewSchedule, {});

  return (
    <form action={action} className="decision-form-box">
      <input type="hidden" name="request_id" value={id} />
      <input type="hidden" name="revision" value={revision} />

      <div className="input-group">
        <label htmlFor={`reason-${id}`}>Lý do (bắt buộc khi từ chối)</label>
        <input
          id={`reason-${id}`}
          name="reason"
          maxLength={500}
          placeholder="Nhập lý do nếu bạn từ chối..."
        />
      </div>

      <ActionFeedback state={state} />

      <div className="inline-actions">
        {borrow && <DecisionButton value="true">✓ Đồng ý cho mượn phòng</DecisionButton>}
        <DecisionButton value="false">✕ Từ chối yêu cầu</DecisionButton>
      </div>
    </form>
  );
}

export function RoomPlanner({
  request,
  rooms,
  available,
  managerId,
  opening = 9,
  closing = 24,
  reviewerRole = "operator",
  bookings = [],
}: {
  bookings?: { room_id: string; hour: number; label: string }[];
  request: ScheduleRequest;
  rooms: Room[];
  available: { room_id: string; slot_hour: number }[];
  managerId: string;
  opening?: number;
  closing?: number;
  reviewerRole?: "admin" | "operator";
}) {
  const [state, action] = useActionState(prepareSchedule, {});
  const [slots, setSlots] = useState<RoomSlot[]>(request.details.rooms ?? []);
  const [notice, setNotice] = useState("");
  const router = useRouter();

  const hours = shiftHours(request.details.shifts);
  const free = new Set(available.map(v => `${v.room_id}:${v.slot_hour}`));
  const isFree = (room: string, hour: number) => free.has(`${room}:${hour}`);

  const needsBorrow =
    reviewerRole !== "admin" &&
    slots.some(s => rooms.find(r => r.id === s.room_id)?.manager_id !== managerId);

  const assignedCount = hours.filter(h => slots.some(s => s.hour === h && isFree(s.room_id, h))).length;
  const isReady =
    request.kind === "schedule_cancel" ||
    (hours.length === 5 && hours.every(h => slots.some(s => s.hour === h && isFree(s.room_id, h))));

  function choose(hour: number, room: string) {
    if (room && !isFree(room, hour)) return;
    setSlots(values => [
      ...values.filter(s => s.hour !== hour),
      ...(room ? [{ hour, room_id: room }] : []),
    ]);
  }

  function handleAutoSuggest() {
    const suggested = suggestRooms(
      request.details.shifts,
      rooms.filter(r => r.status === "available"),
      available,
      managerId
    );
    if (suggested) {
      setSlots(suggested);
      setNotice("✨ Đã gợi ý phương án phòng tối ưu: ít chuyển phòng nhất, ưu tiên phòng cùng team.");
    } else {
      setNotice("⚠️ Không đủ phòng trống khả dụng cho các giờ Idol đăng ký.");
    }
  }

  return (
    <form action={action} className="room-planner-container">
      <input type="hidden" name="request_id" value={request.id} />
      <input type="hidden" name="revision" value={request.revision} />
      <input
        type="hidden"
        name="slots"
        value={JSON.stringify(request.kind === "schedule_cancel" ? [] : slots)}
      />

      {request.kind === "schedule_cancel" ? (
        <div className="cancel-notice-box">
          <p>
            ℹ️ Duyệt yêu cầu này sẽ hủy toàn bộ các ca trong ngày và giải phóng phòng đã xếp cho các Idol khác.
          </p>
        </div>
      ) : (
        <>
          {request.details.prepared_by && (
            <div className="borrow-notice-banner">
              <span>⏳ Đang chờ chủ phòng duyệt mượn phòng. Bạn có thể xếp lại phương án khác nếu cần.</span>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="planner-action-bar">
            <button
              type="button"
              className="btn primary btn-suggest"
              onClick={handleAutoSuggest}
            >
              <span>✨ Gợi ý tự động xếp phòng (Tối ưu)</span>
            </button>

            <button
              type="button"
              className="btn secondary btn-compact"
              onClick={() => {
                setSlots([]);
                setNotice("");
              }}
            >
              Xóa các ô đã chọn
            </button>

            <button
              type="button"
              className="btn secondary btn-compact"
              onClick={() => router.refresh()}
            >
              🔄 Tải lại phòng trống
            </button>
          </div>

          {notice && <div className="notice-banner">{notice}</div>}

          {/* Progress Header */}
          <div className="planner-status-strip">
            <div className="progress-info">
              <span className="progress-title">Tiến độ xếp phòng:</span>
              <strong className={`progress-numbers ${assignedCount === 5 ? "complete" : ""}`}>
                {assignedCount} / 5 giờ đã xếp
              </strong>
            </div>

            <div className="borrow-status-badge">
              {needsBorrow ? (
                <span className="badge-borrow-needed">⚠️ Có phòng khác team — Cần gửi chủ phòng duyệt</span>
              ) : (
                <span className="badge-own-team">✓ Toàn bộ phòng cùng team — Duyệt trực tiếp</span>
              )}
            </div>
          </div>

          {/* The Smart Room Matrix */}
          <RoomMatrix
            rooms={rooms}
            bookings={bookings}
            available={available}
            managerId={managerId}
            slots={slots}
            shifts={request.details.shifts}
            opening={opening}
            closing={closing}
            onChoose={choose}
            onAssign={(assigned, room) => {
              if (assigned.every(h => isFree(room, h))) {
                setSlots(values => [
                  ...values.filter(s => !assigned.includes(s.hour)),
                  ...assigned.map(hour => ({ hour, room_id: room })),
                ]);
              }
            }}
          />

          <p className="planner-disclaimer">
            💡 Phòng bận có thể do lịch đã duyệt hoặc ca chưa checkout. Hệ thống sẽ tự động kiểm tra trùng phòng lần cuối tại thời điểm bạn bấm duyệt.
          </p>
        </>
      )}

      <ActionFeedback state={state} />

      <div className="planner-submit-footer">
        <fieldset className="content-fields" disabled={!isReady}>
          <SubmitButton busy="Đang lưu xếp phòng…">
            {request.kind === "schedule_cancel"
              ? "Duyệt hủy ngày"
              : needsBorrow
              ? "Gửi yêu cầu mượn phòng cho chủ phòng"
              : "Duyệt lịch & Hoàn tất xếp phòng"}
          </SubmitButton>
        </fieldset>
      </div>
    </form>
  );
}
