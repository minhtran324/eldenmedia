import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { NotificationRead } from "@/components/notification-read";
import {
  NOTIFICATION_CATEGORIES,
  notificationCategory,
  notificationDestination,
  visibleNotificationCategories,
} from "@/lib/notifications";
import { vnDateTime } from "@/lib/homepage";

const CATEGORY_ICONS: Record<string, string> = {
  schedule: "📅",
  rooms: "🏢",
  devices: "📱",
  attendance: "📸",
  birthdays: "🎂",
  system: "⚙️",
};

const ACTION_LABELS: Record<string, string> = {
  schedule: "Mở lịch live",
  rooms: "Mở lịch live & phòng",
  devices: "Mở ca live & thiết bị",
  attendance: "Xem ca live & check-in",
  birthdays: "Mở trang chủ",
  system: "Mở trang chủ",
};

export default async function Notifications({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string; unread?: string; search?: string }>;
}) {
  const { profile, supabase } = await requireActive();
  const params = await searchParams;
  const category = notificationCategory(params.category, profile.role);
  const unread = params.unread === "1";
  const page = Math.max(1, Math.min(10000, parseInt(params.page ?? "1", 10) || 1));
  const search = (params.search ?? "").trim().slice(0, 100);

  let query = supabase
    .from("notifications")
    .select("id,title,body,created_at,read_at,priority,subject_idol_id,work_date", { count: "exact" })
    .eq("recipient_id", profile.id)
    .eq("category", category);

  if (unread) query = query.is("read_at", null);
  if (search) {
    query = query.or(`title.ilike.%${search}%,body.ilike.%${search}%`);
  }

  const [messages, counts] = await Promise.all([
    query.order("created_at", { ascending: false }).order("id").range((page - 1) * 20, page * 20 - 1),
    supabase.rpc("my_notification_counts", {}),
  ]);

  const base = `/notifications?category=${category}&unread=${unread ? "1" : "0"}${search ? `&search=${encodeURIComponent(search)}` : ""}`;
  const urgentCount = category === "attendance" && unread
    ? (messages.data?.filter(m => m.priority === "important" && !m.read_at).length ?? 0)
    : 0;

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag">
          <span>🔔</span>
          <span>HỘP THƯ CÁ NHÂN</span>
        </div>
        <h1>Hộp thư thông báo</h1>
        <p>Phân loại theo luồng công việc. Chỉ hiển thị thông báo gửi trực tiếp cho bạn.</p>
      </section>

      {/* Category tabs */}
      <nav className="inbox-tabs" aria-label="Luồng thông báo">
        {visibleNotificationCategories(profile.role).map(key => {
          const unreadCount = counts.data?.find(c => c.category === key)?.unread_count ?? 0;
          const isActive = category === key;
          return (
            <Link
              key={key}
              href={`/notifications?category=${key}`}
              className={`inbox-tab-item ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="inbox-tab-icon">{CATEGORY_ICONS[key] ?? "📌"}</span>
              <span className="inbox-tab-label">{NOTIFICATION_CATEGORIES[key]}</span>
              <span className={`inbox-tab-count ${unreadCount > 0 ? "has-unread" : ""}`}>
                {counts.error ? "—" : unreadCount}
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="surface inbox-surface">
        {/* Header */}
        <div className="inbox-heading-bar">
          <div className="inbox-heading-left">
            <span className="inbox-title-icon">{CATEGORY_ICONS[category] ?? "📌"}</span>
            <div>
              <h2 className="inbox-category-title">{NOTIFICATION_CATEGORIES[category]}</h2>
              <span className="inbox-total-text">
                {messages.count ?? 0} thông báo {unread ? "chưa đọc" : search ? "khớp tìm kiếm" : "trong mục này"}
              </span>
            </div>
          </div>
          <Link
            className={`btn secondary btn-compact ${unread ? "active-filter" : ""}`}
            href={`/notifications?category=${category}&unread=${unread ? "0" : "1"}${search ? `&search=${encodeURIComponent(search)}` : ""}`}
          >
            {unread ? "✓ Đang lọc: Chỉ chưa đọc" : "Chỉ xem chưa đọc"}
          </Link>
        </div>

        {/* Search bar */}
        <form method="get" className="inbox-search-bar">
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="unread" value={unread ? "1" : "0"} />
          <div className="inbox-search-wrap">
            <svg className="inbox-search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder={`Tìm trong ${NOTIFICATION_CATEGORIES[category]}… (tên Idol, vận hành, nội dung)`}
              className="inbox-search-input"
            />
          </div>
          <button type="submit" className="btn secondary btn-compact">Tìm</button>
          {search && (
            <Link href={`/notifications?category=${category}&unread=${unread ? "1" : "0"}`} className="btn secondary btn-compact">
              Bỏ lọc
            </Link>
          )}
        </form>

        {/* Urgent banner (attendance + unread + has important) */}
        {urgentCount > 0 && (
          <div className="inbox-urgent-banner" role="alert">
            <span className="urgent-banner-icon">⚠️</span>
            <div>
              <strong>Có {urgentCount} thông báo vi phạm quan trọng chưa đọc</strong>
              <p>Hãy xem xét và xử lý. Vi phạm nghiêm trọng cần được phản hồi trong ngày.</p>
            </div>
          </div>
        )}

        {/* Message list */}
        {messages.error ? (
          <div className="empty-state error-box" role="alert">
            <p>Chưa tải được hộp thư. Kiểm tra kết nối Supabase và đã chạy migration 019.</p>
          </div>
        ) : !messages.data?.length ? (
          <div className="empty-inbox-box">
            <span className="empty-inbox-icon">📬</span>
            <h3>Không có thông báo nào</h3>
            <p className="muted">
              {search
                ? `Không tìm thấy thông báo nào khớp với "${search}".`
                : unread
                ? "Tuyệt vời! Bạn đã đọc hết thông báo trong mục này."
                : "Chưa có thông báo nào được gửi đến bạn trong luồng này."}
            </p>
          </div>
        ) : (
          <div className="inbox-list">
            {messages.data.map(message => {
              const isUnread = !message.read_at;
              const isImportant = message.priority === "important";
              const dest =
                notificationDestination(category, profile.role) +
                ((category === "attendance" || category === "devices") &&
                message.subject_idol_id
                  ? `?idol=${message.subject_idol_id}${message.work_date ? `&day=${message.work_date}` : ""}`
                  : "");

              return (
                <article
                  key={message.id}
                  className={[
                    "inbox-card",
                    isUnread ? "unread" : "read",
                    isImportant ? "important-notification" : "",
                  ].join(" ")}
                >
                  <div className="inbox-card-top">
                    <div className="inbox-card-title-row">
                      <span className={`unread-dot ${isUnread ? "visible" : ""}`} />
                      <div className="inbox-card-title-block">
                        {isImportant && (
                          <span className="operation-tag important inbox-important-tag">⚠ QUAN TRỌNG</span>
                        )}
                        <h3 className="inbox-card-title">{message.title}</h3>
                        {message.subject_idol_id && (
                          <span className="inbox-idol-tag">🎭 Liên quan đến Idol</span>
                        )}
                      </div>
                    </div>
                    <div className="inbox-card-meta">
                      <time className="inbox-time" dateTime={message.created_at}>
                        🕒 {vnDateTime(message.created_at)}
                      </time>
                      <span className={`read-status-badge ${isUnread ? "unread-badge" : "read-badge"}`}>
                        {isUnread ? "Chưa đọc" : "Đã đọc"}
                      </span>
                    </div>
                  </div>

                  <p className="inbox-card-body">{message.body}</p>

                  <div className="inbox-card-actions">
                    <Link className="btn secondary btn-compact action-link" href={dest}>
                      <span>{ACTION_LABELS[category] ?? "Mở trang liên quan"}</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                    {isUnread && <NotificationRead id={message.id} />}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {(messages.count ?? 0) > 20 && (
          <nav className="pagination" aria-label="Trang thông báo">
            <span>Trang {page} / {Math.ceil((messages.count ?? 0) / 20)}</span>
            <div className="pagination-buttons">
              {page > 1 && (
                <Link href={`${base}&page=${page - 1}`} className="btn secondary btn-compact">← Trước</Link>
              )}
              {page * 20 < (messages.count ?? 0) && (
                <Link href={`${base}&page=${page + 1}`} className="btn secondary btn-compact">Sau →</Link>
              )}
            </div>
          </nav>
        )}
      </section>
    </WorkspaceShell>
  );
}
