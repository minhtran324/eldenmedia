"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImportantNotifications } from "./important-notifications";
import {
  NOTIFICATION_CATEGORIES,
  visibleNotificationCategories,
  visibleNotificationCounts,
  type NotificationCount,
} from "@/lib/notifications";

const CATEGORY_ICONS: Record<string, string> = {
  schedule: "📅",
  rooms: "🏢",
  devices: "📱",
  attendance: "📸",
  birthdays: "🎂",
  system: "⚙️",
};

export function NotificationBell({
  role,
  profileId,
}: {
  role: import("@/types/database").Role;
  profileId: string;
}) {
  const [counts, setCounts] = useState<NotificationCount[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [realtime, setRealtime] = useState(false);

  useEffect(() => {
    let running = false;
    const controller = new AbortController();
    async function refresh() {
      if (running || document.hidden) return;
      running = true;
      try {
        const response = await fetch("/api/notifications/counts", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const data: NotificationCount[] = await response.json();
        if (!controller.signal.aborted) {
          setCounts(data);
          setFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    const update = () => {
      void refresh();
    };
    window.addEventListener("focus", update);
    window.addEventListener("notifications-changed", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("notifications-changed", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [role]);

  useEffect(() => {
    if (!profileId || !navigator.onLine) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${profileId}`)
      .on(`postgres_changes`,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${profileId}`,
        },
        () => window.dispatchEvent(new Event("notifications-changed"))
      )
      .subscribe(status => {
        setRealtime(status === "SUBSCRIBED");
      });
    return () => {
      setRealtime(false);
      void supabase.removeChannel(channel);
    };
  }, [profileId]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const total =
    (counts ? visibleNotificationCounts(role, counts) : null)?.reduce(
      (sum, c) => sum + Number(c.unread_count),
      0
    ) ?? 0;

  return (
    <><ImportantNotifications role={role} /><div className="notification-bell" ref={container}>
      <button
        ref={button}
        type="button"
        className={`bell-button ${total > 0 ? "has-unread" : ""}`}
        aria-label={
          failed
            ? "Thông báo: chưa tải được số chưa đọc"
            : `Thông báo${counts ? `, ${total} chưa đọc` : ""}`
        }
        aria-expanded={open}
        aria-controls="notification-popover"
        onClick={() => {
          setOpen(!open);
          window.dispatchEvent(new Event("notifications-changed"));
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {!failed && total > 0 && (
          <span className="bell-badge">
            <span className="bell-badge-ping" />
            <span className="bell-badge-text">{total > 99 ? "99+" : total}</span>
          </span>
        )}
        {failed && <span className="bell-badge-error" aria-hidden="true">!</span>}
      </button>

      {open && (
        <section
          id="notification-popover"
          className="notification-popover"
          aria-label="Các hộp thư thông báo"
        >
          <div className="popover-header">
            <div>
              <strong className="popover-title">Hộp thư thông báo</strong>
              <p className="popover-sub">6 luồng phân loại độc lập</p>
            </div>
            {total > 0 && (
              <span className="popover-total-tag">
                {total} tin mới
              </span>
            )}
          </div>

          {failed ? (
            <p className="popover-error" role="alert">
              Chưa tải được số chưa đọc. Thử mở lại chuông.
            </p>
          ) : !counts ? (
            <div className="popover-loading">Đang kiểm tra thông báo…</div>
          ) : (
            <nav className="popover-nav">
              {visibleNotificationCategories(role).map(key => {
                const unread = counts.find(c => c.category === key)?.unread_count ?? 0;
                return (
                  <Link
                    key={key}
                    href={`/notifications?category=${key}`}
                    className={`popover-item ${unread > 0 ? "has-item-unread" : ""}`}
                    onClick={() => setOpen(false)}
                  >
                    <span className="popover-item-left">
                      <span className="popover-category-icon">
                        {CATEGORY_ICONS[key] ?? "📌"}
                      </span>
                      <span className="popover-item-name">
                        {NOTIFICATION_CATEGORIES[key]}
                      </span>
                    </span>
                    <span className={`popover-item-count ${unread > 0 ? "count-active" : ""}`}>
                      {unread}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="popover-footer">
            <span className="popover-live-status" aria-live="polite">
              {realtime ? "● Cập nhật trực tiếp" : "↻ Tự kiểm tra mỗi phút"}
            </span>
            <Link
              href="/notifications"
              className="popover-view-all"
              onClick={() => setOpen(false)}
            >
              Mở toàn bộ hộp thư thông báo
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}
    </div></>
  );
}



