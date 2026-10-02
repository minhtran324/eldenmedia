"use client";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { mapUsername, publishImport, revertImport } from "@/features/imports/actions";
import { SubmitButton } from "./account-forms";
import type { ActionState } from "@/features/accounts/actions";
const Feedback = ({ state }: { state: ActionState }) => <div aria-live="polite">{state.error && <p role="alert" className="feedback error">{state.error}</p>}{state.success && <p className="feedback success">{state.success}</p>}</div>;
export function ImportUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);
  return <form className="stack-form" onSubmit={async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setIssues([]);
    try {
      const response = await fetch("/api/imports", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? "Không tải được file."); setIssues(result.issues ?? []); }
      else { router.push(`/admin/imports?batch=${result.id}`); router.refresh(); }
    } catch { setError("Mất kết nối hoặc phiên đăng nhập hết hạn. Tải lại trang và thử lại; tải lại cùng file/ngày không tạo bản trùng."); }
    finally { setBusy(false); }
  }}><label>Ngày số liệu<input name="day" type="date" min="2000-01-01" required disabled={busy} /></label><p className="hint">Chọn đúng ngày trên báo cáo TikTok, không phải ngày tải file. Chỉ dùng báo cáo của một ngày.</p><label>File xuất TikTok (.xlsx, tối đa 3 MB)<input name="file" type="file" accept=".xlsx" required disabled={busy} /></label><p className="hint">Chỉ lấy Tên người dùng của nhà sáng tạo và Kim cương. Tải lên tạo bản xem trước, chưa công bố.</p><button className="btn" disabled={busy}>{busy ? "Đang đọc file…" : "Tải lên và đối chiếu"}</button>{error && <p role="alert">{error}</p>}{issues.length > 0 && <ul className="import-errors">{issues.map((issue, i) => <li key={i}>Dòng {issue.row}: {issue.message}</li>)}</ul>}</form>;
}
export function UsernameMap({ batch, row, username, idols }: { batch: string; row: number; username: string; idols: { id: string; name: string; username: string | null }[] }) {
  const [state, action] = useActionState(mapUsername, {}), [idol, setIdol] = useState("");
  const selected = idols.find(p => p.id === idol);
  return <details><summary>Ghép / sửa Idol</summary><form action={action} className="stack-form"><input type="hidden" name="batch" value={batch} /><input type="hidden" name="row" value={row} /><input type="hidden" name="expected_username" value={selected?.username ?? ""} /><label>Idol nhận số liệu @{username}<select name="idol" required value={idol} onChange={e => setIdol(e.target.value)}><option value="">Chọn đúng Idol</option>{idols.map(p => <option value={p.id} key={p.id}>{p.name}{p.username ? ` (@${p.username})` : " (chưa liên kết TikTok)"}</option>)}</select></label>{selected?.username && selected.username !== username && <label className="import-check"><input name="rename" type="checkbox" />Xác nhận Idol đổi username từ @{selected.username} sang @{username}; giữ lịch sử cũ.</label>}<SubmitButton secondary>Lưu liên kết</SubmitButton><Feedback state={state} /></form></details>;
}
export function ImportPublish({ batch, current, disabled, reverted }: { batch: string; current: string | null; disabled: boolean; reverted: boolean }) {
  const [state, action] = useActionState(publishImport, {});
  return <form action={action} className="stack-form"><input type="hidden" name="batch" value={batch} /><input type="hidden" name="current" value={current ?? ""} />{current && <label className="import-check"><input name="replace" type="checkbox" required />Thay thế toàn bộ số liệu ngày này bằng bản đang xem. Idol không có trong bản này sẽ không còn số liệu của ngày đó; số liệu các ngày khác vẫn giữ.</label>}<p className="hint">Lưu số liệu ngày và tính lại tổng tháng từ các ngày đã công bố. Nhập lại cùng ngày không cộng trùng. Kiểm tra ngày, username và tổng dự kiến trước khi công bố.</p><fieldset className="content-fields" disabled={disabled}><SubmitButton>{reverted ? "Công bố lại & cập nhật tổng tháng" : "Lưu & công bố số liệu ngày"}</SubmitButton></fieldset><Feedback state={state} /></form>;
}
export function ImportRevert({ batch }: { batch: string }) {
  const [state, action] = useActionState(revertImport, {});
  return <details><summary>Thu hồi số liệu đã công bố</summary><form action={action} className="stack-form"><input name="batch" type="hidden" value={batch} /><label className="import-check"><input name="confirm" type="checkbox" required />Gỡ số liệu ngày này và tính lại tổng tháng, thứ hạng. Các ngày khác và lịch sử nhập vẫn giữ. Không tự khôi phục bản trước.</label><SubmitButton secondary>Thu hồi</SubmitButton><Feedback state={state} /></form></details>;
}
