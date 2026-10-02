"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";
import type { Role } from "@/types/database";

const SEEN_STORAGE_KEY = "elden_seen_important_toasts";

function getSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markIdSeen(id: string) {
  if (typeof window === "undefined") return;
  try {
    const set = getSeenIds();
    set.add(id);
    sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

export function ImportantNotifications({ role }: { role: Role }) {
  const [count, setCount] = useState(0);
  const seenRef = useRef(new Set<string>());
  const { error: showAlert } = useToast();
  const isAdmin = role === "admin";

  useEffect(() => {
    // Admin oversees everything — no toast spam, no badge.
    if (isAdmin) return;

    const controller = new AbortController();
    let running = false;

    async function refresh() {
      if (running || document.hidden || !navigator.onLine) return;
      running = true;
      try {
        const response = await fetch("/api/notifications/important", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result: {
          count: number;
          latest: { id: string; title: string; body: string } | null;
        } = await response.json();

        if (controller.signal.aborted) return;
        setCount(result.count);

        if (result.latest) {
          const storedSeen = getSeenIds();
          // Chỉ hiển thị toast nếu chưa từng thấy hoặc chưa đọc trong phiên
          if (!storedSeen.has(result.latest.id) && !seenRef.current.has(result.latest.id)) {
            seenRef.current.add(result.latest.id);
            markIdSeen(result.latest.id);
            showAlert(result.latest.title, result.latest.body);
          }
        }
      } catch {
        /* The inbox retains the notification; reconnect will refresh it. */
      } finally {
        running = false;
      }
    }

    const update = () => {
      void refresh();
    };

    update();
    const timer = setInterval(update, 60000);
    window.addEventListener("notifications-changed", update);
    window.addEventListener("online", update);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);

    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("notifications-changed", update);
      window.removeEventListener("online", update);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [showAlert, isAdmin]);

  if (isAdmin || !count) return null;

  return (
    <Link
      className="important-notice-button"
      href="/notifications?category=attendance&unread=1"
      aria-label={`${count} thông báo vi phạm quan trọng chưa đọc`}
    >
      ⚠ {count} quan trọng
    </Link>
  );
}
