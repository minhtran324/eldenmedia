import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { accountDestination } from "@/lib/auth/routing";
export const dynamic = "force-dynamic";
export default async function Home() {
  const { profile } = await requireUser();
  redirect(accountDestination(profile));
}
