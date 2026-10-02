import { ScheduleWorkspace } from "@/components/schedule-workspace";
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; page?: string; borrowPage?: string; tab?: string }> }) { return <ScheduleWorkspace role="operator" params={await searchParams} />; }
