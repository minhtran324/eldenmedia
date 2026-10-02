import type { Shift, RoomSlot } from "../types/database";

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}
export function weekStart(value: string) {
  const weekday = new Date(`${value}T00:00:00Z`).getUTCDay(); return addDays(value, -(weekday + 6) % 7);
}
export function vietnamToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function localTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)); }
export function shiftHours(shifts: Shift[]) { return shifts.flatMap(s => Array.from({ length: Math.max(0, s.end_hour - s.start_hour) }, (_, i) => s.start_hour + i)).sort((a, b) => a - b); }

// Dynamic programming per shift: minimize room changes first, borrowed hours
// second. A room spanning an entire shift always wins over a fragmented plan.
export function suggestRooms(shifts: Shift[], rooms: { id: string; manager_id: string }[], free: { room_id: string; slot_hour: number }[], manager: string): RoomSlot[] | null {
  const available = new Set(free.map(v => `${v.room_id}:${v.slot_hour}`));
  const result: RoomSlot[] = [];
  for (const shift of shifts) {
    let previous = new Map<string, { cost: number; slots: RoomSlot[] }>();
    for (let hour = shift.start_hour; hour < shift.end_hour; hour++) {
      const next = new Map<string, { cost: number; slots: RoomSlot[] }>();
      for (const room of rooms) {
        if (!available.has(`${room.id}:${hour}`)) continue;
        const borrowed = room.manager_id === manager ? 0 : 1;
        if (hour === shift.start_hour) next.set(room.id, { cost: borrowed, slots: [{ hour, room_id: room.id }] });
        else for (const [id, path] of previous) {
          const cost = path.cost + (id === room.id ? 0 : 100) + borrowed;
          if (!next.has(room.id) || cost < next.get(room.id)!.cost) next.set(room.id, { cost, slots: [...path.slots, { hour, room_id: room.id }] });
        }
      }
      if (!next.size) return null;
      previous = next;
    }
    const best = [...previous.values()].sort((a, b) => a.cost - b.cost)[0];
    if (best) result.push(...best.slots);
  }
  return result;
}
