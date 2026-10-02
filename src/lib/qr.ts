export function parseEldenQr(value: unknown): { kind: "room" | "device"; token: string } | null {
  if (typeof value !== "string" || value.length > 128) return null;
  const match = /^elden:v1:(room|device):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(value.trim());
  return match ? { kind: match[1].toLowerCase() as "room" | "device", token: match[2].toLowerCase() } : null;
}
