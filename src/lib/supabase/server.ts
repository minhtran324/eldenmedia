import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

export async function createClient({ writable = false }: { writable?: boolean } = {}) {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(values) {
        // Server Components are read-only; proxy.ts has already refreshed their session.
        // Auth Route Handlers / Actions explicitly opt in, so cookie-write errors aren't hidden.
        if (writable) values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}
