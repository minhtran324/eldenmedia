"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { appOrigin, authConfigured, requireUser } from "./server";

export async function signInWithGoogle() {
  if (!authConfigured()) redirect("/login?error=configuration");
  let origin: string;
  try { origin = appOrigin(); } catch { redirect("/login?error=origin"); }
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data.url) redirect("/login?error=provider");
  redirect(data.url);
}

export async function signOut() {
  if (authConfigured()) {
    const supabase = await createClient({ writable: true });
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error && error.name !== "AuthSessionMissingError") throw new Error("Chưa đăng xuất được. Vui lòng thử lại.");
  }
  redirect("/login");
}

export async function refreshAccess() {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("complete_my_onboarding");
  if (error) redirect("/account-unavailable?error=onboarding");
  redirect("/");
}
