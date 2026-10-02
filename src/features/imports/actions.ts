"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import type { ActionState } from "@/features/accounts/actions";

function message(error: { message: string; code?: string }) {
  const messages: Record<string, string> = {
    STALE_DAY: "Số liệu ngày đã thay đổi ở tab khác. Tải lại trang trước khi công bố.",
    UNMATCHED_ROWS: "Có dòng chưa khớp Idol hoặc username đã thay đổi. Kiểm tra tất cả dòng trước khi công bố.",
    STALE_USERNAME: "Username của Idol đã thay đổi. Tải lại trang để đối chiếu.",
    RENAME_CONFIRMATION_REQUIRED: "Idol đã có username khác. Tích xác nhận đổi username nếu đúng là cùng người.",
    BATCH_NOT_STAGED: "Chỉ chỉnh sửa bản đang chờ công bố. Tải lại trang.",
    BATCH_NOT_PUBLISHED: "Bản này không còn được công bố. Tải lại trang.",
    ACTIVE_IDOL_REQUIRED: "Chọn Idol đang hoạt động.",
    REPLACE_CONFIRMATION_REQUIRED: "Cần xác nhận thay thế toàn bộ số liệu ngày này.",
    CANNOT_DELETE_PUBLISHED_BATCH: "Không thể xóa trực tiếp bản đang công bố. Hãy thu hồi số liệu trước.",
    INVALID_DATE: "Ngày số liệu không hợp lệ hoặc nằm trong tương lai.",
    INVALID_DIAMONDS: "Số kim cương phải là số nguyên không âm.",
    BATCH_ALREADY_EXISTS_FOR_DATE: "Ngày này đã có bản nhập của file này.",
  };
  if (error.code === "23505") return "Username đã thuộc Idol khác hoặc Idol đã được ghép với một dòng khác trong file.";
  if (["42883", "PGRST202"].includes(error.code ?? "")) {
    return "Cần chạy migration SQL 020 trên Supabase Dashboard để kích hoạt tính năng này.";
  }
  return Object.entries(messages).find(([key]) => error.message.includes(key))?.[1] ?? (error.message || "Chưa xử lý được. Vui lòng thử lại.");
}

function refresh() {
  revalidatePath("/admin/imports");
  revalidatePath("/reports");
  revalidatePath("/home");
}

export async function mapUsername(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch")), idol = String(form.get("idol")), row = Number(form.get("row"));
  if (!isUuid(batch) || !isUuid(idol) || !Number.isInteger(row)) return { error: "Chọn dòng và Idol hợp lệ." };
  const { error } = await supabase.rpc("map_diamond_username", {
    batch,
    source_row: row,
    idol,
    expected_username: String(form.get("expected_username") ?? "") || null,
    allow_rename: form.get("rename") === "on",
  });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã liên kết username với Idol." };
}

export async function publishImport(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch")), current = String(form.get("current") ?? "");
  if (!isUuid(batch) || (current && !isUuid(current))) return { error: "Bản nhập không hợp lệ." };
  const { error } = await supabase.rpc("publish_diamond_import", {
    batch,
    expected_current: current || null,
    confirm_replace: form.get("replace") === "on",
  });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã lưu số liệu ngày, tính lại tổng tháng và cập nhật bảng xếp hạng." };
}

export async function revertImport(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch"));
  if (!isUuid(batch) || form.get("confirm") !== "on") return { error: "Cần xác nhận thu hồi số liệu." };
  const { error } = await supabase.rpc("revert_diamond_import", { batch });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã thu hồi số liệu ngày và tính lại tổng tháng. Lịch sử bản nhập và số liệu các ngày khác được giữ lại." };
}

export async function deleteImportBatch(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch"));
  if (!isUuid(batch)) return { error: "Mã bản nhập không hợp lệ." };
  const { error } = await supabase.rpc("delete_staged_import_batch", { batch });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã xóa bản nhập." };
}

export async function changeBatchDate(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch")), newDay = String(form.get("new_day") ?? "");
  if (!isUuid(batch) || !/^\d{4}-\d{2}-\d{2}$/.test(newDay)) return { error: "Ngày số liệu không hợp lệ." };
  const { error } = await supabase.rpc("change_import_batch_date", { batch, new_day: newDay });
  if (error) return { error: message(error) };
  refresh();
  return { success: `Đã đổi ngày số liệu thành ${newDay}.` };
}

export async function updateRowDiamonds(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch")), row = Number(form.get("row")), diamonds = Number(form.get("diamonds"));
  if (!isUuid(batch) || !Number.isInteger(row) || !Number.isSafeInteger(diamonds) || diamonds < 0) {
    return { error: "Số liệu không hợp lệ." };
  }
  const { error } = await supabase.rpc("update_diamond_row_amount", {
    batch,
    source_row: row,
    new_diamonds: diamonds,
  });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã cập nhật số kim cương." };
}

export async function setManualIdolDiamonds(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const batch = String(form.get("batch")), idol = String(form.get("idol")), diamonds = Number(form.get("diamonds"));
  if (!isUuid(batch) || !isUuid(idol) || !Number.isSafeInteger(diamonds) || diamonds < 0) {
    return { error: "Số liệu không hợp lệ." };
  }
  const { error } = await supabase.rpc("set_idol_batch_diamonds", {
    batch,
    idol,
    new_diamonds: diamonds,
  });
  if (error) return { error: message(error) };
  refresh();
  return { success: "Đã ghi nhận số kim cương cho Idol." };
}

export async function setDiamondVisibilityAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const operatorView = form.get("operator_view") ?? "false", idolView = form.get("idol_view") ?? "false";
  if (!["true","false"].includes(String(operatorView)) || !["true","false"].includes(String(idolView))) return { error: "Thiết lập không hợp lệ." };
  const { error } = await supabase.rpc("admin_set_diamond_visibility", {
    operator_view: operatorView === "true", idol_view: idolView === "true",
  });
  if (error) return { error: ["PGRST202","42883"].includes(error.code) ? "Cần chạy SQL 023 và các migration trước đó." : "Chưa lưu được quyền. Vui lòng thử lại." };
  refresh(); revalidatePath("/operator"); revalidatePath("/idol");
  return { success: "Đã cập nhật quyền xem Idol ngoài phạm vi cá nhân / team." };
}
