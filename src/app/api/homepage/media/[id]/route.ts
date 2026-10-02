import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireActive();
  const { id } = await params;
  const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
  if (!isUuid(id)) return new Response("Không tìm thấy ảnh", { status: 404, headers });
  // Both the post and Storage object are checked under the caller's RLS.
  const { data: post, error } = await supabase.from("homepage_posts").select("image_path").eq("id", id).maybeSingle();
  if (error || !post?.image_path) return new Response("Không tìm thấy ảnh", { status: 404, headers });
  const { data, error: mediaError } = await supabase.storage.from("homepage-media").download(post.image_path);
  if (mediaError || !data || !["image/jpeg", "image/png", "image/webp"].includes(data.type)) return new Response("Không tải được ảnh", { status: 404, headers });
  return new Response(data, { headers: { ...headers, "Content-Type": data.type } });
}
