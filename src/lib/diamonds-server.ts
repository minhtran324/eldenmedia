import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export async function getDiamondVisibilitySettings(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("company_settings")
    .select("operator_can_view_diamonds,idol_can_view_diamonds").eq("id", true).maybeSingle();
  return { operatorCanView: !error && data?.operator_can_view_diamonds === true,
    idolCanView: !error && data?.idol_can_view_diamonds === true, available: !error && Boolean(data) };
}
