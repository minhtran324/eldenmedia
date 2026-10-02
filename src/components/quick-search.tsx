"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@/types/database";

type SearchItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  category: "Trang chính" | "Nghiệp vụ" | "Cá nhân";
  roles?: Role[];
  icon: string;
};

export function QuickSearch({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const searchItems: SearchItem[] = [
    {
      id: "home",
      title: "Trang chủ công ty",
      subtitle: "Bảng tin, sự kiện, ranking kim cương và sinh nhật",
      href: "/home",
      category: "Trang chính",
      icon: "🏠",
    },
    {
      id: "schedule",
      title: "Lịch live & Phân phòng",
      subtitle: "Đăng ký ca làm 5 tiếng, duyệt và xem phòng live",
      href: `/${role}/schedule`,
      category: "Nghiệp vụ",
      icon: "📅",
    },
    {
      id: "operations",
      title: "Ca live & Thiết bị",
      subtitle: "Quét QR nhận/trả máy, camera check-in và checkout",
      href: `/${role}/operations`,
      category: "Nghiệp vụ",
      icon: "📱",
    },
    ...(role !== "idol"
      ? [
          {
            id: "resources",
            title: "Phòng & Điện thoại",
            subtitle: "Quản lý danh mục tầng, phòng livestream và thiết bị",
            href: `/${role}/resources`,
            category: "Nghiệp vụ" as const,
            icon: "🏢",
          },
        ]
      : []),
    ...(role === "admin"
      ? [
          {
            id: "admin-members",
            title: "Quản trị nhân sự",
            subtitle: "Duyệt Idol, phân công team và cấp quyền vận hành",
            href: "/admin",
            category: "Trang chính" as const,
            icon: "👥",
          },
          {
            id: "admin-content",
            title: "Quản lý bảng tin",
            subtitle: "Đăng poster, sự kiện, thông báo ghim trang chủ",
            href: "/admin/content",
            category: "Trang chính" as const,
            icon: "📢",
          },
          {
            id: "admin-imports",
            title: "Nhập Excel TikTok",
            subtitle: "Tải lên và đối soát số liệu kim cương TikTok",
            href: "/admin/imports",
            category: "Nghiệp vụ" as const,
            icon: "📥",
          },
        ]
      : []),
    {
      id: "reports",
      title: "Số liệu kim cương",
      subtitle: "Báo cáo thành tích và lịch sử doanh thu live",
      href: "/reports",
      category: "Nghiệp vụ",
      icon: "💎",
    },
    {
      id: "notifications",
      title: "Hộp thư thông báo",
      subtitle: "Xem thông báo lịch live, mượn phòng, máy và sinh nhật",
      href: "/notifications",
      category: "Cá nhân",
      icon: "🔔",
    },
    {
      id: "profile",
      title: "Hồ sơ của tôi",
      subtitle: "Thông tin cá nhân, nickname và liên hệ",
      href: "/profile",
      category: "Cá nhân",
      icon: "👤",
    },
  ];

  const filtered = query.trim()
    ? searchItems.filter(
        item =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.subtitle.toLowerCase().includes(query.toLowerCase()) ||
          item.category.toLowerCase().includes(query.toLowerCase())
      )
    : searchItems;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(prev => {
          if (!prev) {
            setQuery("");
            setSelectedIndex(0);
          }
          return !prev;
        });
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  function handleSelect(item: SearchItem) {
    setOpen(false);
    router.push(item.href);
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      handleSelect(filtered[selectedIndex]);
    }
  }

  return (
    <>
      <button
        type="button"
        className="topbar-search-trigger"
        onClick={() => {
          setQuery("");
          setSelectedIndex(0);
          setOpen(true);
        }}
        aria-label="Tìm kiếm hoặc điều hướng nhanh"
        title="Nhấn Ctrl + K để tìm kiếm nhanh"
      >
        <svg
          className="search-icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="search-placeholder">Tìm trang, ca live, phòng...</span>
        <kbd className="search-kbd">Ctrl K</kbd>
      </button>

      {open && (
        <div className="search-modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="search-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Tìm kiếm nhanh"
          >
            <div className="search-modal-header">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="search-modal-icon"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                className="search-modal-input"
                placeholder="Nhập tên phân hệ, lịch, phòng, báo cáo..."
                value={query}
                onChange={e => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
              />
              <button
                type="button"
                className="search-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Đóng tìm kiếm"
              >
                ✕
              </button>
            </div>

            <div className="search-modal-results">
              {filtered.length === 0 ? (
                <div className="search-modal-empty">
                  <p>Không tìm thấy mục nào khớp với &quot;{query}&quot;</p>
                  <span>Thử tìm &quot;lịch&quot;, &quot;phòng&quot;, &quot;bảng tin&quot; hoặc &quot;thông báo&quot;</span>
                </div>
              ) : (
                filtered.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`search-result-item ${index === selectedIndex ? "selected" : ""}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className="search-result-icon">{item.icon}</span>
                    <div className="search-result-info">
                      <span className="search-result-title">{item.title}</span>
                      <span className="search-result-subtitle">{item.subtitle}</span>
                    </div>
                    <span className="search-result-category">{item.category}</span>
                  </button>
                ))
              )}
            </div>

            <div className="search-modal-footer">
              <span>
                <kbd>↑</kbd> <kbd>↓</kbd> để di chuyển
              </span>
              <span>
                <kbd>↵</kbd> để chọn
              </span>
              <span>
                <kbd>ESC</kbd> để đóng
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
