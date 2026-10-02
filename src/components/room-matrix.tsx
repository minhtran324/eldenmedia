"use client";

import { useState } from "react";
import type { Room, RoomSlot, Shift } from "@/types/database";

export function RoomMatrix({
  rooms,
  available,
  managerId,
  slots = [],
  shifts = [],
  opening = 9,
  closing = 24,
  onChoose,
  onAssign,
  bookings = [],
}: {
  bookings?: { room_id: string; hour: number; label: string }[];
  rooms: Room[];
  available: { room_id: string; slot_hour: number }[];
  managerId: string;
  slots?: RoomSlot[];
  shifts?: Shift[];
  opening?: number;
  closing?: number;
  onChoose?: (hour: number, room: string) => void;
  onAssign?: (hours: number[], room: string) => void;
}) {
  const [filterMode, setFilterMode] = useState<"all" | "own" | "studio">("all");
  const [focusTargetHours, setFocusTargetHours] = useState(shifts.length > 0);

  const allHours = Array.from({ length: Math.max(0, closing - opening) }, (_, i) => opening + i);
  const target = new Set(
    shifts.flatMap(s => Array.from({ length: s.end_hour - s.start_hour }, (_, i) => s.start_hour + i))
  );

  // If focus mode is ON and target hours exist, only show target hours; otherwise show all
  const hours = focusTargetHours && target.size > 0 ? allHours.filter(h => target.has(h)) : allHours;

  const free = new Set(available.map(v => `${v.room_id}:${v.slot_hour}`));
  const occupied = new Map(bookings.map(b => [`${b.room_id}:${b.hour}`, b.label]));
  const selected = new Map(slots.map(s => [s.hour, s.room_id]));

  const visible = rooms
    .filter(r => {
      if (filterMode === "own") return r.manager_id === managerId;
      if (filterMode === "studio") return r.room_type === "studio";
      return true;
    })
    .sort(
      (a, b) =>
        Number(b.manager_id === managerId) - Number(a.manager_id === managerId) ||
        a.code.localeCompare(b.code)
    );

  return (
    <div className="room-matrix-container">
      {/* Controls Bar */}
      <div className="matrix-toolbar">
        <div className="matrix-filter-group">
          <button
            type="button"
            className={`btn secondary btn-compact ${filterMode === "all" ? "filter-active" : ""}`}
            onClick={() => setFilterMode("all")}
          >
            Tất cả ({rooms.length})
          </button>
          <button
            type="button"
            className={`btn secondary btn-compact ${filterMode === "own" ? "filter-active" : ""}`}
            onClick={() => setFilterMode("own")}
          >
            🏢 Cùng team ({rooms.filter(r => r.manager_id === managerId).length})
          </button>
          <button
            type="button"
            className={`btn secondary btn-compact ${filterMode === "studio" ? "filter-active" : ""}`}
            onClick={() => setFilterMode("studio")}
          >
            🎙️ Studio ({rooms.filter(r => r.room_type === "studio").length})
          </button>
        </div>

        {target.size > 0 && (
          <div className="matrix-view-toggle">
            <button
              type="button"
              className={`matrix-toggle-btn ${focusTargetHours ? "active" : ""}`}
              onClick={() => setFocusTargetHours(!focusTargetHours)}
            >
              <span>{focusTargetHours ? `🔍 Đang gom gọn: Chỉ hiện ${target.size} giờ đăng ký` : `↔ Xem toàn bộ khung giờ (${opening}h–${closing}h)`}</span>
              <span className="toggle-badge">{focusTargetHours ? "Gọn" : "Đầy đủ"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Legend & Instructions */}
      <div className="matrix-legend">
        <div className="legend-item">
          <span className="legend-dot dot-free" />
          <span>Trống (Khả dụng)</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-chosen" />
          <span>Đang chọn cho ca này</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot dot-busy" />
          <span>Đã có ca / Đang live</span>
        </div>
        <div className="legend-hint">
          {target.size > 0 ? "Bấm vào ô giờ để chọn phòng, hoặc bấm nút 'Gán nhanh' ở cột phải." : "Bảng hiển thị tình trạng phòng trống."}
        </div>
      </div>

      {/* Compact Responsive Table Matrix */}
      <div className="room-matrix-scroll" tabIndex={0} aria-label="Bảng ma trận phòng theo giờ">
        <table className="room-matrix-table">
          <thead>
            <tr>
              <th scope="col" className="col-room-header">
                Phòng livestream
              </th>
              {hours.map(h => (
                <th
                  scope="col"
                  key={h}
                  className={`col-hour-header ${target.has(h) ? "target-highlight" : ""}`}
                >
                  <span className="hour-main">{h}:00</span>
                  <span className="hour-sub">{h + 1}:00</span>
                </th>
              ))}
              {onAssign && <th scope="col" className="col-action-header">Gán nhanh</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map(room => {
              const isOwnTeam = room.manager_id === managerId;
              const isAvailable = room.status === "available";

              return (
                <tr key={room.id} className={!isAvailable ? "row-inactive" : ""}>
                  {/* Room Info Cell */}
                  <th scope="row" className="cell-room-info">
                    <div className="room-info-block">
                      <div className="room-title-row">
                        <strong className="room-code">{room.code}</strong>
                        {room.room_type === "studio" && <span className="room-type-tag">Studio</span>}
                      </div>
                      <div className="room-team-badge">
                        <span className={`team-pill ${isOwnTeam ? "pill-own" : "pill-borrow"}`}>
                          {isOwnTeam ? "Cùng team" : "Cần mượn"}
                        </span>
                      </div>
                    </div>
                  </th>

                  {/* Hourly Slot Cells */}
                  {hours.map(h => {
                    const isHourFree = isAvailable && free.has(`${room.id}:${h}`);
                    const isChosen = selected.get(h) === room.id;
                    const bookingLabel = occupied.get(`${room.id}:${h}`);
                    const isTarget = target.has(h);

                    return (
                      <td
                        key={h}
                        className={`matrix-slot-cell ${
                          isChosen
                            ? "cell-chosen"
                            : isHourFree
                            ? "cell-free"
                            : "cell-busy"
                        } ${isTarget ? "cell-target-hour" : ""}`}
                      >
                        <button
                          type="button"
                          disabled={!onChoose || !isTarget || !isHourFree}
                          aria-pressed={isChosen}
                          className={`slot-btn ${isChosen ? "slot-selected" : ""}`}
                          onClick={() => onChoose?.(h, isChosen ? "" : room.id)}
                          title={
                            isChosen
                              ? `Đang chọn cho ca (${room.code})`
                              : isHourFree
                              ? `Trống: Bấm để chọn ${room.code} lúc ${h}:00`
                              : bookingLabel
                              ? `Đã bận: ${bookingLabel}`
                              : "Không khả dụng"
                          }
                        >
                          {isChosen ? (
                            <span className="slot-check">✓</span>
                          ) : isHourFree ? (
                            <span className="slot-plus">+</span>
                          ) : (
                            <span className="slot-busy-indicator">
                              {bookingLabel ? bookingLabel.slice(0, 4) : "—"}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}

                  {/* Quick Assign Column */}
                  {onAssign && (
                    <td className="cell-quick-assign">
                      <div className="quick-assign-buttons">
                        {shifts.map((shift, i) => {
                          const sh = hours.filter(h => h >= shift.start_hour && h < shift.end_hour);
                          const canAssignShift = isAvailable && sh.length > 0 && sh.every(h => free.has(`${room.id}:${h}`));

                          return (
                            <button
                              key={i}
                              type="button"
                              className="btn-assign-shift"
                              disabled={!canAssignShift}
                              onClick={() => onAssign(sh, room.id)}
                              title={`Gán trọn Ca ${i + 1} (${shift.start_hour}h–${shift.end_hour}h)`}
                            >
                              Ca {i + 1} ({shift.end_hour - shift.start_hour}h)
                            </button>
                          );
                        })}

                        {shifts.length > 1 && (
                          <button
                            type="button"
                            className="btn-assign-all"
                            disabled={!isAvailable || [...target].some(h => !free.has(`${room.id}:${h}`))}
                            onClick={() => onAssign([...target], room.id)}
                            title={`Gán toàn bộ ${target.size} giờ vào phòng này`}
                          >
                            Cả {target.size}h
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="matrix-empty">
            <p>Không tìm thấy phòng nào phù hợp với bộ lọc hiện tại.</p>
          </div>
        )}
      </div>
    </div>
  );
}
