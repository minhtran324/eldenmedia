"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, useEffect } from "react";
import { NotificationBell } from "./notification-bell";
import { QuickSearch } from "./quick-search";
import { signOut } from "@/lib/auth/actions";
import { accountDestination, ROLE_LABELS } from "@/lib/auth/routing";
import type { Profile } from "@/types/database";
import { SubmitButton } from "./account-forms";
import { PwaStatus } from "./pwa-provider";

const WorkspaceContext = createContext<boolean>(false);

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link href="/home" className="brand-link" aria-label="Elden Media Trang chủ">
      <div className="brand-logo-wrap">
        <Image
          src="/image/logo.png"
          alt="Elden Media Logo"
          width={40}
          height={26}
          priority
          className="brand-logo-img"
        />
      </div>
      {!collapsed && (
        <div className="brand-text">
          <span className="brand-title">ELDEN MEDIA</span>
          <span className="brand-sub">WORKSPACE</span>
        </div>
      )}
    </Link>
  );
}

export function WorkspaceShell({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const isNested = useContext(WorkspaceContext);
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const [isNavigating, setIsNavigating] = useState(false);

  // Close mobile drawer and reset navigation progress on route change
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setMobileMenuOpen(false);
    setIsNavigating(false);
  }

  // Listen for clicks on internal links to provide instant feedback without layout shift
  useEffect(() => {
    function handleLinkClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        target.getAttribute("target") === "_blank"
      ) {
        return;
      }
      if (href.startsWith("/") && href !== pathname) {
        setIsNavigating(true);
      }
    }
    document.addEventListener("click", handleLinkClick, { capture: true });
    return () => {
      document.removeEventListener("click", handleLinkClick, { capture: true });
    };
  }, [pathname]);

  // Clock for topbar
  useEffect(() => {
    function updateClock() {
      const now = new Date();
      setCurrentTime(
        new Intl.DateTimeFormat("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
        }).format(now)
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 30000);
    return () => clearInterval(interval);
  }, []);

  // If already wrapped by a parent WorkspaceShell (from layout), don't duplicate the shell
  if (isNested) {
    return <>{children}</>;
  }

  const roleHome = accountDestination(profile);

  const navItems = [
    {
      group: "TỔNG QUAN & TIN TỨC",
      links: [
        {
          href: "/home",
          label: "Trang chủ công ty",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          ),
          active: pathname === "/home",
        },
        ...(profile.role === "admin"
          ? [
              {
                href: "/admin/content",
                label: "Quản lý bảng tin",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
                    <path d="M18 14h-8" />
                    <path d="M15 18h-5" />
                    <path d="M10 6h8v4h-8V6Z" />
                  </svg>
                ),
                active: pathname === "/admin/content",
              },
            ]
          : []),
        {
          href: roleHome,
          label: `Bàn làm việc ${ROLE_LABELS[profile.role]}`,
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="9" x="3" y="3" rx="1" />
              <rect width="7" height="5" x="14" y="3" rx="1" />
              <rect width="7" height="9" x="14" y="12" rx="1" />
              <rect width="7" height="5" x="3" y="16" rx="1" />
            </svg>
          ),
          active: pathname === roleHome,
        },
      ],
    },
    {
      group: "VẬN HÀNH CA LIVE",
      links: [
        ...(profile.role !== "idol"
          ? [
              {
                href: `/${profile.role}/resources`,
                label: "Phòng & Điện thoại",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
                    <path d="M9 22v-4h6v4" />
                    <path d="M8 6h.01" />
                    <path d="M16 6h.01" />
                    <path d="M12 6h.01" />
                    <path d="M12 10h.01" />
                    <path d="M12 14h.01" />
                    <path d="M16 10h.01" />
                    <path d="M16 14h.01" />
                    <path d="M8 10h.01" />
                    <path d="M8 14h.01" />
                  </svg>
                ),
                active: pathname === `/${profile.role}/resources`,
              },
            ]
          : []),
        {
          href: `/${profile.role}/schedule`,
          label: "Lịch live tuần",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </svg>
          ),
          active: pathname.startsWith(`/${profile.role}/schedule`),
        },
        {
          href: `/${profile.role}/operations`,
          label: "Ca live & Thiết bị",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          ),
          active: pathname === `/${profile.role}/operations`,
        },
      ],
    },
    {
      group: "SỐ LIỆU & TIỆN ÍCH",
      links: [
        ...(profile.role === "admin"
          ? [
              {
                href: "/admin/imports",
                label: "Nhập Excel TikTok",
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h2" />
                    <path d="M8 17h2" />
                    <path d="M14 13h2" />
                    <path d="M14 17h2" />
                  </svg>
                ),
                active: pathname === "/admin/imports",
              },
            ]
          : []),
        {
          href: "/reports",
          label: "Số liệu kim cương",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3h12l4 6-10 12L2 9Z" />
              <path d="M11 3 8 9l4 12 4-12-3-6" />
              <path d="M2 9h20" />
            </svg>
          ),
          active: pathname === "/reports",
        },
        {
          href: "/notifications",
          label: "Hộp thư thông báo",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
            </svg>
          ),
          active: pathname.startsWith("/notifications"),
        },
        {
          href: "/profile",
          label: "Hồ sơ của tôi",
          icon: (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
          active: pathname === "/profile",
        },
        {
          href: "/install",
          label: "Cài ứng dụng",
          icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" /></svg>,
          active: pathname === "/install",
        },
      ],
    },
  ];

  return (
    <WorkspaceContext.Provider value={true}>
      <div className="workspace">
        {/* Mobile Backdrop */}
        {mobileMenuOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main Sidebar */}
        <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
          <div className="sidebar-brand-row">
            <Brand />
            <button
              type="button"
              className="mobile-close-btn"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Đóng menu"
            >
              ✕
            </button>
          </div>

          <nav className="sidebar-nav" aria-label="Điều hướng hệ thống">
            {navItems.map(group => (
              <div key={group.group} className="nav-group">
                <span className="sidebar-label">{group.group}</span>
                <div className="nav-links-list">
                  {group.links.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`nav-item ${link.active ? "active" : ""}`}
                      aria-current={link.active ? "page" : undefined}
                    >
                      <span className="nav-icon">{link.icon}</span>
                      <span className="nav-text">{link.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* User Card at bottom of sidebar */}
          <div className="sidebar-bottom">
            <div className="sidebar-user-card">
              <div className="sidebar-user-avatar" aria-hidden="true">
                {(profile.full_name || profile.nickname || "?").charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-user-details">
                <span className="sidebar-user-name">
                  {profile.nickname ? `${profile.nickname} (${profile.full_name})` : profile.full_name || "Thành viên Elden"}
                </span>
                <span className={`role-pill role-${profile.role}`}>
                  {ROLE_LABELS[profile.role]}
                </span>
              </div>
            </div>
            <form action={signOut} className="sidebar-logout-form">
              <SubmitButton secondary>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
                Đăng xuất
              </SubmitButton>
            </form>
          </div>
        </aside>

        {/* Main Workspace Content Area */}
        <div className="workspace-content-wrap">
          {/* Top route progress bar */}
          {isNavigating && <div className="top-route-progress" aria-hidden="true" />}

          <header className="workspace-top">
            <div className="topbar-left">
              <button
                type="button"
                className="mobile-hamburger-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Mở menu điều hướng"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="topbar-context">
                <span className="topbar-brand">Elden Media</span>
                <span className="slash">/</span>
                <span className="topbar-context-text">Không gian vận hành</span>
              </div>
            </div>

            <div className="topbar-center">
              <QuickSearch role={profile.role} />
            </div>

            <div className="topbar-right">
              {currentTime && (
                <span className="live-clock-badge" title="Giờ Việt Nam (Asia/Ho_Chi_Minh)">
                  <span className="live-dot" />
                  {currentTime}
                </span>
              )}
              <NotificationBell key={`${profile.id}:${profile.role}`} role={profile.role} profileId={profile.id} />
            </div>
          </header>

          <main className="workspace-main"><PwaStatus />{children}</main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
}

