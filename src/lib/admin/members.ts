import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Member } from "@/types/database";

// SQL 005 accepts at most 50 rows per call. HR tabs and totals need every page.
const PAGE_SIZE = 50;

export async function loadAdminMembers(
  supabase: Pick<SupabaseClient<Database>, "rpc">,
): Promise<{ data: Member[] | null; error: PostgrestError | null }> {
  const members: Member[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await supabase.rpc("admin_members", {
      search_text: "",
      page_number: page,
      page_size: PAGE_SIZE,
    });

    // A failed later page must not turn into an apparently complete HR report.
    if (error) return { data: null, error };

    const rows = data ?? [];
    members.push(...rows);
    if (rows.length < PAGE_SIZE || members.length >= Number(rows[0]?.total_count)) {
      return { data: members, error: null };
    }
    page += 1;
  }
}
