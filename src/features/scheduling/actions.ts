"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { validDate } from "@/lib/scheduling";
import type { ActionState } from "@/features/accounts/actions";
import type { RoomSlot, Shift } from "@/types/database";
const field = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
function refresh() {
  revalidatePath("/admin/schedule/trials"); revalidatePath("/operator/schedule/trials");
  revalidatePath("/idol/schedule/register");
  revalidatePath("/admin/schedule/board"); revalidatePath("/operator/schedule/board");
  for (const role of ["admin", "operator", "idol"]) revalidatePath(`/${role}/schedule`);
  for (const role of ["admin", "operator"]) revalidatePath(`/${role}/schedule/requests/[id]`, "page");
}
function failure(error: { message: string; code?: string }): ActionState {
  const messages: Record<string, string> = {
    INVALID_TRIAL_TIME: "Ca test đã qua giờ bắt đầu hoặc ngoài giờ hoạt động; vận hành cần hủy và đăng ký ngày khác.",
    TRIAL_FIVE_DAYS_LIMIT: "Idol test đã đạt giới hạn 5 ngày đăng ký.",
    WEEK_REGISTRATION_REQUIRED: "Hãy đăng ký trọn tuần trước. Nếu lỡ Chủ nhật, gửi yêu cầu đăng ký trễ ở trang Đăng ký tuần.",
    SUNDAY_NEXT_WEEK_ONLY: "Idol đăng ký ngày mới vào Chủ nhật cho tuần kế tiếp. Nếu cần bổ sung ngoài thời gian này, liên hệ vận hành.",
    ONE_HOUR_NOTICE: "Cần gửi đổi/hủy ít nhất 1 giờ trước ca cũ và ca mới.",
    FIVE_HOURS_REQUIRED: "Chọn 1–2 ca có tổng đúng 5 tiếng.", OVERLAPPING_SHIFTS: "Hai ca không được chồng giờ.",
    INVALID_SCHEDULE: "Kiểm tra ngày, giờ tròn và giờ hoạt động của công ty.", PAST_SCHEDULE: "Giờ bắt đầu đã qua. Hãy điều chỉnh phương án.",
    ROOM_CONFLICT: "Phòng vừa có lịch khác hoặc ca chưa checkout. Tải lại và chọn phương án khác.",
    ROOM_COVERAGE_REQUIRED: "Cần chọn phòng cho đủ mọi giờ của cả ngày.", ROOM_UNAVAILABLE: "Phòng đang ngừng hoạt động hoặc không còn tồn tại.",
    STALE_REQUEST: "Yêu cầu đã thay đổi. Tải lại trang trước khi xử lý.", STALE_SCHEDULE: "Lịch đã thay đổi sau lúc gửi yêu cầu. Từ chối yêu cầu cũ rồi gửi lại.",
    REQUEST_NOT_PENDING: "Yêu cầu đã được xử lý. Tải lại danh sách.", STALE_TEAM: "Team hoặc tài khoản người xếp phòng đã thay đổi. Vận hành hiện tại cần xếp phòng lại.",
    ATTENDANCE_EXISTS: "Ngày đã có nhận máy hoặc check-in. Không thể thay lịch để ghi đè lịch sử.",
    ASSIGNMENT_REQUIRED: "Idol và vận hành phụ trách phải đang hoạt động.", ACTIVE_OPERATOR_REQUIRED: "Người quản lý phòng phải đang hoạt động.",
    INVALID_CANCELLATION: "Chỉ hủy ngày đang có lịch và cần nêu lý do.", REASON_REQUIRED: "Điền lý do từ chối.", FORBIDDEN: "Bạn không có quyền xử lý yêu cầu này.",
  };
  for (const [key, value] of Object.entries(messages)) if (error.message.includes(key)) return { error: value };
  if (error.code === "23505") return { error: "Ngày này đang có yêu cầu chờ xử lý. Vận hành cần xử lý yêu cầu cũ trước." };
  if (["PGRST202", "42883"].includes(error.code ?? "")) return { error: "Cần chạy SQL 014 sau các migration trước trên Supabase." };
  return { error: "Chưa thực hiện được. Tải lại và kiểm tra quyền, dữ liệu trước khi thử lại." };
}
export async function submitSchedule(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  const idol = profile.role === "idol" ? profile.id : field(form, "idol_id"), day = field(form, "day"), cancel = field(form, "cancel") === "true", reason = field(form, "reason");
  if (!isUuid(idol) || !validDate(day) || reason.length > 500) return { error: "Chọn Idol, ngày và lý do hợp lệ." };
  const count = Number(field(form, "shift_count"));
  const shifts: Shift[] = cancel ? [] : Array.from({ length: count === 2 ? 2 : 1 }, (_, i) => ({ start_hour: Number(field(form, `start_${i}`)), end_hour: Number(field(form, `end_${i}`)) }));
  if (!cancel && (count !== 1 && count !== 2 || shifts.some(s => !Number.isInteger(s.start_hour) || !Number.isInteger(s.end_hour) || s.start_hour < 0 || s.end_hour > 24 || s.end_hour <= s.start_hour) || shifts.reduce((n, s) => n + s.end_hour - s.start_hour, 0) !== 5)) return { error: "Chọn 1–2 ca theo giờ tròn, tổng đúng 5 tiếng." };
  const { error } = await supabase.rpc("submit_schedule", { target_idol: idol, day, shifts, cancel_day: cancel, reason });
  if (error) return failure(error); refresh(); return { success: cancel ? "Đã gửi yêu cầu hủy. Lịch hiện tại vẫn giữ đến khi được duyệt." : "Đã gửi yêu cầu. Vận hành sẽ phân phòng và duyệt." };
}
export async function prepareSchedule(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Chỉ vận hành hoặc Admin được phân phòng." };
  const id = field(form, "request_id"), revision = Number(field(form, "revision"));
  let slots: RoomSlot[];
  try { slots = JSON.parse(field(form, "slots")); } catch { return { error: "Dữ liệu phòng không hợp lệ." }; }
  if (!isUuid(id) || !Number.isInteger(revision) || revision < 1 || !Array.isArray(slots) || slots.length > 5 || slots.some(s => !s || !isUuid(s.room_id) || !Number.isInteger(s.hour) || s.hour < 0 || s.hour > 23)) return { error: "Chọn đủ phòng cho các giờ live." };
  const { data, error } = await supabase.rpc("prepare_schedule", { request_id: id, expected_revision: revision, room_slots: slots });
  if (error) return failure(error); refresh(); return { success: data === "waiting" ? "Đã gửi yêu cầu cho người quản lý phòng. Chưa giữ chỗ; lịch cũ vẫn có hiệu lực." : "Đã duyệt và cập nhật lịch Idol." };
}
export async function reviewSchedule(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Bạn không có quyền duyệt." };
  const id = field(form, "request_id"), revision = Number(field(form, "revision")), decision = field(form, "approve"), reason = field(form, "reason");
  if (!isUuid(id) || !Number.isInteger(revision) || revision < 1 || !["true", "false"].includes(decision) || reason.length > 500 || (decision === "false" && !reason)) return { error: "Kiểm tra quyết định và lý do." };
  const { data, error } = await supabase.rpc("review_schedule", { request_id: id, expected_revision: revision, approve: decision === "true", reason });
  if (error) return failure(error); refresh(); return { success: data === "waiting" ? "Đã đồng ý. Đang chờ các chủ phòng còn lại." : data === "rejected" ? "Đã từ chối yêu cầu." : "Đã đồng ý và cập nhật lịch." };
}
