export type OperationEvent = { id: string; kind: string; message: string; happened_at: string; important: boolean; late_seconds: number };
export type OperationRow = {
  segment_id: string; idol_id: string; idol_name: string; username: string; work_date: string;
  room_id: string; room_code: string; scheduled_start: string; scheduled_end: string;
  visit_id: string | null; checked_in_at: string | null; checked_out_at: string | null;
  checkout_confirmed_at: string | null; entry_due_at: string | null; late_seconds: number;
  device_choice: "pending" | "company" | "own";
  status: "waiting" | "in_room" | "completed" | "skipped";
  skip_reason: string | null; room_on_hold: boolean; loan_id: string | null;
  device_code: string | null; device_received_at: string | null; device_returned_at: string | null;
  pending_device_request: string | null; requested_device_code: string | null;
  photos: { id: string; phase: string }[]; events: OperationEvent[];
};
export type OpenDevice = { id: string; room_visit_id: string | null; device_code: string; checked_out_at: string };
export function lateMinutes(seconds: number) { return Math.ceil(Math.max(0, seconds) / 60); }
export function entryState(row: OperationRow, now: number) {
  if (row.status !== "waiting") return row.status;
  if (row.room_on_hold || !row.entry_due_at) return "blocked";
  if (now < new Date(row.scheduled_start).getTime() - 30 * 60000) return "early";
  return now > new Date(row.entry_due_at).getTime() ? "overdue" : "ready";
}
export function nextIdolTurn(rows: OperationRow[]) {
  return rows.find(r => r.status === "in_room") ?? [...rows].filter(r => r.status === "waiting")
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0];
}
export function groupIdolOperations(rows: OperationRow[]) {
  const grouped = new Map<string, { key: string; idol_id: string; username: string; idol_name: string; day: string; rows: OperationRow[]; late_minutes: number }>();
  for (const row of rows) {
    const key = `${row.idol_id}:${row.work_date}`;
    const group = grouped.get(key) ?? { key, idol_id: row.idol_id, username: row.username, idol_name: row.idol_name, day: row.work_date, rows: [], late_minutes: 0 };
    group.rows.push(row); group.late_minutes += lateMinutes(row.late_seconds); grouped.set(key, group);
  }
  return [...grouped.values()].map(g => ({ ...g, rows: g.rows.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start)) }));
}
