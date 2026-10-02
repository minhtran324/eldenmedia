"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { parseEldenQr } from "@/lib/qr";
import type { ActionState } from "@/features/accounts/actions";
import type { CaptureTicket } from "@/types/database";
export type CaptureResult = ActionState & { ticket?: CaptureTicket };
function refresh() { for (const role of ["admin", "operator", "idol"]) { revalidatePath(`/${role}/operations`); revalidatePath(`/${role}/schedule`); } }
function failure(error: { message: string; code?: string }): ActionState {
  const messages: Record<string, string> = {
    IDOL_REQUIRED: "Chỉ Idol được tự quét nhận/trả máy và vào/ra phòng.", SEGMENT_UNAVAILABLE: "Cần chọn đoạn phòng của ca đã duyệt trong hôm nay.",
    DEVICE_UNAVAILABLE: "Máy không tồn tại hoặc đang ngừng sử dụng/bảo trì.", DEVICE_OR_IDOL_BUSY: "Máy đang có người giữ, hoặc bạn còn máy chưa được xác nhận trả.",
    LOAN_NOT_FOUND: "Bạn không giữ máy này, hoặc việc trả đã được xác nhận.", ACTIVE_OPERATOR_REQUIRED: "Người quản lý máy chưa hoạt động. Liên hệ Admin.",
    REQUEST_NOT_PENDING: "Yêu cầu đã được xử lý. Tải lại trang.", STALE_REQUEST: "Yêu cầu đã thay đổi. Tải lại trước khi duyệt.",
    FORBIDDEN: "Bạn không có quyền duyệt yêu cầu này.", REASON_REQUIRED: "Cần nhập lý do khi từ chối.",
    WRONG_ROOM_QR: "QR không đúng phòng trong đoạn lịch đã chọn.", ROOM_UNAVAILABLE: "Phòng đang ngừng hoạt động.",
    ROOM_CHECKIN_REQUIRED: "Bạn cần check-in phòng và xác nhận ảnh trước khi nhận máy.",
    CHECKIN_TOO_EARLY: "Có thể check-in sớm tối đa 30 phút trước giờ đăng ký, khi đến lượt và phòng đã trống.",
    ROOM_QUEUE_WAIT: "Phòng chưa sẵn sàng hoặc chưa đến lượt của bạn. Vận hành cần xử lý lượt trước.",
    TURN_ALREADY_STARTED: "Lượt này đã check-in, không thể bỏ qua. Idol cần checkout phòng.",
    ALREADY_CHECKED_IN: "Đoạn phòng này đã được check-in.", CHECKOUT_PREVIOUS_ROOM: "Cần checkout phòng trước khi vào đoạn phòng tiếp theo.",
    ROOM_CONFLICT: "Phòng đang có người hoặc lịch khác chưa kết thúc. Liên hệ vận hành.", VISIT_NOT_FOUND: "Không tìm thấy lần check-in đang mở cho phòng này.",
    CAPTURE_NOT_FOUND: "Phiên chụp không hợp lệ.", CAPTURE_EXPIRED: "Phiên chụp đã hết 5 phút. Quét QR và chụp lại.",
    CAPTURE_ROOM_CHANGED: "Giờ bàn giao phòng đã thay đổi. Quay lại tiến trình rồi quét QR và chụp lại.",
    PHOTO_REQUIRED: "Ảnh chưa tải lên thành công. Thử tải lại ảnh trước khi xác nhận.", CHECKOUT_REASON_REQUIRED: "Checkout khác giờ đăng ký cần lý do, kể cả ra sớm hoặc đổi phòng.",
    ACTIVE_REQUIRED: "Tài khoản cần đang hoạt động.",
  };
  for (const [key, message] of Object.entries(messages)) if (error.message.includes(key)) return { error: message };
  if (["PGRST202", "42883", "42703"].includes(error.code ?? "")) return { error: "Cần cập nhật SQL 019 trên Supabase trước khi dùng tiến trình mới." };
  return { error: "Chưa thực hiện được. Tải lại để kiểm tra trạng thái; nếu chưa ghi nhận, hãy thử lại." };
}
export async function scanDevice(segment: string, raw: string): Promise<ActionState> {
  const { supabase } = await requireActive("idol"); const qr = parseEldenQr(raw);
  if (!isUuid(segment) || qr?.kind !== "device") return { error: "Hãy quét QR máy điện thoại Elden." };
  const { data, error } = await supabase.rpc("scan_device", { segment, qr: qr.token });
  if (error) return failure(error); refresh(); return { success: data.status === "received" ? "Đã nhận máy. Khi kết thúc, đặt máy tại bàn chung và quét trả." : "Máy không gắn với phòng này. Đã gửi người quản lý máy duyệt; chưa được nhận máy cho đến khi được chấp nhận." };
}
export async function returnDevice(raw: string): Promise<ActionState> {
  const { supabase } = await requireActive("idol"); const qr = parseEldenQr(raw);
  if (qr?.kind !== "device") return { error: "Hãy quét QR trên máy bạn đang trả." };
  const { error } = await supabase.rpc("request_device_return", { qr: qr.token });
  if (error) return failure(error); refresh(); return { success: "Đã xác nhận trả máy. Máy đã được giải phóng, không cần Vận hành duyệt." };
}
export async function beginCapture(segment: string, raw: string, phase: string): Promise<CaptureResult> {
  const { supabase } = await requireActive("idol"); const qr = parseEldenQr(raw);
  if (!isUuid(segment) || qr?.kind !== "room" || !["checkin", "checkout"].includes(phase)) return { error: "Chọn đúng ca và quét QR phòng live." };
  const { data, error } = await supabase.rpc("begin_room_capture", { segment, qr: qr.token, phase });
  if (error) return failure(error); return { ticket: data };
}
export async function finishCapture(ticket: string, note: string): Promise<ActionState> {
  const { supabase } = await requireActive("idol");
  if (!isUuid(ticket) || note.trim().length > 500) return { error: "Ghi chú tối đa 500 ký tự." };
  const { error } = await supabase.rpc("finish_room_capture", { ticket_id: ticket, note: note.trim() });
  if (error) return failure(error); refresh(); return { success: "Đã ghi nhận. Kiểm tra trạng thái ca và máy bên dưới." };
}
export async function reviewDevice(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Bạn không có quyền duyệt." };
  const id = String(form.get("request_id") ?? ""), revision = Number(form.get("revision"));
  const decision = String(form.get("approve") ?? ""), reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(id) || !Number.isInteger(revision) || revision < 1 || !["true", "false"].includes(decision) || reason.length > 500 || (decision === "false" && !reason)) return { error: "Kiểm tra quyết định và lý do." };
  const { error } = await supabase.rpc("review_device", { request_id: id, expected_revision: revision, approve: decision === "true", reason });
  if (error) return failure(error); refresh(); return { success: decision === "true" ? "Đã xác nhận." : "Đã từ chối; thiết bị chưa được chuyển trạng thái nhận/trả." };
}

export async function choosePersonalDevice(segment: string): Promise<ActionState> {
  const { supabase } = await requireActive("idol");
  if (!isUuid(segment)) return { error: "Lượt phòng không hợp lệ." };
  const { error } = await supabase.rpc("choose_personal_device", { segment });
  if (error) return failure(error); refresh(); return { success: "Đã ghi nhận không dùng máy công ty." };
}

export async function manageRoomTurn(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireActive();
  if (profile.role === "idol") return { error: "Chỉ Vận hành hoặc Admin được điều phối." };
  const segment = String(form.get("segment") ?? ""), action = String(form.get("action") ?? ""), reason = String(form.get("reason") ?? "").trim();
  if (!isUuid(segment) || !["skip", "hold", "release"].includes(action) || reason.length > 500 || (action !== "release" && !reason)) return { error: "Điền lý do để lưu lịch sử điều phối." };
  const { error } = action === "skip" ? await supabase.rpc("skip_room_turn", { segment, reason })
    : await supabase.rpc("set_room_handover", { segment, ready: action === "release", reason });
  if (error) return failure(error); refresh(); return { success: "Đã cập nhật và lưu lịch sử điều phối." };
}
