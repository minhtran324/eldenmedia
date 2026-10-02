import QRCode from "qrcode";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";

export async function GET(request: Request) {
  const { supabase } = await requireActive("admin");
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind"), id = params.get("id") ?? "";
  const headers = { "Cache-Control": "private, no-store, max-age=0" };
  if ((kind !== "room" && kind !== "device") || !isUuid(id)) return new Response("Yêu cầu không hợp lệ", { status: 400, headers });
  const { data, error } = await supabase.from(kind === "room" ? "rooms" : "devices").select("code,qr_token").eq("id", id).maybeSingle();
  if (error) return new Response("Chưa tải được QR", { status: 503, headers });
  if (!data) return new Response("Không tìm thấy tài nguyên", { status: 404, headers });
  // Versioned, domain-independent payload. The scanner must authenticate and
  // authorize every operation; possession of a QR is never authorization.
  const png = await QRCode.toBuffer(`elden:v1:${kind}:${data.qr_token}`, { type: "png", width: 768, margin: 4, errorCorrectionLevel: "M" });
  const safeCode = data.code.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 30);
  return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="elden-${kind}-${safeCode}.png"` } });
}
