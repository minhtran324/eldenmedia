import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireActive(); const { id } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  if (!isUuid(id)) return new Response("Không tìm thấy ảnh", { status: 404, headers });
  const { data: photo, error } = await supabase.from("room_visit_photos").select("storage_path,expires_at").eq("id", id).is("deleted_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !photo) return new Response("Ảnh không còn hoặc bạn không có quyền xem", { status: 404, headers });
  const { data, error: downloadError } = await supabase.storage.from("room-attendance").download(photo.storage_path);
  if (downloadError || !data) return new Response("Chưa tải được ảnh", { status: 404, headers });
  return new Response(data, { headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": `inline; filename="room-${id}.jpg"` } });
}
