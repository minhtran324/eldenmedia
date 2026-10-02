"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { cancelTrialLive } from "@/features/scheduling/trial-actions";
import { trialStatusLabels, type TrialBooking } from "@/lib/trial-live";
import { useServerClock } from "@/lib/use-server-clock";

export function TrialLiveCalendar({ records, role, currentUserId, title = "Lịch test live", showHistory = false, serverNow }: {
  serverNow: number;
  records: TrialBooking[]; role: "admin" | "operator"; currentUserId: string; title?: string; showHistory?: boolean;
}) {
  const now = useServerClock(serverNow);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const visible = records.filter(r => showHistory || ["approved", "pending"].includes(r.status));
  return <section className="surface trial-calendar">
    <div className="trial-section-title"><div><span className="eyebrow">TEST LIVE · 2 GIỜ / NGÀY</span><h2>{title}</h2></div>
      <Link className="btn secondary" href={`/${role}/schedule/trials`}>Đăng ký test live</Link></div>
    {message.error && <p className="feedback error" role="alert">{message.error}</p>}
    {message.success && <p className="feedback success" role="status">{message.success}</p>}
    {!visible.length ? <p className="muted">Chưa có lịch test trong khoảng ngày đang xem.</p> : <div className="table-wrap">
      <table className="data-table trial-calendar-table"><thead><tr><th>Idol test</th><th>Ngày</th><th>Ca 2 tiếng</th><th>Phòng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{visible.map(row => {
          const canCancel = (role === "admin" || row.operator_id === currentUserId) && (row.status === "pending" || (row.status === "approved" && new Date(`${row.work_date}T${String(row.start_hour).padStart(2, "0")}:00:00+07:00`).getTime() > now));
          return <tr key={row.id}><td><strong>{row.display_name}</strong><span className="trial-badge">Test live</span></td><td>{row.work_date.split("-").reverse().join("/")}</td>
            <td>{row.start_hour}:00–{row.end_hour}:00</td><td>{row.room_code}</td><td><span className={`trial-status trial-status-${row.status}`}>{trialStatusLabels[row.status]}</span></td>
            <td>{canCancel && (confirmId === row.id ? <div className="trial-inline-actions"><button className="btn danger btn-compact" type="button" disabled={pending} onClick={() => startTransition(async () => {
              try { setMessage(await cancelTrialLive(row.id, row.revision)); } catch { setMessage({ error: "Chưa hủy được. Hãy tải lại trang." }); } finally { setConfirmId(null); }
            })}>Xác nhận hủy</button><button type="button" className="btn secondary btn-compact" disabled={pending} onClick={() => setConfirmId(null)}>Giữ lịch</button></div>
              : <button type="button" className="btn secondary btn-compact" disabled={pending} onClick={() => setConfirmId(row.id)}>Hủy ngày này</button>)}</td></tr>;
        })}</tbody></table></div>}
    <p className="hint">Lịch chờ duyệt chưa giữ chỗ. Hủy lịch test trước giờ bắt đầu để trả phòng và đăng ký ngày khác.</p>
  </section>;
}
