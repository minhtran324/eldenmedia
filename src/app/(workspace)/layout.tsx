import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireActive();
  return <WorkspaceShell profile={profile}>{children}</WorkspaceShell>;
}
