import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let verified = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Verifies signatures; never authorize with getSession(). Guards also query the live profile.
    try {
      const { data, error } = await supabase.auth.getClaims();
      verified = !error && Boolean(data?.claims?.sub);
    } catch { /* Protected routes independently fail closed. */ }
  }
  const publicRoute = request.nextUrl.pathname === "/login" || request.nextUrl.pathname.startsWith("/auth/");
  if (!verified && !publicRoute) {
    const destination = request.nextUrl.clone();
    destination.pathname = "/login";
    destination.search = "";
    const redirect = NextResponse.redirect(destination);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export const config = {
  matcher: ["/reports", "/api/imports", "/notifications", "/api/notifications/:path*", "/home", "/api/homepage/:path*", "/api/attendance/:path*", "/", "/login", "/auth/:path*", "/pending", "/suspended", "/account-unavailable", "/admin/:path*", "/operator/:path*", "/idol/:path*", "/profile", "/complete-profile", "/modules/:path*"],
};

