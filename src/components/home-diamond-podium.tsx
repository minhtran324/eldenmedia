"use client";

import Link from "next/link";
import confetti from "canvas-confetti";
import { Crown, Medal, Award, Gem, Sparkles, ChevronRight, PartyPopper, Flame } from "lucide-react";

export type RankingPerson = {
  rank_position: number;
  idol_id: string;
  display_name: string;
  username: string | null;
  avatar_path: string | null;
  period_start: string;
  period_end: string;
  data_through: string | null;
  diamonds_total: string | null;
  company_diamonds_total: string | null;
};

export type HomeDiamondPodiumProps = {
  ranking: RankingPerson[];

  selectedMonth: string | null;
  currentMonth: string;
  role?: string;
};

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

export function HomeDiamondPodium({
  ranking,

  selectedMonth,
  currentMonth,
  role,
}: HomeDiamondPodiumProps) {
  const top1 = ranking.find((r) => r.rank_position === 1) ?? ranking[0] ?? null;
  const top2 = ranking.find((r) => r.rank_position === 2) ?? ranking[1] ?? null;
  const top3 = ranking.find((r) => r.rank_position === 3) ?? ranking[2] ?? null;

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#38bdf8", "#f59e0b", "#0284c7", "#ffffff", "#f43f5e"],
    });
  };

  const throughDate = ranking[0]?.data_through;
  const periodLabel = selectedMonth
    ? `Tháng ${selectedMonth.slice(5)}/${selectedMonth.slice(0, 4)}`
    : `Tháng ${currentMonth.slice(5)}/${currentMonth.slice(0, 4)}`;

  return (
    <section className="home-podium-poster" aria-label="Bục vinh danh Top 3 Kim cương" suppressHydrationWarning>
      {/* Background ambient lighting */}
      <div className="podium-bg-glow glow-gold-top" />
      <div className="podium-bg-glow glow-cyan-top" />

      {/* Header bar */}
      <div className="home-podium-header">
        <div className="podium-title-wrap">
          <div className="podium-live-tag">
            <span className="live-dot-pulse" />
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>TOP CREATOR LEADERBOARD</span>
          </div>
          <h2 className="home-podium-title">Bục Vinh Danh Kim Cương</h2>
          <p className="home-podium-sub">
            Vinh danh 3 gương mặt xuất sắc nhất trên sóng Live · {periodLabel}
            {throughDate && ` · Đối soát đến ${throughDate}`}
          </p>
        </div>

        <div className="podium-header-actions">
          {/* Month selector form */}
          <form method="get" className="podium-month-form">
            <label htmlFor="podium-month-input" className="sr-only">
              Xem theo tháng
            </label>
            <input
              id="podium-month-input"
              name="month"
              type="month"
              defaultValue={selectedMonth ?? currentMonth}
              min="2020-01"
              max={currentMonth}
              className="podium-month-input"
              required
            />
            <button type="submit" className="btn secondary btn-compact">
              Lọc
            </button>
          </form>

          {/* Confetti button */}
          <button
            type="button"
            className="btn-confetti"
            onClick={triggerConfetti}
            title="Tung pháo chúc mừng Top Creators"
          >
            <PartyPopper className="w-4 h-4 text-amber-300" />
            <span>Chúc mừng</span>
          </button>
        </div>
      </div>

      {!ranking.length ? (
        <div className="podium-empty-box">
          <Gem className="w-12 h-12 text-sky-400 opacity-60" />
          <p>Chưa có dữ liệu kim cương được công bố cho kỳ này.</p>
          <span className="muted">Admin sẽ cập nhật sau khi đối soát file TikTok.</span>
        </div>
      ) : (
        <>
          {/* Total Agency summary - ONLY visible to Admin */}
          {role === "admin" && ranking[0]?.company_diamonds_total && (
            <div className="podium-company-total">
              <span className="total-label">Tổng kim cương toàn công ty:</span>
              <span className="total-val">
                {formatDiamonds(ranking[0].company_diamonds_total)}
              </span>
              <Gem className="w-4 h-4 text-sky-400" />
            </div>
          )}

          {/* 3-Tier Streamer Podium */}
          <div className="home-podium-grid">
            {/* TOP 2 - Á QUÂN 1 (SILVER) */}
            <div className="home-slot slot-silver">
              {top2 ? (
                <div className="slot-card silver-glow">
                  <div className="slot-badge badge-silver">
                    <Medal className="w-4 h-4 text-slate-200" />
                    <span>HẠNG 2</span>
                  </div>

                  <div className="slot-avatar silver-ring">
                    <span>{top2.display_name.charAt(0).toUpperCase()}</span>
                  </div>

                  <strong className="slot-name" title={top2.display_name}>
                    {top2.display_name}
                  </strong>
                  <span className="slot-handle">
                    {top2.username ? `@${top2.username}` : "Elden Idol"}
                  </span>

                  <div className="slot-diamond-pill pill-silver">
                    <Gem className="w-3.5 h-3.5 text-sky-300" />
                    <strong>
                      {top2.diamonds_total !== null
                        ? formatDiamonds(top2.diamonds_total)
                        : "Top Streamer"}
                    </strong>
                  </div>

                  <div className="slot-pedestal pedestal-silver">
                    <span className="pedestal-number">#2</span>
                  </div>
                </div>
              ) : (
                <div className="slot-card slot-empty">
                  <Medal className="w-8 h-8 text-slate-400 opacity-50" />
                  <span>Chưa có Á Quân 1</span>
                  <div className="slot-pedestal pedestal-silver">
                    <span className="pedestal-number">#2</span>
                  </div>
                </div>
              )}
            </div>

            {/* TOP 1 - QUÁN QUÂN (GOLD) */}
            <div className="home-slot slot-gold">
              {top1 ? (
                <div
                  className="slot-card gold-glow slot-champion"
                  onClick={triggerConfetti}
                  title="Nhấp để tung hoa chúc mừng Quán quân!"
                >
                  <div className="floating-crown-wrap">
                    <Crown className="w-7 h-7 text-amber-300 crown-float" />
                  </div>

                  <div className="slot-badge badge-gold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                    <span>QUÁN QUÂN</span>
                    <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  </div>

                  <div className="slot-avatar gold-ring">
                    <span>{top1.display_name.charAt(0).toUpperCase()}</span>
                  </div>

                  <strong className="slot-name text-gold-glow" title={top1.display_name}>
                    {top1.display_name}
                  </strong>
                  <span className="slot-handle">
                    {top1.username ? `@${top1.username}` : "Elden Idol"}
                  </span>

                  <div className="slot-diamond-pill pill-gold">
                    <Flame className="w-4 h-4 text-amber-400 animate-pulse" />
                    <strong>
                      {top1.diamonds_total !== null
                        ? `${formatDiamonds(top1.diamonds_total)} 💎`
                        : "Elden Champion"}
                    </strong>
                  </div>

                  <div className="slot-pedestal pedestal-gold">
                    <span className="pedestal-number">#1</span>
                    <span className="pedestal-sub">CHAMPION</span>
                  </div>
                </div>
              ) : (
                <div className="slot-card slot-empty">
                  <Crown className="w-8 h-8 text-amber-400 opacity-50" />
                  <span>Chưa có Quán Quân</span>
                  <div className="slot-pedestal pedestal-gold">
                    <span className="pedestal-number">#1</span>
                  </div>
                </div>
              )}
            </div>

            {/* TOP 3 - Á QUÂN 2 (BRONZE) */}
            <div className="home-slot slot-bronze">
              {top3 ? (
                <div className="slot-card bronze-glow">
                  <div className="slot-badge badge-bronze">
                    <Award className="w-4 h-4 text-orange-200" />
                    <span>HẠNG 3</span>
                  </div>

                  <div className="slot-avatar bronze-ring">
                    <span>{top3.display_name.charAt(0).toUpperCase()}</span>
                  </div>

                  <strong className="slot-name" title={top3.display_name}>
                    {top3.display_name}
                  </strong>
                  <span className="slot-handle">
                    {top3.username ? `@${top3.username}` : "Elden Idol"}
                  </span>

                  <div className="slot-diamond-pill pill-bronze">
                    <Gem className="w-3.5 h-3.5 text-orange-300" />
                    <strong>
                      {top3.diamonds_total !== null
                        ? formatDiamonds(top3.diamonds_total)
                        : "Top Streamer"}
                    </strong>
                  </div>

                  <div className="slot-pedestal pedestal-bronze">
                    <span className="pedestal-number">#3</span>
                  </div>
                </div>
              ) : (
                <div className="slot-card slot-empty">
                  <Award className="w-8 h-8 text-orange-400 opacity-50" />
                  <span>Chưa có Á Quân 2</span>
                  <div className="slot-pedestal pedestal-bronze">
                    <span className="pedestal-number">#3</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Link to Full Leaderboard */}
          <div className="home-podium-footer">
            <Link href="/reports" className="btn-view-leaderboard">
              <span>Xem toàn bộ Bảng vinh danh & Số liệu chi tiết</span>
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
