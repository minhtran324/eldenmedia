import type { AccountStatus, Role, Profile } from "../../types/database";

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", operator: "Vận hành", idol: "Idol" };
export const STATUS_LABELS: Record<AccountStatus, string> = { pending: "Chờ duyệt", active: "Hoạt động", suspended: "Tạm khóa" };

type RoutingProfile = Pick<Profile, "role" | "status"> & Partial<Profile>;
export function needsProfileCompletion(profile: RoutingProfile): boolean {
  if (profile.role === "admin" || profile.status !== "active") return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  return !profile.full_name || profile.full_name.trim().length < 2 || profile.full_name.trim().length > 150
    || !/^\+?[0-9 ()-]{8,20}$/.test(profile.phone ?? "")
    || !profile.birth_date || profile.birth_date < "1900-01-01" || profile.birth_date > today
    || (profile.role === "idol" && !/^[a-z0-9._]{1,100}$/.test(profile.nickname ?? ""));
}

export function accountDestination(profile: RoutingProfile | null): string {
  if (!profile) return "/account-unavailable";
  if (profile.status === "suspended") return "/suspended";
  if (profile.status !== "active") return "/pending";
  if (needsProfileCompletion(profile)) return "/complete-profile";
  return { admin: "/admin", operator: "/operator", idol: "/idol" }[profile.role] ?? "/account-unavailable";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function validatedAppOrigin(raw: string | undefined, production: boolean): string {
  const url = new URL(raw || (production ? "" : "http://localhost:3000"));
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("APP_URL phải là địa chỉ gốc của web.");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("APP_URL cần HTTPS khi triển khai.");
  }
  return url.origin;
}
