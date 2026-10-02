import Link from "next/link";
import { notFound } from "next/navigation";
import { modules } from "@/lib/modules";

export function generateStaticParams() { return modules.map(({ slug }) => ({ slug })); }

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = modules.find((entry) => entry.slug === slug);
  if (!item) notFound();
  return <main className="shell detail"><Link className="back" href="/">← Trang tổng quan</Link><p className="eyebrow">{item.audience}</p><h1>{item.title}</h1><p className="lead">{item.description}</p><section className="panel"><span className="badge">Phạm vi dự kiến · Chưa hoạt động</span><h2>Luồng sẽ triển khai</h2><ul>{item.tasks.map((task) => <li key={task}>{task}</li>)}</ul></section><p className="muted">Trang này chưa đọc hoặc ghi dữ liệu thật. Quyền truy cập sẽ được kiểm tra ở máy chủ và cơ sở dữ liệu khi triển khai chức năng.</p></main>;
}
