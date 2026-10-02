"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { addDays, validDate, vietnamToday } from "@/lib/scheduling";
import type { ActionState } from "@/features/accounts/actions";
import type { TrialDay } from "@/lib/trial-live";

export type TrialActionState = ActionState & { traineeId?: string };
function refresh() {
  for (const role of ["admin", "operator"]) {
    revalidatePath(`/${role}/schedule`);
    revalidatePath(`/${role}/schedule/trials`);
    revalidatePath(`/${role}/schedule/board`);
  }
  revalidatePath("/notifications");
}
function failure(error: { message: string; code?: string }): TrialActionState {
  const messages: Record<string, string> = {
    TRIAL_NAME_REQUIRED: "Nhập tên Idol test từ 2–100 ký tự.",
    TRIAL_FIVE_DAYS_LIMIT: "Idol này đã có lịch test. Tổng lịch đã duyệt và đang chờ chỉ được tối đa 5 ngày; hãy chọn lại Idol đã có để xem số ngày còn lại.",
    TRIAL_DUPLICATE_DAY: "Idol test đã có lịch trong ngày này. Mỗi ngày chỉ đăng ký một ca 2 tiếng.",
    INVALID_TRIAL_DAYS: "Chọn 1–5 ngày khác nhau, giờ tròn, trong giờ hoạt động và tối đa 90 ngày tới.",
    INVALID_TRIAL_TIME: "Giờ bắt đầu đã qua hoặc nằm ngoài giờ hoạt động. Hãy chọn lại giờ test.",
    ROOM_CONFLICT: "Phòng vừa có lịch khác. Tải lại phòng trống và chọn phòng khác; chưa lưu bất kỳ ngày nào của lần đăng ký này.",
    ROOM_UNAVAILABLE: "Phòng không còn khả dụng. Tải lại danh sách phòng.",
    ACTIVE_OPERATOR_REQUIRED: "Vận hành phụ trách hoặc chủ phòng không còn hoạt động.",
    TRIAL_ALREADY_STARTED: "Ca test đã bắt đầu hoặc đã qua, không thể hủy để thay đổi lịch sử.",
    STALE_REQUEST: "Lịch vừa được cập nhật. Tải lại trang trước khi xử lý.",
    REQUEST_NOT_PENDING: "Lịch đã được xử lý hoặc hủy.",
    FORBIDDEN: "Bạn không có quyền đăng ký hay hủy lịch test này.",
  };
  for (const [code, message] of Object.entries(messages)) if (error.message.includes(code)) return { error: message };
  if (["PGRST202", "42883"].includes(error.code ?? "")) return { error: "Cần chạy migration SQL 024 trên Supabase trước khi đăng ký test live." };
  if (["23505", "23P01"].includes(error.code ?? "")) return { error: "Ngày hoặc phòng vừa được đăng ký. Tải lại phòng trống và thử lại." };
  return { error: "Không lưu được lịch test. Kiểm tra dữ liệu và thử lại." };
}
export async function registerTrialLive(form: FormData): Promise<TrialActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Chỉ Vận hành và Admin được đăng ký test live." };
  const name = String(form.get("name") ?? "").trim();
  const trainee = String(form.get("trainee_id") ?? ""), operator = String(form.get("operator_id") ?? "");
  let days: TrialDay[];
  try { days = JSON.parse(String(form.get("days") ?? "")); } catch { return { error: "Danh sách ngày không hợp lệ." }; }
  const today = vietnamToday();
  if ((!trainee && (name.length < 2 || name.length > 100)) || (trainee && !isUuid(trainee)) || (operator && !isUuid(operator))
    || !Array.isArray(days) || days.length < 1 || days.length > 5
    || days.some(d => !d || typeof d.date !== "string" || !validDate(d.date) || d.date < today || d.date > addDays(today, 90)
      || !Number.isInteger(d.start_hour) || d.start_hour < 0 || d.start_hour > 22 || !isUuid(d.room_id))
    || new Set(days.map(d => d.date)).size !== days.length) return { error: "Nhập tên, chọn 1–5 ngày khác nhau và phòng cho đủ 2 tiếng mỗi ngày." };
  const { data, error } = await supabase.rpc("register_trial_live", {
    trainee_name: name, trainee_id: trainee || null, target_operator: operator || null,
    days: days.map(d => ({ date: d.date, start_hour: d.start_hour, room_id: d.room_id })),
  });
  if (error) return failure(error);
  refresh();
  return { success: `Đã đăng ký ${days.length} ngày test, mỗi ngày 2 tiếng. Lịch dùng phòng team khác sẽ chờ chủ phòng duyệt.`, traineeId: data };
}
export async function cancelTrialLive(bookingId: string, revision: number): Promise<TrialActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol" || !isUuid(bookingId) || !Number.isInteger(revision) || revision < 1) return { error: "Không thể hủy lịch này." };
  const { error } = await supabase.rpc("cancel_trial_live", { booking_id: bookingId, expected_revision: revision });
  if (error) return failure(error); refresh(); return { success: "Đã hủy ngày test; bạn có thể đăng ký lại ngày khác." };
}
export async function loadTrialRooms(day: string): Promise<{ available: { room_id: string; slot_hour: number }[]; error?: string }> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol" || !validDate(day)) return { available: [], error: "Ngày hoặc quyền truy cập không hợp lệ." };
  const { data, error } = await supabase.rpc("room_availability_grid", { day });
  if (error) return { available: [], error: "Chưa tải được phòng trống. Chọn ngày trong 90 ngày tới và tải lại." };
  return { available: data ?? [] };
}
