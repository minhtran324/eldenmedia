"use client";
import { useEffect, useState, useTransition } from "react";
import { addDays } from "@/lib/scheduling";
import { loadTrialRooms, registerTrialLive, type TrialActionState } from "@/features/scheduling/trial-actions";
import type { TrialIdol, TrialDay } from "@/lib/trial-live";
import type { Room } from "@/types/database";
import { RoomMatrix } from "./room-matrix";
import { useServerClock } from "@/lib/use-server-clock";

export function TrialLiveForm({ role, currentUserId, roster, rooms, operators, today, opening, closing, serverNow, loadRoomsAction = loadTrialRooms }: {
  loadRoomsAction?: typeof loadTrialRooms;
  serverNow: number;
  role: "admin" | "operator"; currentUserId: string; roster: TrialIdol[]; rooms: Room[];
  operators: { id: string; full_name: string }[]; today: string; opening: number; closing: number;
}) {
  const now = useServerClock(serverNow);
  const [operatorId, setOperatorId] = useState(role === "operator" ? currentUserId : operators[0]?.id ?? "");
  const [traineeId, setTraineeId] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState<TrialDay[]>([{ date: addDays(today, 1), start_hour: opening, room_id: "" }]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [result, setResult] = useState<TrialActionState>({});
  const [pending, startTransition] = useTransition();
  const [reload, setReload] = useState(0);
  const [roomResult, setRoomResult] = useState<{ date: string; reload: number; available: { room_id: string; slot_hour: number }[]; error?: string }>();
  const ownRoster = roster.filter(t => t.operator_id === operatorId);
  const normalizedName = name.trim().replace(/\s+/g, " ").toLowerCase();
  const trainee = ownRoster.find(t => t.id === traineeId) ?? (!traineeId ? ownRoster.find(t => t.display_name.toLowerCase() === normalizedName) : undefined);
  const used = Number(trainee?.used_days ?? 0);
  const remaining = Math.max(0, 5 - used);
  const activeDay = days[activeIndex] ?? days[0];
  const roomData = roomResult?.date === activeDay.date && roomResult.reload === reload ? roomResult : undefined;
  const free = new Set((roomData?.available ?? []).map(s => `${s.room_id}:${s.slot_hour}`));
  const duplicate = new Set(days.map(d => d.date)).size !== days.length;
  const maxDay = addDays(today, 90);
  const selectedCount = days.filter(d => d.room_id).length;
  const invalidTime = days.some(d => !d.date || d.date > maxDay || new Date(`${d.date}T${String(d.start_hour).padStart(2, "0")}:00:00+07:00`).getTime() <= now);
  const validHours = Array.from({ length: Math.max(0, closing - opening - 1) }, (_, i) => opening + i);

  useEffect(() => {
    let ignored = false;
    loadRoomsAction(activeDay.date).then(response => {
      if (!ignored) setRoomResult({ date: activeDay.date, reload, ...response });
    }).catch(() => {
      if (!ignored) setRoomResult({ date: activeDay.date, reload, available: [], error: "Không tải được phòng trống. Kiểm tra kết nối rồi tải lại." });
    });
    return () => { ignored = true; };
  }, [activeDay.date, reload, loadRoomsAction]);

  function updateDay(index: number, patch: Partial<TrialDay>) {
    setDays(current => current.map((d, i) => i === index ? { ...d, ...patch, room_id: "" } : d));
  }
  function resizeDays(count: number) {
    const next = days.slice(0, count);
    while (next.length < count) {
      let date = addDays(next[next.length - 1]?.date ?? today, 1);
      while (next.some(d => d.date === date)) date = addDays(date, 1);
      next.push({ date, start_hour: opening, room_id: "" });
    }
    setDays(next); setActiveIndex(Math.min(activeIndex, count - 1));
  }
  function chooseRoom(roomId: string) {
    if (roomId && (![activeDay.start_hour, activeDay.start_hour + 1].every(h => free.has(`${roomId}:${h}`)))) {
      setResult({ error: "Phòng cần trống đủ 2 tiếng liên tục. Hãy chọn phòng khác." }); return;
    }
    setDays(current => current.map((d, i) => i === activeIndex ? { ...d, room_id: roomId } : d));
    setResult({});
  }
  function suggestRoom() {
    const candidate = rooms.filter(r => r.status === "available" && [activeDay.start_hour, activeDay.start_hour + 1].every(h => free.has(`${r.id}:${h}`)))
      .sort((a, b) => Number(b.manager_id === operatorId) - Number(a.manager_id === operatorId) || a.code.localeCompare(b.code))[0];
    if (candidate) chooseRoom(candidate.id); else setResult({ error: "Không có phòng trống liền 2 tiếng tại giờ này. Hãy chọn khung giờ khác." });
  }

  return <section className="surface trial-register">
    <div className="trial-section-title"><div><span className="eyebrow">BƯỚC 1 · IDOL TEST</span><h2>Người đăng ký test live</h2></div>
      <div className="trial-progress" aria-label={`Đã đăng ký ${used} trên 5 ngày`}><strong>{used}<small>/5</small></strong><span>ngày đã đăng ký</span></div></div>
    <form onSubmit={event => {
      event.preventDefault(); if (pending) return;
      const data = new FormData(); data.set("name", name); data.set("trainee_id", traineeId); data.set("operator_id", operatorId); data.set("days", JSON.stringify(days));
      startTransition(async () => {
        try {
          const response = await registerTrialLive(data); setResult(response);
          if (response.traineeId) {
            setTraineeId(response.traineeId); setName(""); setActiveIndex(0); setReload(v => v + 1);
            const last = [...days.map(d => d.date)].sort().at(-1) ?? today;
            setDays([{ date: addDays(last, 1), start_hour: opening, room_id: "" }]);
          }
        } catch { setResult({ error: "Chưa lưu được lịch. Kiểm tra kết nối và tải lại trang trước khi thử lại." }); }
      });
    }}>
      <fieldset disabled={pending} className="trial-fields">
        <div className="trial-person-grid">
          {role === "admin" && <label>Vận hành phụ trách<select value={operatorId} required onChange={e => { setOperatorId(e.target.value); setTraineeId(""); setName(""); }}>
            <option value="" disabled>Chọn vận hành</option>{operators.map(op => <option key={op.id} value={op.id}>{op.full_name}</option>)}</select></label>}
          <label>Idol mới hoặc đăng ký tiếp<select value={traineeId} onChange={e => { setTraineeId(e.target.value); setName(""); setResult({}); }}>
            <option value="">+ Nhập tên Idol test mới</option>{ownRoster.map(t => <option key={t.id} value={t.id}>{t.display_name} · {t.used_days}/5 ngày</option>)}</select></label>
          {!traineeId && <label>Tên Idol test live<input value={name} minLength={2} maxLength={100} required placeholder="Nhập tên Idol test" onChange={e => setName(e.target.value)} /></label>}
        </div>
        <p className="hint">Không cần tài khoản hay check-in/out. Tên trùng trong cùng team sẽ tiếp tục hồ sơ test đã có.</p>
        <div className="trial-section-title"><div><span className="eyebrow">BƯỚC 2 · CHỌN NGÀY & GIỜ</span><h3>{remaining} ngày test còn lại</h3></div>
          <div className="trial-inline-actions" aria-label="Số ngày đăng ký">{[1, 2, 3, 4, 5].map(count => <button type="button" key={count} disabled={count > remaining}
            aria-pressed={days.length === count} className={`btn ${days.length === count ? "primary" : "secondary"} btn-compact`} onClick={() => resizeDays(count)}>{count} ngày</button>)}</div></div>
        {remaining === 0 && <p className="feedback" role="status">Idol này đã đủ 5 ngày test. Các lịch đã qua được giữ lại trong lịch sử.</p>}
        <div className="trial-day-strip">{days.map((day, index) => {
          const room = rooms.find(r => r.id === day.room_id);
          return <article key={index} className={`trial-day-card ${activeIndex === index ? "trial-day-active" : ""}`}>
            <div className="trial-day-top"><strong>Ngày {index + 1}</strong><span className="trial-badge">2 TIẾNG</span></div>
            <label>Ngày test {index + 1}<input type="date" value={day.date} min={today} max={maxDay} required onChange={e => { updateDay(index, { date: e.target.value }); setActiveIndex(index); }} /></label>
            <label>Giờ bắt đầu ngày {index + 1}<select value={day.start_hour} onChange={e => { updateDay(index, { start_hour: Number(e.target.value) }); setActiveIndex(index); }}>
              {validHours.map(hour => <option key={hour} value={hour} disabled={new Date(`${day.date}T${String(hour).padStart(2, "0")}:00:00+07:00`).getTime() <= now}>{hour}:00 → {hour + 2}:00</option>)}</select></label>
            <button type="button" className={`btn ${day.room_id ? "secondary" : "primary"}`} onClick={() => setActiveIndex(index)}>
              {room ? `${room.code} · Đổi phòng` : "Chọn phòng"}</button>
            <span className="hint">{room ? (room.manager_id === operatorId || role === "admin" ? "Duyệt trực tiếp" : "Cần chủ phòng duyệt") : "Chưa chọn phòng"}</span>
          </article>;
        })}</div>
        {duplicate && <p className="feedback error" role="alert">Các ngày không được trùng nhau.</p>}
        {invalidTime && <p className="feedback error" role="alert">Chọn giờ bắt đầu chưa qua và ngày trong 90 ngày tới.</p>}
        <div className="trial-room-picker"><div className="trial-section-title"><div><span className="eyebrow">BƯỚC 3 · XẾP PHÒNG</span>
          <h3>Ngày {activeIndex + 1} · {activeDay.date.split("-").reverse().join("/")} · {activeDay.start_hour}:00–{activeDay.start_hour + 2}:00</h3></div>
          <div className="trial-inline-actions"><button type="button" className="btn secondary btn-compact" disabled={!roomData || Boolean(roomData.error)} onClick={suggestRoom}>Gợi ý phòng</button>
            <button type="button" className="btn secondary btn-compact" onClick={() => chooseRoom("")}>Bỏ chọn phòng</button>
            <button type="button" className="btn secondary btn-compact" onClick={() => setReload(v => v + 1)}>Tải phòng trống</button></div></div>
          {!roomData ? <p role="status">Đang tải phòng trống…</p> : roomData.error ? <p className="feedback error" role="alert">{roomData.error}</p>
            : <RoomMatrix rooms={rooms} available={roomData.available} managerId={operatorId} opening={opening} closing={closing}
              shifts={[{ start_hour: activeDay.start_hour, end_hour: activeDay.start_hour + 2 }]}
              slots={activeDay.room_id ? [activeDay.start_hour, activeDay.start_hour + 1].map(hour => ({ hour, room_id: activeDay.room_id })) : []}
              onChoose={(_hour, room) => chooseRoom(room)} onAssign={(_hours, room) => chooseRoom(room)} />}
          <p className="hint">Một phòng trống đủ 2 tiếng cho mỗi ngày test. Phòng team khác phải được chủ phòng duyệt và chưa giữ chỗ trong thời gian chờ.</p>
        </div>
        <div className="trial-submit-bar"><div><strong>{days.length} ngày · {days.length * 2} tiếng test</strong><p className="hint">Đã chọn phòng: {selectedCount}/{days.length} ngày · Cộng dồn sau đăng ký: {used + days.length}/5 ngày</p></div>
          <button className="btn primary" type="submit" disabled={pending || remaining < days.length || duplicate || invalidTime || selectedCount !== days.length || !operatorId}>{pending ? "Đang lưu lịch…" : `Đăng ký ${days.length} ngày test`}</button></div>
      </fieldset>
      {result.error && <p className="feedback error" role="alert">{result.error}</p>}
      {result.success && <p className="feedback success" role="status">{result.success}</p>}
    </form>
  </section>;
}
