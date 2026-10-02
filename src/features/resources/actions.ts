"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import type { ActionState } from "@/features/accounts/actions";

export async function saveResource(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const kind = field("kind"), id = field("id"), code = field("code").toUpperCase();
  const version = Number(field("version"));
  if (!["floor", "room", "device"].includes(kind) || !/^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(code) ||
      (id && (!isUuid(id) || !Number.isInteger(version) || version < 1))) return { error: "Mã chỉ gồm chữ không dấu, số, dấu - hoặc _, tối đa 30 ký tự." };
  const payload: Record<string, string | number | null> = { id: id || null, version: id ? version : null, code };
  if (kind !== "device") {
    payload.name = field("name");
    if (!payload.name || payload.name.length > 100) return { error: "Điền tên, tối đa 100 ký tự." };
  }
  if (kind === "floor") {
    payload.sort_order = Number(field("sort_order"));
    if (!Number.isInteger(payload.sort_order) || Math.abs(payload.sort_order) > 1000) return { error: "Thứ tự tầng phải là số nguyên từ -1000 đến 1000." };
  } else {
    payload.manager_id = field("manager_id"); payload.status = field("status");
    if (!isUuid(payload.manager_id) || !["available", "maintenance", "inactive"].includes(payload.status)) return { error: "Chọn vận hành phụ trách và trạng thái hợp lệ." };
    const parent = field(kind === "room" ? "floor_id" : "assigned_room_id");
    if ((parent && !isUuid(parent)) || (kind === "room" && !parent)) return { error: "Chọn tầng / phòng hợp lệ." };
    payload[kind === "room" ? "floor_id" : "assigned_room_id"] = parent || null;
    if (kind === "room") {
      payload.room_type = field("room_type");
      if (!["regular", "studio"].includes(payload.room_type)) return { error: "Chọn loại phòng hợp lệ." };
    }
  }
  const { error } = await supabase.rpc("admin_save_resource", { resource_kind: kind, payload });
  if (error) {
    const messages: Record<string, string> = {
      STALE_RESOURCE: "Dữ liệu đã được sửa ở nơi khác. Tải lại trang trước khi lưu.",
      DEVICE_IN_USE: "Máy chưa được xác nhận trả. Hoàn tất trả máy trước khi sửa.",
      ROOM_IN_USE: "Phòng còn lịch được duyệt hoặc ca chưa checkout. Xử lý các ca đó trước khi sửa.",
      ACTIVE_OPERATOR_REQUIRED: "Vận hành phụ trách phải đang hoạt động.",
      ROOM_UNAVAILABLE: "Phòng được gán phải đang hoạt động.",
      FLOOR_REQUIRED: "Tầng không tồn tại. Tải lại danh sách.",
      NOT_FOUND: "Không tìm thấy tài nguyên. Tải lại trang.",
    };
    for (const [key, message] of Object.entries(messages)) if (error.message.includes(key)) return { error: message };
    if (error.code === "23505") return { error: "Mã đã tồn tại hoặc phòng đã được gán một máy khác. Bỏ gán máy cũ trước khi thay máy." };
    if (["42883", "PGRST202"].includes(error.code ?? "")) return { error: "Cần chạy migration SQL 006 trên Supabase." };
    return { error: "Không lưu được. Kiểm tra dữ liệu, quyền truy cập và thử lại." };
  }
  revalidatePath("/admin/resources"); revalidatePath("/operator/resources");
  return { success: id ? "Đã cập nhật. Mã QR được giữ nguyên." : "Đã tạo thành công. Tìm tài nguyên mới trong danh sách bên dưới." };
}
