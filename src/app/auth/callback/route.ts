import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/auth/server";

export async function GET(request: NextRequest) {
  let origin: string;
  try { origin = appOrigin(); }
  catch { return new NextResponse("APP_URL chưa được cấu hình đúng.", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const code = request.nextUrl.searchParams.get("code");
  // PKCE verifier is read from the browser's cookie by @supabase/ssr.
  if (code && !request.nextUrl.searchParams.has("error")) {
    const supabase = await createClient({ writable: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { error: onboardingError } = await supabase.rpc("complete_my_onboarding");
      return NextResponse.redirect(new URL(onboardingError ? "/account-unavailable?error=onboarding" : "/", origin));
    }
  }
  // Never use callback-supplied next/redirect URLs or expose OAuth tokens in errors.
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
