"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import type { ActionState } from "@/features/accounts/actions";
import { validDate } from "@/lib/scheduling";
import { isUuid } from "@/lib/auth/routing";
function refresh() {
  revalidatePath("/idol/schedule/register");
  for (const role of ["idol", "operator", "admin"]) revalidatePath(`/${role}/schedule`);
  revalidatePath("/notifications");
}
function fail(error: { message: string; code?: string }): ActionState {
  const labels: Record<string, string> = {
    LATE_PERMISSION_REQUIRED: "Đã ngoài kỳ đăng ký Chủ nhật. Gửi yêu cầu đăng ký trễ và chờ vận hành duyệt.",
    LATE_CURRENT_WEEK_ONLY: "Chỉ xin đăng ký trễ cho tuần hiện tại. Tuần kế tiếp mở vào Chủ nhật.",
    LATE_PERMISSION_EXPIRED: "Tuần này đã kết thúc, không thể cấp quyền đăng ký bù.",
    WEEK_ALREADY_SUBMITTED: "Bạn đã gửi đăng ký tuần này. Muốn đổi ngày, dùng nút Đổi lịch hoặc Hủy ngày.",
    COMPLETE_WEEK_REQUIRED: "Cần chọn rõ làm/nghỉ cho đủ 7 ngày, không bỏ sót hoặc trùng ngày.",
    EXISTING_DAY_REQUIRED: "Một ngày đã có lịch hoặc yêu cầu mới. Tải lại để giữ đúng lịch hiện có.",
    STALE_SCHEDULE: "Lịch đã thay đổi. Tải lại trước khi gửi tuần.",
    FIVE_HOURS_REQUIRED: "Mỗi ngày làm cần 1–2 ca, tổng đúng 5 tiếng.",
    OVERLAPPING_SHIFTS: "Hai ca trong ngày không được trùng giờ.",
    PAST_SCHEDULE: "Có giờ làm đã qua. Chọn lại giờ tương lai; không đăng ký bù giờ đã qua.",
    INVALID_SCHEDULE: "Kiểm tra giờ làm và giờ hoạt động công ty.",
    STALE_REQUEST: "Yêu cầu đã thay đổi. Tải lại trang.",
    REQUEST_NOT_PENDING: "Yêu cầu đã được xử lý.",
    REASON_REQUIRED: "Cần nhập lý do, tối đa 500 ký tự.",
    FORBIDDEN: "Bạn không có quyền xử lý. Kiểm tra vận hành hiện tại phụ trách Idol.",
  };
  return { error: Object.entries(labels).find(([key]) => error.message.includes(key))?.[1] ?? "Chưa xử lý được. Kiểm tra dữ liệu và SQL 014, rồi tải lại trang." };
}
export async function submitWeek(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("idol");
  const week = String(form.get("week") ?? "");
  let days;
  try { days = JSON.parse(String(form.get("days"))); } catch { return { error: "Dữ liệu tuần không hợp lệ." }; }
  if (!validDate(week) || !Array.isArray(days) || days.length !== 7) return { error: "Chọn đủ 7 ngày trong tuần." };
  const { error } = await supabase.rpc("submit_weekly_schedule", { week, days });
  if (error) return fail(error);
  refresh(); return { success: "Đã gửi trọn tuần. Vận hành sẽ xếp phòng và duyệt từng ngày làm." };
}
export async function requestLateWeek(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("idol");
  const week = String(form.get("week") ?? ""), reason = String(form.get("reason") ?? "").trim();
  if (!validDate(week) || !reason || reason.length > 500) return { error: "Chọn tuần và nhập lý do tối đa 500 ký tự." };
  const { error } = await supabase.rpc("request_late_schedule", { week, reason });
  if (error) return fail(error); refresh(); return { success: "Đã gửi yêu cầu. Bạn được đăng ký trễ sau khi vận hành hoặc Admin đồng ý." };
}
export async function reviewLateWeek(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Chỉ Vận hành hoặc Admin được duyệt." };
  const id = String(form.get("id")), revision = Number(form.get("revision")), decision = String(form.get("approve")), reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(id) || !Number.isInteger(revision) || !["true", "false"].includes(decision) || reason.length > 500) return { error: "Dữ liệu quyết định không hợp lệ." };
  const { error } = await supabase.rpc("review_late_schedule", { permission_id: id, expected_revision: revision, approve: decision === "true", reason });
  if (error) return fail(error); refresh(); return { success: decision === "true" ? "Đã mở quyền đăng ký trễ cho tuần này." : "Đã từ chối yêu cầu." };
}
