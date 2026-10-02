"use client";
import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";
import type { Member, Profile } from "@/types/database";
import { assignIdol, changeMemberStatus, createOperatorAccess, revokeOperatorAccess, saveProfile, type ActionState } from "@/features/accounts/actions";

export function SubmitButton({ children, busy = "Đang xử lý…", secondary = false }: { children: React.ReactNode; busy?: string; secondary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={secondary ? "btn secondary" : "btn"}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <span className="btn-spinner" aria-hidden="true" />
          {busy}
        </>
      ) : children}
    </button>
  );
}
function Feedback({ state }: { state: ActionState }) {
  return <div aria-live="polite">{state.error && <p className="feedback error" role="alert">{state.error}</p>}{state.success && <p className="feedback success">{state.success}</p>}</div>;
}

export function ProfileForm({ profile, tiktokUsername = "", completing = false }: { profile: Profile; tiktokUsername?: string; completing?: boolean }) {
  const [state, action] = useActionState(saveProfile, {});
  const prefix = useId();
  const required = profile.status === "active" && profile.role !== "admin";
  return <form action={action} className="stack-form">
    <input type="hidden" name="completing" value={String(completing)} />
    <div className="form-grid"><label htmlFor={`${prefix}-name`}>Họ và tên<input id={`${prefix}-name`} name="full_name" defaultValue={profile.full_name} required minLength={2} maxLength={150} autoComplete="name" /></label>
    {profile.role === "idol" && <label htmlFor={`${prefix}-username`}>Username TikTok{required && " *"}<input id={`${prefix}-username`} name="username" required={required} defaultValue={tiktokUsername || profile.nickname || ""} maxLength={100} pattern="[A-Za-z0-9._]+" autoComplete="username" placeholder="username không có @" /></label>}
    <label htmlFor={`${prefix}-phone`}>Số điện thoại{required && " *"}<input id={`${prefix}-phone`} name="phone" type="tel" required={required} defaultValue={profile.phone ?? ""} maxLength={20} autoComplete="tel" /></label>
    <label htmlFor={`${prefix}-dob`}>Ngày sinh{required && " *"}<input id={`${prefix}-dob`} name="birth_date" type="date" required={required} defaultValue={profile.birth_date ?? ""} min="1900-01-01" autoComplete="bday" /></label></div>
    {profile.role === "idol" && <p className="hint">Username TikTok dùng để đối chiếu file Excel. Nhập không có ký hiệu @; hệ thống tự viết thường và lưu lịch sử khi thay đổi.</p>}
    <Feedback state={state} /><div><SubmitButton>{completing ? "Lưu & vào bàn làm việc" : "Lưu hồ sơ"}</SubmitButton></div>
  </form>;
}

export function OperatorAccessForm() {
  const [state, action] = useActionState(createOperatorAccess, {});
  return <form action={action} className="stack-form">
    <label htmlFor="operator-name">Họ tên vận hành<input id="operator-name" name="full_name" required minLength={2} maxLength={150} autoComplete="off" placeholder="Nguyen Van A" /></label>
    <label htmlFor="operator-email">Email Google được cấp quyền<input id="operator-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder="vanhanh@gmail.com" /></label>
    <p className="hint">Người nhận dùng đúng email này để đăng nhập Google. Hệ thống không gửi email hoặc tạo mật khẩu chung.</p>
    <Feedback state={state} /><SubmitButton>Cấp quyền Vận hành</SubmitButton>
  </form>;
}

export function AssignmentForm({ member, operators }: { member: Member; operators: Pick<Profile, "id" | "full_name">[] }) {
  const [state, action] = useActionState(assignIdol, {});
  const prefix = useId();
  return <form action={action} className="stack-form compact">
    <input type="hidden" name="idol_id" value={member.id} />
    <label htmlFor={prefix}>Vận hành phụ trách<select id={prefix} name="operator_id" defaultValue={member.operator_id ?? ""} required><option value="" disabled>Chọn vận hành</option>{operators.map(op => <option key={op.id} value={op.id}>{op.full_name || "Chưa có tên"}</option>)}</select></label>
    {operators.length === 0 && <p className="hint">Cần ít nhất một vận hành đã kích hoạt.</p>}
    <Feedback state={state} /><SubmitButton>{member.status === "pending" ? "Duyệt & phân công" : "Cập nhật phân công"}</SubmitButton>
  </form>;
}

export function StatusForm({ member }: { member: Member }) {
  const [state, action] = useActionState(changeMemberStatus, {});
  const prefix = useId(), reopening = member.status === "suspended";
  return <form action={action} className="stack-form compact">
    <input type="hidden" name="member_id" value={member.id} /><input type="hidden" name="status" value={reopening ? "active" : "suspended"} />
    <label htmlFor={prefix}>Lý do {reopening ? "mở lại" : "khóa"}<input id={prefix} name="reason" required maxLength={500} placeholder="Ghi rõ lý do xử lý" /></label>
    <Feedback state={state} /><SubmitButton secondary>{reopening ? "Mở lại tài khoản" : "Khóa tài khoản"}</SubmitButton>
  </form>;
}

export function RevokeInviteForm({ id }: { id: string }) {
  const [state, action] = useActionState(revokeOperatorAccess, {});
  return <form action={action}><input type="hidden" name="invite_id" value={id} /><Feedback state={state} /><SubmitButton secondary>Thu hồi quyền chờ</SubmitButton></form>;
}
