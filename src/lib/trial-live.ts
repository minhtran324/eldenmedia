export type TrialIdol = { id: string; display_name: string; operator_id: string; used_days: number };
export type TrialDay = { date: string; start_hour: number; room_id: string };
export type TrialBooking = {
  id: string; trial_id: string; display_name: string; operator_id: string; work_date: string;
  start_hour: number; end_hour: number; room_id: string; room_code: string;
  status: "pending" | "approved" | "rejected" | "cancelled"; revision: number;
};
export const trialStatusLabels = { pending: "Chờ chủ phòng duyệt", approved: "Đã xếp phòng", rejected: "Bị từ chối", cancelled: "Đã hủy" };
