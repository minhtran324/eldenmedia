export const PERIOD_LABELS = { day: "Hôm nay", week: "Tuần này", month: "Tháng này" } as const;
export const POST_LABELS = { poster: "Poster", announcement: "Thông báo", event: "Sự kiện" } as const;
export function vnDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
export function toVnInput(value?: string | null) {
  if (!value) return "";
  return new Date(new Date(value).getTime() + 7 * 3600000).toISOString().slice(0, 16);
}
export function fromVnInput(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("INVALID_DATE");
  const result = new Date(`${value}:00+07:00`);
  if (!Number.isFinite(result.getTime()) || toVnInput(result.toISOString()) !== value) throw Error("INVALID_DATE");
  return result.toISOString();
}
