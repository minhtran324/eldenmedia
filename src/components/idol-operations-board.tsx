"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { manageRoomTurn } from "@/features/operations/actions";
import { groupIdolOperations, lateMinutes, entryState, type OperationRow } from "@/lib/operations-flow";
import type { Role } from "@/types/database";

const time = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }) : "—";
const labels: Record<string, string> = { waiting: "Chưa check-in", in_room: "Đang trong phòng", completed: "Đã trả phòng", skipped: "Đã bỏ qua", blocked: "Chờ phòng / chờ lượt", early: "Chưa đến giờ", ready: "Đến lượt", overdue: "Quá hạn check-in" };
function TurnControls({ row }: { row: OperationRow }) {
  const [state, action, pending] = useActionState(manageRoomTurn, {});
  return <form action={action} className="turn-controls">
    <input type="hidden" name="segment" value={row.segment_id} />
    <label>Lý do điều phối<input name="reason" maxLength={500} placeholder="Ví dụ: Idol nghỉ, phòng cần vệ sinh…" /></label>
    <div className="operation-actions">
      {row.status === "waiting" && <button className="btn secondary" name="action" value="skip" disabled={pending}>Bỏ qua lượt này</button>}
      {row.room_on_hold ? <button className="btn" name="action" value="release" disabled={pending}>Phòng đã sẵn sàng</button> : <button className="btn secondary" name="action" value="hold" disabled={pending}>Phòng chưa sẵn sàng</button>}
    </div>
    {state.error && <p className="feedback error" role="alert">{state.error}</p>}{state.success && <p className="feedback success" role="status">{state.success}</p>}
  </form>;
}
export function IdolOperationsBoard({ rows, role, serverNow, initialIdol = "" }: { rows: OperationRow[]; role: Role; serverNow: number; initialIdol?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [now, setNow] = useState(serverNow);
  const [idolFilter, setIdolFilter] = useState(initialIdol);
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => setNow(serverNow + Date.now() - start), 1000);
    const refresh = () => { if (!document.hidden && navigator.onLine) router.refresh(); };
    const poll = role === "idol" ? null : setInterval(refresh, 15000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); window.addEventListener("notifications-changed", refresh);
    return () => { clearInterval(tick); if (poll) clearInterval(poll); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); window.removeEventListener("notifications-changed", refresh); };
  }, [role, router, serverNow]);
  const groups = useMemo(() => groupIdolOperations(rows), [rows]);
  const filtered = groups.filter(g => (!idolFilter || g.idol_id === idolFilter) && `${g.username} ${g.idol_name}`.toLowerCase().includes(search.toLowerCase().trim())
    && (filter === "all" || (filter === "late" ? g.late_minutes > 0 : filter === "open" ? g.rows.some(r => r.status === "in_room") : g.rows.some(r => r.status === "waiting"))));
  return <section className="surface idol-board">
    <div className="operation-heading"><div><h2>{role === "idol" ? "Lịch sử của tôi" : "Theo dõi theo Idol"}</h2><p>Mỗi Idol một nhóm theo ngày, bao gồm mọi phòng đã sử dụng và lịch sử nhận/trả máy.</p></div><button type="button" className="btn secondary" onClick={() => router.refresh()}>Tải mới</button></div>
    <div className="operation-stats"><span><strong>{groups.length}</strong> Idol / ngày</span><span><strong>{groups.filter(g => g.rows.some(r => r.status === "in_room")).length}</strong> đang trong phòng</span><span className="important-text"><strong>{groups.filter(g => g.late_minutes > 0).length}</strong> có vi phạm trễ</span></div>
    <div className="operation-filters"><label>Tìm Idol<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Username hoặc họ tên" /></label><div className="operation-actions">{[["all", "Tất cả"], ["open", "Đang trong phòng"], ["waiting", "Chưa check-in"], ["late", "Vi phạm trễ"]].map(([key, label]) => <button type="button" className={`btn ${filter === key ? "" : "secondary"}`} aria-pressed={filter === key} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div>{idolFilter && <button className="btn secondary" onClick={() => setIdolFilter("")}>Bỏ lọc Idol được thông báo</button>}</div>
    {!filtered.length && <p className="empty-state">Không có ca phù hợp với bộ lọc.</p>}
    {filtered.map(group => <details key={group.key} className={`idol-day ${group.late_minutes ? "has-violation" : ""}`} open={role === "idol" || Boolean(idolFilter)}>
      <summary><div><strong>@{group.username}</strong><span>{group.idol_name} · {group.day}</span></div><div className="idol-summary-states"><span>{group.rows.length} lượt phòng</span>{group.rows.some(r => r.status === "in_room") && <span className="operation-tag live">Đang trong phòng</span>}{group.late_minutes > 0 && <span className="operation-tag important">Trễ tổng {group.late_minutes} phút</span>}<span className="muted">Xem chi tiết ↓</span></div></summary>
      <div className="operation-table-wrap"><table className="operation-table"><caption>Các lượt phòng của @{group.username}</caption><thead><tr><th>Phòng / Lịch dự kiến</th><th>Hạn nhận phòng</th><th>Vào / Ra thực tế</th><th>Máy</th><th>Trạng thái</th></tr></thead><tbody>{group.rows.map(row => <tr key={row.segment_id}>
        <td><strong>{row.room_code}</strong><small>{time(row.scheduled_start)} → {time(row.scheduled_end)}</small></td>
        <td>{row.entry_due_at ? time(row.entry_due_at) : "Chờ lượt trước"}{row.late_seconds > 0 && <small className="important-text">Vi phạm: trễ {lateMinutes(row.late_seconds)} phút</small>}</td>
        <td><span>Vào: {time(row.checked_in_at)}</span><small>Ra: {time(row.checked_out_at)}</small></td>
        <td>{row.device_code ? <><strong>{row.device_code}</strong><small>{row.device_returned_at ? `Đã trả ${time(row.device_returned_at)}` : "Chưa trả máy"}</small></> : row.device_choice === "own" ? "Không dùng máy công ty" : row.pending_device_request ? `Chờ duyệt ${row.requested_device_code ?? "máy"}` : "Chưa nhận máy"}</td>
        <td><span className={`operation-tag ${row.status === "in_room" ? "live" : ""}`}>{labels[entryState(row, now)]}</span>{row.skip_reason && <small>{row.skip_reason}</small>}</td>
      </tr>)}</tbody></table></div>
      {group.rows.map(row => <div className="idol-turn-history" key={row.segment_id}>
        <h3>{row.room_code} · Nhật ký thao tác</h3>
        {row.events.length ? <ol className="operation-timeline">{row.events.map(event => <li key={event.id} className={event.important ? "important-text" : ""}><time dateTime={event.happened_at}>{time(event.happened_at)}</time><span>{event.important && <strong>QUAN TRỌNG · </strong>}{event.message}</span></li>)}</ol> : <p className="hint">{row.visit_id ? "Lượt trước khi cập nhật: xem giờ vào/ra và ảnh đã lưu." : "Chưa có thao tác."}</p>}
        <div className="visit-links">{row.photos.map(photo => <a key={photo.id} href={`/api/attendance/photos/${photo.id}`} target="_blank" rel="noreferrer">{photo.phase === "checkin" ? "Ảnh check-in" : "Ảnh checkout"}</a>)}</div>
        {role !== "idol" && (row.status === "in_room" || row.room_on_hold || row.work_date === new Date(now).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })) && <TurnControls row={row} />}
      </div>)}
    </details>)}
    <p className="hint">Checkout vượt giờ dự kiến được lưu để điều phối, không tính là vi phạm trễ. Ảnh được xem trong 30 ngày. Lịch sử thuộc Idol và đi theo team hiện tại.</p>
  </section>;
}
