import { ScheduleRequestWorkspace } from "@/components/schedule-workspace";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ScheduleRequestWorkspace role="admin" id={(await params).id} />; }

