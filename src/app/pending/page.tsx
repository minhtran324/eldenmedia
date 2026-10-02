import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { accountDestination } from "@/lib/auth/routing";
import { OnboardingProfileView } from "@/components/onboarding-profile-view";

export default async function Pending() {
  const { user, profile, supabase } = await requireUser();
  if (!profile || profile.status !== "pending") {
    redirect(accountDestination(profile));
  }

  const { data: tiktok } =
    profile.role === "idol"
      ? await supabase
          .from("platform_accounts")
          .select("username")
          .eq("idol_id", profile.id)
          .maybeSingle()
      : { data: null };

  return (
    <OnboardingProfileView
      profile={profile}
      userEmail={user.email ?? ""}
      initialTiktokUsername={tiktok?.username ?? ""}
      completing={false}
    />
  );
}
