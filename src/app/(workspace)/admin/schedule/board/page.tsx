import { RoomBoard } from "@/components/room-board";
export default async function Page({ searchParams }: { searchParams: Promise<{ date?: string; request?: string; page?: string }> }) { return <RoomBoard role="admin" params={await searchParams} />; }
