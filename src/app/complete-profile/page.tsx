import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { accountDestination, needsProfileCompletion } from "@/lib/auth/routing";
import { OnboardingProfileView } from "@/components/onboarding-profile-view";

export default async function CompleteProfile() {
  const { profile, user, supabase } = await requireUser();
  if (!profile || profile.status !== "active" || !needsProfileCompletion(profile)) {
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
      completing
    />
  );
}
