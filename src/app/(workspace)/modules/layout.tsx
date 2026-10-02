import { requireActive } from "@/lib/auth/server";
export default async function ModulesLayout({ children }: { children: React.ReactNode }) {
  await requireActive();
  return children;
}
