"use client";
import { useActionState } from "react";
import { reviewDevice } from "@/features/operations/actions";
export function DeviceDecision({ id, revision }: { id: string; revision: number }) {
  const [state, action, pending] = useActionState(reviewDevice, {});
  return <form action={action} className="stack-form compact">
    <input name="request_id" value={id} type="hidden" /><input name="revision" value={revision} type="hidden" />
    <label>Ghi chú / lý do từ chối<input name="reason" maxLength={500} /></label>
    <div className="operation-actions">
      <button name="approve" value="true" className="btn" disabled={pending}>Đồng ý cho nhận máy</button>
      <button name="approve" value="false" className="btn secondary" disabled={pending}>Từ chối</button>
    </div>
    <div aria-live="polite">{state.error && <p className="feedback error">{state.error}</p>}{state.success && <p className="feedback success">{state.success}</p>}</div>
  </form>;
}
