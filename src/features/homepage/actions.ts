"use server";
import { revalidatePath } from "next/cache";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { fromVnInput } from "@/lib/homepage";
import type { ActionState } from "@/features/accounts/actions";

export async function saveHomepagePost(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const field = (key: string) => String(form.get(key) ?? "").trim();
  const id = field("id"), revision = Number(field("revision"));
  const kind = field("kind"), status = field("status"), title = field("title"), body = field("body");
  const audience = form.getAll("audience").map(String);
  if ((id && (!isUuid(id) || !Number.isInteger(revision) || revision < 1)) ||
    !["poster", "event", "announcement"].includes(kind) || !["draft", "published", "archived"].includes(status) ||
    !title || title.length > 200 || body.length > 10000 || !audience.length || audience.some(r => !["admin", "operator", "idol"].includes(r))) return { error: "Kiểm tra tiêu đề, loại nội dung và người được xem." };
  const link = field("link_url");
  if (link) {
    try { const url = new URL(link); if (url.protocol !== "https:" || url.username || url.password || link.length > 2000) throw Error(); }
    catch { return { error: "Liên kết phải là địa chỉ HTTPS hợp lệ." }; }
  }
  let dates: Record<string, string | null>;
  try { dates = Object.fromEntries(["publish_from", "publish_until", "event_starts_at", "event_ends_at"].map(k => [k, fromVnInput(field(k))])); }
  catch { return { error: "Ngày giờ không hợp lệ. Các giờ trong biểu mẫu là giờ Việt Nam." }; }
  const { error } = await supabase.rpc("admin_save_homepage_post", { post_id: id || null, expected_revision: id ? revision : null, payload: {
    kind, status, title, body, audience, ...dates, link_url: link, image_path: field("image_path"), location: field("location"), pinned: form.get("pinned") === "on",
  } });
  if (error) {
    if (error.message.includes("STALE_POST")) return { error: "Bài đã được sửa ở tab khác. Tải lại trang trước khi chỉnh tiếp." };
    if (error.message.includes("IMAGE_NOT_FOUND")) return { error: "Ảnh chưa tải lên thành công. Chọn lại ảnh." };
    if (["42883", "PGRST202"].includes(error.code)) return { error: "Cần chạy migration SQL 009 trên Supabase." };
    return { error: "Không lưu được. Poster công bố cần ảnh; sự kiện cần giờ bắt đầu; giờ kết thúc phải hợp lệ." };
  }
  revalidatePath("/home"); revalidatePath("/admin/content");
  return { success: "Đã lưu nội dung." };
}

export async function saveHomepageOptions(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireActive("admin");
  const ranking = String(form.get("ranking"));
  if (!["day", "week", "month"].includes(ranking)) return { error: "Chọn kỳ xếp hạng hợp lệ." };
  const { error } = await supabase.rpc("admin_set_homepage_options", { ranking, reminders: "company" });
  if (error) return { error: "Không cập nhật được cấu hình." };
  revalidatePath("/home"); revalidatePath("/admin/content");
  return { success: "Đã cập nhật kỳ ranking. Nhắc sinh nhật gửi đến toàn bộ Idol, Vận hành và Admin." };
}
