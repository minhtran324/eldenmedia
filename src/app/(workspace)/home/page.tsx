/* Private images require session cookies; skip the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {
  Calendar,
  Radio,
  Bell,
  Megaphone,
  Pin,
  Clock,
  MapPin,
  ExternalLink,
  Plus,
  Cake,
  Sparkles,
  Trophy,
  ChevronRight,
  TrendingUp,
  Users,
} from "lucide-react";
import { requireActive } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace-shell";
import { POST_LABELS, vnDateTime } from "@/lib/homepage";
import { ROLE_LABELS } from "@/lib/auth/routing";
import { validDate, vietnamToday, addDays } from "@/lib/scheduling";
import { Home3DStage } from "@/components/home-3d-stage";
import { HomeDiamondPodium } from "@/components/home-diamond-podium";


function formatDiamonds(val: string | number | null | undefined): string {
  if (val == null || val === "") return "0";
  try {
    const raw = BigInt(val).toString();
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } catch {
    const str = String(val).trim();
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; month?: string }>;
}) {
  const { profile, supabase } = await requireActive();
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, parseInt(params.page ?? "1", 10) || 1));
  const now = new Date().toISOString();
  const currentMonth = vietnamToday().slice(0, 7);
  const prevMonthDate = addDays(vietnamToday(), -30);
  const selectedMonth =
    params.month &&
    /^\d{4}-\d{2}$/.test(params.month) &&
    validDate(`${params.month}-01`) &&
    params.month <= currentMonth
      ? params.month
      : null;

  const pageHref = (nextPage: number) =>
    `/home?page=${nextPage}${selectedMonth ? `&month=${selectedMonth}` : ""}`;

  const [posts, initialRanking, birthdays] = await Promise.all([
    supabase
      .from("homepage_posts")
      .select("*", { count: "exact" })
      .eq("status", "published")
      .contains("audience", [profile.role])
      .neq("title", "__app_diamond_visibility__")
      .lte("publish_from", now)
      .or(`publish_until.is.null,publish_until.gt.${now}`)
      .order("pinned", { ascending: false })
      .order("sort_order")
      .order("publish_from", { ascending: false })
      .order("id")
      .range((page - 1) * 12, page * 12 - 1),
    supabase.rpc(
      "homepage_diamond_ranking",
      selectedMonth
        ? { period_kind: "month", period_date: `${selectedMonth}-01` }
        : {}
    ),
    supabase.rpc("homepage_birthdays_today", {}),

  ]);

  // Fallback: If current month has no published data yet, automatically show previous month's final ranking
  const ranking =
    initialRanking.data && initialRanking.data.length > 0
      ? initialRanking
      : !selectedMonth
      ? await supabase.rpc("homepage_diamond_ranking", {
          period_kind: "month",
          period_date: `${prevMonthDate.slice(0, 7)}-01`,
        })
      : initialRanking;

  const rankingList = ranking.data ?? [];
  const top1to3 = rankingList.slice(0, 3);
  const theRoster = rankingList.slice(3, 8); // Ranks 4-8 for the sidebar roster
  const userDisplayName = profile.nickname || profile.full_name || "bạn";

  const maxRosterDiamonds = theRoster.length && top1to3[0]?.diamonds_total
    ? BigInt(top1to3[0].diamonds_total || 1)
    : BigInt(1);

  return (
    <WorkspaceShell profile={profile}>
      {/* ── 3D LiveStream Hero Stage ── */}
      <section className="home-hero-livestream" suppressHydrationWarning>
        {/* Interactive Three.js 3D Canvas Background */}
        <Home3DStage />

        <div className="home-hero-livestream-content">
          <div className="live-broadcast-chip">
            <span className="live-signal-indicator" />
            <Radio className="w-3.5 h-3.5 text-sky-300" />
            <span className="live-chip-text">TIKTOK LIVE CREATOR NETWORK</span>
            <span className="live-audio-wave">
              <span className="bar bar-1" />
              <span className="bar bar-2" />
              <span className="bar bar-3" />
              <span className="bar bar-4" />
            </span>
          </div>

          <h1 className="home-livestream-title">
            Chào mừng, <span className="text-glow-cyan">{userDisplayName}</span>!
          </h1>

          <p className="home-livestream-sub">
            Your Team. Your Stage. Cùng nhau tỏa sáng và bứt phá doanh thu trong từng ca live.
          </p>

          <div className="home-livestream-actions">
            <Link href={`/${profile.role}/schedule`} className="stream-btn primary">
              <Calendar className="w-4 h-4 text-white" />
              <span>Lịch live tuần này</span>
            </Link>
            <Link href={`/${profile.role}/operations`} className="stream-btn secondary">
              <Radio className="w-4 h-4 text-sky-400" />
              <span>Ca live & Quét QR</span>
            </Link>
            <Link href="/reports" className="stream-btn highlight">
              <Trophy className="w-4 h-4 text-amber-300" />
              <span>Bảng vàng Kim cương</span>
            </Link>
            <Link href="/notifications" className="stream-btn secondary">
              <Bell className="w-4 h-4 text-slate-300" />
              <span>Thông báo</span>
            </Link>
            {profile.role === "admin" && (
              <Link href="/admin/content" className="stream-btn secondary">
                <Megaphone className="w-4 h-4 text-cyan-300" />
                <span>Bảng tin</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── TOP 3 DIAMOND PODIUM POSTER (FEATURED CENTER STAGE) ── */}
      <HomeDiamondPodium
        ranking={rankingList}

        selectedMonth={selectedMonth}
        currentMonth={currentMonth}
        role={profile.role}
      />

      {/* ── Main Content Grid: Feed (Left) & Sidebar Roster/Birthdays (Right) ── */}
      <div className="home-columns">
        {/* Main Feed Column */}
        <div className="home-main-col">
          <div className="feed-header">
            <div className="feed-title-block">
              <span className="section-eyebrow">
                <Sparkles className="w-3.5 h-3.5 text-sky-500 inline mr-1" />
                BẢNG TIN NỘI BỘ
              </span>
              <h2 className="feed-title">Tin tức & Sự kiện nổi bật</h2>
            </div>
            {profile.role === "admin" && (
              <Link href="/admin/content" className="btn secondary btn-compact btn-add-post">
                <Plus className="w-4 h-4 mr-1 text-sky-500" />
                <span>Đăng bài mới</span>
              </Link>
            )}
          </div>

          <section className="home-feed" aria-label="Bảng tin công ty">
            {posts.error ? (
              <div className="surface error-surface" role="alert">
                <p>Chưa tải được bảng tin. Vui lòng thử tải lại trang.</p>
              </div>
            ) : !posts.data?.length ? (
              <div className="surface empty-feed-card">
                <div className="empty-feed-graphic">
                  <Megaphone className="w-10 h-10 text-sky-400 opacity-60" />
                </div>
                <h3>Chưa có bài viết mới</h3>
                <p className="muted">
                  Các thông báo, poster và sự kiện của công ty sẽ được công bố tại đây.
                </p>
              </div>
            ) : (
              posts.data.map((post) => (
                <article className="surface home-post-card" key={post.id}>
                  <div className="post-header">
                    <div className="post-tags">
                      {post.pinned && (
                        <span className="post-tag tag-pinned">
                          <Pin className="w-3 h-3 text-red-500" />
                          <span>ĐÃ GHIM</span>
                        </span>
                      )}
                      <span className={`post-tag tag-${post.kind}`}>
                        {POST_LABELS[post.kind]}
                      </span>
                    </div>
                    <time className="post-time" dateTime={post.publish_from}>
                      <Clock className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                      {vnDateTime(post.publish_from)}
                    </time>
                  </div>

                  <h3 className="post-title">{post.title}</h3>

                  {post.image_path && (
                    <div className="post-image-wrap">
                      <img
                        src={`/api/homepage/media/${post.id}`}
                        alt={post.title}
                        loading="lazy"
                        className="post-image"
                      />
                    </div>
                  )}

                  {post.body && <p className="post-body">{post.body}</p>}

                  {post.kind === "event" && post.event_starts_at && (
                    <div className="event-info-box">
                      <div className="event-time-row">
                        <Clock className="w-4 h-4 text-sky-500" />
                        <strong>
                          {vnDateTime(post.event_starts_at)}
                          {post.event_ends_at
                            ? ` → ${vnDateTime(post.event_ends_at)}`
                            : ""}
                        </strong>
                      </div>
                      {post.location && (
                        <div className="event-loc-row">
                          <MapPin className="w-4 h-4 text-amber-500" />
                          <span>{post.location}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {post.link_url && (
                    <div className="post-footer">
                      <a
                        href={post.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn secondary btn-compact"
                      >
                        <span>Xem chi tiết liên kết</span>
                        <ExternalLink className="w-3.5 h-3.5 ml-1 text-slate-400" />
                      </a>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>

          {/* Pagination */}
          {(posts.count ?? 0) > 12 && (
            <div className="pagination">
              <span>
                Trang {page} / {Math.ceil((posts.count ?? 0) / 12)}
              </span>
              <div className="pagination-buttons">
                {page > 1 && (
                  <Link href={pageHref(page - 1)} className="btn secondary btn-compact">
                    ← Trang trước
                  </Link>
                )}
                {page * 12 < (posts.count ?? 0) && (
                  <Link href={pageHref(page + 1)} className="btn secondary btn-compact">
                    Trang tiếp →
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Column: Birthdays & Top Creators Roster */}
        <aside className="home-sidebar-col">
          {/* Birthdays Today Card */}
          <section className="surface birthday-card">
            <div className="aside-card-header">
              <div className="aside-header-icon-wrap bg-amber-50 text-amber-600">
                <Cake className="w-5 h-5" />
              </div>
              <div>
                <span className="section-eyebrow">CHÚC MỪNG</span>
                <h3 className="aside-title">Sinh nhật hôm nay</h3>
              </div>
            </div>

            {birthdays.error ? (
              <p className="hint text-error" role="alert">
                Chưa tải được danh sách sinh nhật.
              </p>
            ) : !birthdays.data?.length ? (
              <div className="empty-birthday">
                <Cake className="w-8 h-8 text-amber-300 opacity-60" />
                <p>Hôm nay không có sinh nhật thành viên nào trong công ty.</p>
              </div>
            ) : (
              <div className="birthday-list">
                {birthdays.data.map((person) => (
                  <article key={person.person_id} className="birthday-item">
                    <div className="birthday-avatar" aria-hidden="true">
                      {person.display_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="birthday-info">
                      <strong className="birthday-name">{person.display_name}</strong>
                      <span className="birthday-role">
                        {ROLE_LABELS[person.role]} · Chúc tuổi mới rực rỡ!
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Top Creators Roster (Hạng 4 đến 8) */}
          {theRoster.length > 0 && (
            <section className="surface home-roster-card">
              <div className="aside-card-header">
                <div className="aside-header-icon-wrap bg-sky-50 text-sky-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <span className="section-eyebrow">BẢNG XẾP HẠNG</span>
                  <h3 className="aside-title">Top tiếp theo (Hạng 4+)</h3>
                </div>
              </div>

              <div className="home-mini-roster">
                {theRoster.map((person, idx) => {
                  const rank = idx + 4;
                  const diamonds = person.diamonds_total ? BigInt(person.diamonds_total) : BigInt(0);
                  const percent = Math.min(
                    100,
                    Math.max(10, Number((diamonds * BigInt(100)) / maxRosterDiamonds))
                  );

                  return (
                    <article className="mini-roster-item" key={person.idol_id}>
                      <span className="mini-roster-rank">#{rank}</span>
                      <div className="mini-roster-info">
                        <div className="mini-roster-name-row">
                          <strong className="mini-name" title={person.display_name}>
                            {person.display_name}
                          </strong>
                          <span className="mini-diamonds">
                            {person.diamonds_total !== null
                              ? `${formatDiamonds(person.diamonds_total)} 💎`
                              : "Idol"}
                          </span>
                        </div>
                        <div className="mini-progress-track">
                          <div
                            className="mini-progress-bar"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <Link href="/reports" className="mini-roster-cta">
                <span>Xem tất cả Idol trên Bảng vàng</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </Link>
            </section>
          )}

          {/* Live Stream Network Badge */}
          <div className="streamer-network-banner">
            <div className="network-banner-glow" />
            <div className="network-banner-top">
              <Users className="w-5 h-5 text-sky-400" />
              <span>ELDEN LIVE NETWORK</span>
            </div>
            <h4>Gia nhập vũ trụ Creator</h4>
            <p>
              Hỗ trợ thiết bị chuyên nghiệp, phòng live chuẩn studio và quản lý số liệu realtime.
            </p>
            <div className="network-banner-tags">
              <span>🎙️ High-end Mic</span>
              <span>💡 Ring Light</span>
              <span>📱 iPhone Live</span>
            </div>
          </div>
        </aside>
      </div>
    </WorkspaceShell>
  );
}
