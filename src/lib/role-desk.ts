import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Profile } from "@/types/database";
import { vietnamToday } from "@/lib/scheduling";
import type { OperationRow } from "@/lib/operations-flow";
import type { DiamondReportRow } from "@/lib/diamonds";

export type DeskMember = { id: string; name: string; username: string | null; status: string };
export type RoleDeskData = {
  role: "operator" | "idol"; name: string; day: string; members: DeskMember[];
  operations: OperationRow[]; diamonds: DiamondReportRow[]; pendingRequests: number | null;
  manager: string | null; errors: string[];
};
export async function loadRoleDesk(profile: Profile, supabase: SupabaseClient<Database>): Promise<RoleDeskData> {
  const day=vietnamToday();
  const [operations, diamonds, members, accounts, requests, manager] = await Promise.all([
    supabase.rpc("idol_operations_day",{day}), supabase.rpc("diamond_report_rows",{report_date:day}),
    profile.role==="operator" ? supabase.from("profiles").select("id,full_name,nickname,status").eq("role","idol").order("full_name") : Promise.resolve({data:[],error:null}),
    profile.role==="operator" ? supabase.from("platform_accounts").select("idol_id,username") : Promise.resolve({data:[],error:null}),
    supabase.from("requests").select("id",{count:"exact",head:true}).eq("status","pending"),
    profile.role==="idol" ? supabase.rpc("my_operator_summary",{}) : Promise.resolve({data:[],error:null}),
  ]);
  const errors:string[]=[];
  if(operations.error) errors.push("Chưa tải được ca live. Kiểm tra kết nối và SQL 019.");
  if(diamonds.error) errors.push("Chưa tải được kim cương. Cần cập nhật SQL 023.");
  if(members.error || accounts.error) errors.push("Chưa tải được danh sách team.");
  if(requests.error) errors.push("Chưa tải được yêu cầu chờ xử lý.");
  if(manager.error) errors.push("Chưa tải được Vận hành phụ trách.");
  return {role:profile.role as "operator"|"idol",name:profile.nickname || profile.full_name,day,
    operations:operations.data ?? [],diamonds:(diamonds.data ?? []).filter(r=>profile.role==="idol" ? r.idol_id===profile.id : r.is_my_team),
    members:(members.data ?? []).map(m=>({id:m.id,name:m.full_name,username:accounts.data?.find(a=>a.idol_id===m.id)?.username ?? null,status:m.status})),
    pendingRequests:requests.error ? null : requests.count ?? 0,manager:manager.data?.[0]?.full_name ?? null,errors};
}
