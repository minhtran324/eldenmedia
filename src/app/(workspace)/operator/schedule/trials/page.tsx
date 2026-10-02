import { TrialLiveWorkspace } from "@/components/trial-live-workspace";
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  return <TrialLiveWorkspace role="operator" params={await searchParams} />;
}
