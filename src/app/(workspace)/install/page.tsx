import Link from "next/link";
import { Brand } from "@/components/workspace-shell";
import { InstallApp } from "@/components/install-app";
import { PwaStatus } from "@/components/pwa-provider";

export const metadata = { title: "Cài ứng dụng" };

// Public instructions contain no employee or account data.
export default function InstallPage() {
  return <main className="install-page">
    <header className="install-header"><Brand /><Link href="/home" className="btn secondary">Về trang chủ</Link></header>
    <PwaStatus />
    <InstallApp />
  </main>;
}
