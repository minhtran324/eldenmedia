"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActive, requireUser } from "@/lib/auth/server";
import { isUuid, accountDestination, needsProfileCompletion } from "@/lib/auth/routing";

export type ActionState = { error?: string; success?: string };
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const refresh = () => { ["/admin", "/operator", "/idol", "/profile", "/pending"].forEach(path => revalidatePath(path)); };

function failure(error: { message: string; code?: string }): ActionState {
  const messages: Record<string, string> = {
    ACCOUNT_ALREADY_IN_USE: "Email đã thuộc một tài khoản khác. Không thể tự đổi vai trò tài khoản đó.",
    PROFILE_NAME_REQUIRED: "Idol cần điền họ tên trước khi được duyệt.",
    INVALID_INPUT: "Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.",
    INVITE_NOT_PENDING: "Quyền này đã được dùng hoặc thu hồi. Hãy tải lại danh sách.",
    ADMIN_ACCOUNT_PROTECTED: "Không thể khóa tài khoản Admin tại đây.",
    APPROVAL_REQUIRED: "Hãy duyệt và phân idol về vận hành trước khi kích hoạt.",
    ASSIGNMENT_REQUIRED: "Tài khoản cần được phân công trước khi mở lại.",
    ROLE_NOT_ALLOWED: "Chỉ tài khoản Idol mới được liên kết username TikTok.",
    PROFILE_REQUIRED: "Điền đủ họ tên, số điện thoại, ngày sinh và username TikTok (đối với Idol).",
  };
  for (const [code, message] of Object.entries(messages)) if (error.message.includes(code)) return { error: message };
  if (error.code === "23505") return { error: "Username TikTok này đã được liên kết với Idol khác." };
  if (["PGRST202", "42883"].includes(error.code ?? "")) return { error: "Cần chạy migration SQL 016 trên Supabase trước khi sử dụng." };
  return { error: "Chưa thực hiện được. Kiểm tra quyền, trạng thái tài khoản và thử lại." };
}

export async function saveProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireUser();
  if (!profile || profile.status === "suspended") return { error: "Tài khoản không thể cập nhật hồ sơ." };
  const name = field(form, "full_name"), username = field(form, "username").replace(/^@+/, "").toLowerCase(), phone = field(form, "phone"), dob = field(form, "birth_date");
  const updatedProfile = { ...profile, full_name: name, phone, birth_date: dob, nickname: username };
  if (needsProfileCompletion(updatedProfile)) return { error: "Điền đủ họ tên, số điện thoại, ngày sinh hợp lệ và username TikTok (đối với Idol)." };
  if (name.length < 2 || name.length > 150 || (username && !/^[a-z0-9._]{1,100}$/.test(username)) || (phone && !/^\+?[0-9 ()-]{8,20}$/.test(phone)) || (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob))) return { error: "Kiểm tra họ tên, username TikTok, số điện thoại và ngày sinh." };
  const { error } = await supabase.rpc("update_my_profile_with_tiktok", { display_name: name, idol_username: username, phone_number: phone, date_of_birth: dob || null });
  if (error) return failure(error);
  refresh();
  if (form.get("completing") === "true" && profile.status === "active") redirect(accountDestination(updatedProfile));
  return { success: "Đã lưu hồ sơ." };
}

export async function assignIdol(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const idol = field(form, "idol_id"), operator = field(form, "operator_id");
  if (!isUuid(idol) || !isUuid(operator)) return { error: "Chọn idol và vận hành hợp lệ." };
  const { error } = await supabase.rpc("admin_assign_idol", { target_idol: idol, target_operator: operator });
  if (error) return failure(error);
  refresh(); return { success: "Đã duyệt / cập nhật vận hành phụ trách." };
}

export async function createOperatorAccess(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const email = field(form, "email").toLowerCase(), name = field(form, "full_name");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 150) return { error: "Điền họ tên và email Google hợp lệ." };
  const { data, error } = await supabase.rpc("admin_create_operator_access", { operator_email: email, operator_name: name });
  if (error) return failure(error);
  refresh(); return { success: data === "reserved" ? "Đã cấp quyền trước. Vận hành đăng nhập Google bằng đúng email này để kích hoạt. Chưa gửi email tự động." : data === "already_active" ? "Email này đã là vận hành đang hoạt động." : "Đã kích hoạt tài khoản vận hành." };
}

export async function revokeOperatorAccess(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const id = field(form, "invite_id");
  if (!isUuid(id)) return { error: "Yêu cầu không hợp lệ." };
  const { error } = await supabase.rpc("admin_revoke_operator_access", { invite_id: id });
  if (error) return failure(error);
  refresh(); return { success: "Đã thu hồi quyền chờ kích hoạt." };
}

export async function changeMemberStatus(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const id = field(form, "member_id"), status = field(form, "status"), reason = field(form, "reason");
  if (!isUuid(id) || !["active", "suspended"].includes(status) || !reason || reason.length > 500) return { error: "Cần trạng thái hợp lệ và lý do (tối đa 500 ký tự)." };
  const { error } = await supabase.rpc("admin_set_member_status", { member_id: id, new_status: status as "active" | "suspended", reason });
  if (error) return failure(error);
  refresh(); return { success: status === "suspended" ? "Đã khóa quyền truy cập tài khoản." : "Đã mở lại tài khoản." };
}
