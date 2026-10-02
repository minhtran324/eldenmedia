import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.ATTENDANCE_CLEANUP_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  const headers = { "Cache-Control": "no-store" };
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "Cleanup is not configured" }, { status: 503, headers });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date().toISOString(), orphanCutoff = new Date(Date.now() - 86400000).toISOString();
  let expired = 0, orphaned = 0;
  try {
    for (let batch = 0; batch < 10; batch++) {
      const { data, error } = await admin.from("room_visit_photos").select("id,storage_path").is("deleted_at", null).lte("expires_at", now).order("expires_at").limit(100);
      if (error) throw new Error("photo lookup");
      if (!data?.length) break;
      // Storage API deletes the underlying object; never delete storage.objects via SQL.
      const { error: removeError } = await admin.storage.from("room-attendance").remove(data.map(p => p.storage_path));
      if (removeError) throw new Error("photo removal");
      const { error: updateError } = await admin.from("room_visit_photos").update({ deleted_at: now }).in("id", data.map(p => p.id));
      if (updateError) throw new Error("photo marker");
      expired += data.length;
    }
    for (let batch = 0; batch < 10; batch++) {
      const { data, error } = await admin.from("room_capture_tickets").select("id,photo_path").is("used_at", null).lt("expires_at", orphanCutoff).order("expires_at").limit(100);
      if (error) throw new Error("orphan lookup");
      if (!data?.length) break;
      const { error: removeError } = await admin.storage.from("room-attendance").remove(data.map(t => t.photo_path));
      if (removeError) throw new Error("orphan removal");
      const { error: deleteError } = await admin.from("room_capture_tickets").delete().in("id", data.map(t => t.id)).is("used_at", null);
      if (deleteError) throw new Error("orphan marker");
      orphaned += data.length;
    }
    return Response.json({ expired_photos_processed: expired, abandoned_captures_processed: orphaned, batch_limit: 1000 }, { headers });
  } catch {
    return Response.json({ error: "Cleanup incomplete; retry later", expired_photos_processed: expired, abandoned_captures_processed: orphaned }, { status: 500, headers });
  }
}
export const POST = GET;
