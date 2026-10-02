import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/database";
import { accountDestination, validatedAppOrigin, needsProfileCompletion } from "./routing";

export const authConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export const appOrigin = () => validatedAppOrigin(process.env.APP_URL, process.env.NODE_ENV === "production");

export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null, profile: null };
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("Không tải được hồ sơ. Kiểm tra kết nối và migration SQL.");
  return { supabase, user, profile };
});

export async function requireUser() {
  if (!authConfigured()) redirect("/login?error=configuration");
  const context = await getAuthContext();
  if (!context.user) redirect("/login");
  return { ...context, user: context.user };
}

export async function requireActive(role?: Role) {
  const context = await requireUser();
  if (!context.profile || context.profile.status !== "active") redirect(accountDestination(context.profile));
  if (needsProfileCompletion(context.profile)) redirect("/complete-profile");
  if (role && context.profile.role !== role) redirect(accountDestination(context.profile));
  return { ...context, profile: context.profile };
}
