import { OperationsWorkspace } from "@/components/operations-workspace";
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string; day?: string; idol?: string }> }) { const p = await searchParams; return <OperationsWorkspace role="operator" page={Number(p.page) || 1} day={p.day} idol={p.idol} />; }
