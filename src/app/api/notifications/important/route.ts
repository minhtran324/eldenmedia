import { requireActive } from "@/lib/auth/server";
import { vietnamToday } from "@/lib/scheduling";

export async function GET() {
  const { supabase, profile } = await requireActive();

  // Admin oversees everything — no toast or alert badge
  if (profile.role === "admin") {
    return Response.json(
      { count: 0, latest: null },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  const today = vietnamToday();
  const todayStartIso = `${today}T00:00:00+07:00`;

  // Chỉ lấy thông báo chưa đọc của ngày hôm nay trở đi (bỏ qua các vi phạm từ ngày cũ đã quá hạn)
  const { data, error, count } = await supabase
    .from("notifications")
    .select("id,title,body,work_date,created_at", { count: "exact" })
    .eq("recipient_id", profile.id)
    .eq("priority", "important")
    .is("read_at", null)
    .or(`work_date.gte.${today},work_date.is.null`)
    .gte("created_at", todayStartIso)
    .order("created_at", { ascending: false })
    .limit(1);

  return Response.json(
    error
      ? { error: "Chưa tải được thông báo quan trọng" }
      : { count: count ?? 0, latest: data?.[0] ?? null },
    {
      status: error ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    }
  );
}
