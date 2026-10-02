import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./accounts.css";
import "./scheduling.css";
import "./weekly-schedule.css";
import "./trial-live.css";
import "./operations.css";
import "./homepage.css";
import "./notifications.css";
import "./imports.css";
import "./pwa.css";
import "./toast.css";
import "./resources.css";
import "./content-admin.css";
import "./reports.css";
import "./role-desk.css";
import "./diamond-access.css";
import "./onboarding.css";
import { PwaProvider } from "@/components/pwa-provider";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: { default: "Elden Media | Quản lý nội bộ", template: "%s | Elden Media" },
  description: "Không gian quản lý lịch live, phòng, điện thoại và nhân sự Elden Media.",
  appleWebApp: { capable: true, title: "Elden Media", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/elden-v2/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/elden-v2/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/elden-v2/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = { themeColor: "#0284c7" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PwaProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </PwaProvider>
      </body>
    </html>
  );
}




