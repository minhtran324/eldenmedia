export type DiamondReportRow = {
  platform_account_id: string; idol_id: string; display_name: string; username: string | null;
  day_diamonds: string | null; month_diamonds: string | null; data_through: string | null;
  recorded_days: number; month_rank: number; day_rank: number | null;
  operator_id: string | null; operator_name: string | null; is_my_team: boolean;
};
export type DiamondTeamTotal = {
  operator_id: string | null; operator_name: string; idol_count: number; reported_idols: number;
  day_diamonds: string | null; month_diamonds: string | null;
};
export function formatDiamonds(value: string | null | undefined) {
  return value == null ? "Chưa có số liệu" : BigInt(value).toLocaleString("vi-VN");
}
export function filterDiamondRows(rows: DiamondReportRow[], team: string, query: string, mode: "day" | "month") {
  const q = query.trim().toLocaleLowerCase("vi-VN");
  const rank = (row: DiamondReportRow) => mode === "month" ? row.month_rank : row.day_rank;
  return rows.filter(row => (team === "all" || (team === "mine" ? row.is_my_team : (row.operator_id ?? "unassigned") === team))
    && (!q || `${row.display_name} ${row.username ?? ""}`.toLocaleLowerCase("vi-VN").includes(q)))
    .sort((a, b) => (rank(a) ?? Infinity) - (rank(b) ?? Infinity) || a.display_name.localeCompare(b.display_name, "vi"));
}
