export function GET() {
  return Response.json({ status: "ok", service: "elden-management", database: "not-checked" }, { headers: { "Cache-Control": "no-store" } });
}
