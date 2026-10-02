import type { Role } from "../types/database.ts";
export const NOTIFICATION_CATEGORIES = {
  schedule: "Lịch live", rooms: "Mượn phòng", devices: "Điện thoại",
  attendance: "Check-in / out", birthdays: "Sinh nhật", system: "Hệ thống",
} as const;
export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;
export type NotificationCount = { category: string; unread_count: number };
export function visibleNotificationCategories(role: Role): NotificationCategory[] {
  const categories = Object.keys(NOTIFICATION_CATEGORIES) as NotificationCategory[];
  return role === "idol" ? categories.filter(c => c !== "rooms") : categories;
}
export function visibleNotificationCounts(role: Role, counts: NotificationCount[]) {
  const categories = visibleNotificationCategories(role);
  return counts.filter(c => categories.includes(c.category as NotificationCategory));
}
export function notificationCategory(value: string | undefined, role: Role): NotificationCategory {
  return visibleNotificationCategories(role).includes(value as NotificationCategory) ? value as NotificationCategory : "schedule";
}
export function notificationDestination(category: NotificationCategory, role: string) {
  if (category === "schedule" || category === "rooms") return `/${role}/schedule`;
  if (category === "devices" || category === "attendance") return `/${role}/operations`;
  return "/home";
}
