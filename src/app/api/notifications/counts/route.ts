import { visibleNotificationCounts } from "@/lib/notifications";
import { requireActive } from "@/lib/auth/server";
export async function GET() {
  const { supabase, profile } = await requireActive();
  const { data, error } = await supabase.rpc("my_notification_counts", {});
  return Response.json(error ? { error: "Chưa tải được thông báo" } : visibleNotificationCounts(profile.role, data ?? []), {
    status: error ? 503 : 200, headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
