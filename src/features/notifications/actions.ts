"use server";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/features/accounts/actions";
export async function readNotification(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive();
  const id = String(form.get("id") ?? "");
  if (!isUuid(id)) return { error: "Thông báo không hợp lệ." };
  const { error } = await supabase.rpc("mark_notification_read", { notification_id: id });
  if (error) return { error: "Chưa đánh dấu được. Vui lòng thử lại." };
  revalidatePath("/notifications");
  return { success: "Đã đọc" };
}
