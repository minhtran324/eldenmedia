import { requireActive } from "@/lib/auth/server";
import { loadRoleDesk } from "@/lib/role-desk";
import { RoleDesk } from "@/components/role-desk";
export default async function Page() {
  const { profile, supabase } = await requireActive("idol");
  return <RoleDesk data={await loadRoleDesk(profile, supabase)} />;
}
