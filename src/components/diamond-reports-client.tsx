"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import {
  Crown,
  Medal,
  Award,
  Gem,
  Sparkles,
  Calendar,
  Search,
  Zap,
  Radio,
  Target,
  Trophy,
  X,
  CheckCircle2,
  SlidersHorizontal,
  Lock,
  ListOrdered,
  Table as TableIcon,
} from "lucide-react";
import { setDiamondVisibilityAction } from "@/features/imports/actions";
import { filterDiamondRows, type DiamondReportRow, type DiamondTeamTotal } from "@/lib/diamonds";

export type ReportRowItem = DiamondReportRow;

export type DiamondReportsClientProps = {
  records: ReportRowItem[];
  teams: DiamondTeamTotal[];
  currentDay: string;
  todayStr: string;
  yesterdayStr: string;
  latestPublishedDate?: string | null;
  role: string;
  currentUserId?: string;
  currentUserName?: string;
  initialTeam?: string;
  settingsAvailable: boolean;
  error: string | null;
  operatorCanViewSetting?: boolean;
  idolCanViewSetting?: boolean;
};

function formatDiamonds(val: string | number | bigint | null | undefined): string {
  if (val == null || val === "") return "—";
  try {
    const raw = BigInt(val).toString();
    return raw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  } catch {
    const str = String(val).trim();
    return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }
}

export function DiamondReportsClient({
  records,
  teams,
  currentDay,
  todayStr,
  yesterdayStr,
  latestPublishedDate,
  role,
  currentUserId,
  currentUserName,
  initialTeam,
  settingsAvailable,
  error,
  operatorCanViewSetting,
  idolCanViewSetting,
}: DiamondReportsClientProps) {
  const router = useRouter();

  // Mode: "month" (Lũy kế tháng) or "day" (Doanh thu ngày)
  const [rankingMode, setRankingMode] = useState<"month" | "day">("month");

  // View: "list" (Danh sách Ranking Poster) or "table" (Bảng số liệu chi tiết)
  const [viewStyle, setViewStyle] = useState<"list" | "table">("list");

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");
  const [team, setTeam] = useState(() => {
    if (role === "operator") return initialTeam === "all" ? "all" : "mine";
    if (role === "admin" && teams.some((item) => (item.operator_id ?? "unassigned") === initialTeam)) return initialTeam!;
    return "all";
  });
  const selectedTeam = teams.find((item) => (item.operator_id ?? "unassigned") === team);
  const rankFor = (row: ReportRowItem) => rankingMode === "month" ? row.month_rank : row.day_rank;
  const amountFor = (row: ReportRowItem | null) => rankingMode === "month" ? row?.month_diamonds : row?.day_diamonds;

  // Date selection state
  const [selectedDay, setSelectedDay] = useState(currentDay);

  // Admin Diamond Visibility Toggle Settings
  const [operatorCanView, setOperatorCanView] = useState<boolean>(
    operatorCanViewSetting ?? false
  );
  const [idolCanView, setIdolCanView] = useState<boolean>(
    idolCanViewSetting ?? false
  );
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [visibilityMessage, setVisibilityMessage] = useState<string | null>(null);

  // Month information
  const monthStr = currentDay.slice(0, 7); // YYYY-MM
  const monthParts = monthStr.split("-");
  const monthLabel = `Tháng ${monthParts[1]}/${monthParts[0]}`;

  // Confetti fireworks
  const triggerConfetti = () => {
    confetti({
      particleCount: 90,
      disableForReducedMotion: true,
      spread: 75,
      origin: { y: 0.6 },
      colors: ["#38bdf8", "#f59e0b", "#0284c7", "#ffffff", "#f43f5e"],
    });
  };

  // Handle Admin toggling visibility switches
  const handleToggleVisibility = async (type: "operator" | "idol", nextVal: boolean) => {
    if (isUpdatingVisibility || !settingsAvailable) return;
    const nextOperator = type === "operator" ? nextVal : operatorCanView;
    const nextIdol = type === "idol" ? nextVal : idolCanView;

    // Optimistic update
    if (type === "operator") setOperatorCanView(nextVal);
    if (type === "idol") setIdolCanView(nextVal);

    setIsUpdatingVisibility(true);
    setVisibilityMessage(null);

    const formData = new FormData();
    formData.append("operator_view", nextOperator ? "true" : "false");
    formData.append("idol_view", nextIdol ? "true" : "false");

    try {
      const res = await setDiamondVisibilityAction({}, formData);
      if (res.error) {
        setVisibilityMessage(`Lỗi: ${res.error}`);
        // Revert
        if (type === "operator") setOperatorCanView(!nextVal);
        if (type === "idol") setIdolCanView(!nextVal);
      } else {
        setVisibilityMessage(res.success ?? "Đã cập nhật quyền xem!");
        router.refresh();
        setTimeout(() => setVisibilityMessage(null), 3000);
      }
    } catch {
      setVisibilityMessage("Lỗi kết nối khi cập nhật quyền xem.");
      if (type === "operator") setOperatorCanView(!nextVal);
      if (type === "idol") setIdolCanView(!nextVal);
    } finally {
      setIsUpdatingVisibility(false);
    }
  };

  // Use server ranks: hidden amounts and team/search filters must never change rank.
  const sortedRecords = useMemo(
    () => filterDiamondRows(records, "all", "", rankingMode), [records, rankingMode]
  );
  const filteredRecords = useMemo(
    () => filterDiamondRows(records, team, searchQuery, rankingMode), [records, team, searchQuery, rankingMode]
  );

  // Identify current logged in idol's position on the leaderboard
  const myIndex = useMemo(() => {
    if (!currentUserId) return -1;
    return sortedRecords.findIndex((r) => r.idol_id === currentUserId);
  }, [sortedRecords, currentUserId]);

  const myRecord = myIndex !== -1 ? sortedRecords[myIndex] : null;
  const myRank = myRecord ? rankFor(myRecord) : null;

  // Top 1 leader
  const top1 = sortedRecords.find((row) => rankFor(row) === 1) ?? null;
  const topAmount = amountFor(top1);
  const myAmount = amountFor(myRecord);
  const distanceToTop = topAmount != null && myAmount != null
    ? BigInt(topAmount) - BigInt(myAmount) : null;

  // Statistics (only calculated for Admin)
  const totalMonth = useMemo(
    () =>
      role === "admin"
        ? records.reduce((sum, r) => sum + BigInt(r.month_diamonds || 0), BigInt(0))
        : BigInt(0),
    [records, role]
  );
  const dayActiveRows = useMemo(
    () => (role === "admin" ? records.filter((r) => r.day_diamonds !== null) : []),
    [records, role]
  );
  const totalDay = useMemo(
    () =>
      role === "admin"
        ? dayActiveRows.reduce(
            (sum, r) => sum + BigInt(r.day_diamonds || 0),
            BigInt(0)
          )
        : BigInt(0),
    [dayActiveRows, role]
  );

  const maxDiamondValue = topAmount != null && BigInt(topAmount) > BigInt(0)
    ? BigInt(topAmount) : null;

  const handleDateChange = (newDay: string) => {
    if (!newDay) return;
    setSelectedDay(newDay);
    router.push(`/reports?day=${encodeURIComponent(newDay)}&team=${encodeURIComponent(team)}`);
  };

  const scrollToMyPosition = () => {
    const el = document.getElementById("my-ranking-highlight-target");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <div className="diamond-ranking-workspace" suppressHydrationWarning>
      {/* ── ADMIN ONLY: COMPACT PRIVACY & VISIBILITY CONTROLS ── */}
      {role === "admin" && (
        <section className="admin-compact-visibility-bar" aria-label="Cài đặt quyền xem số liệu">
          <div className="compact-bar-left">
            <div className="compact-bar-label">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
              <span>Xem kim cương ngoài cá nhân / team:</span>
            </div>

            <div className="compact-bar-toggles">
              {/* Toggle 1: Operator */}
              <div className="compact-toggle-item">
                <span className="compact-item-name">Vận hành</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={operatorCanView}
                  aria-label="Vận hành xem kim cương toàn công ty"
                  disabled={isUpdatingVisibility || !settingsAvailable}
                  onClick={() => handleToggleVisibility("operator", !operatorCanView)}
                  className={`switch-track compact-switch ${operatorCanView ? "switch-on" : "switch-off"}`}
                  title={operatorCanView ? "Vận hành: Xem số liệu toàn công ty" : "Vận hành: Chỉ xem số liệu team mình"}
                >
                  <span className="switch-thumb compact-thumb" />
                </button>
              </div>

              <div className="compact-bar-divider" />

              {/* Toggle 2: Idol */}
              <div className="compact-toggle-item">
                <span className="compact-item-name">Idol</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={idolCanView}
                  aria-label="Idol xem kim cương toàn công ty"
                  disabled={isUpdatingVisibility || !settingsAvailable}
                  onClick={() => handleToggleVisibility("idol", !idolCanView)}
                  className={`switch-track compact-switch ${idolCanView ? "switch-on" : "switch-off"}`}
                  title={idolCanView ? "Idol: Xem số liệu toàn công ty" : "Idol: Chỉ xem số liệu cá nhân, vẫn xem thứ hạng mọi người"}
                >
                  <span className="switch-thumb compact-thumb" />
                </button>
              </div>
            </div>
          </div>

          {visibilityMessage && (
            <span className="compact-bar-toast animate-fadeIn" role="status">
              {visibilityMessage}
            </span>
          )}
        </section>
      )}

      {role === "admin" && !settingsAvailable && (
        <p className="notice error" role="alert">Chưa tải được cài đặt quyền. Vui lòng tải lại trang để thay đổi.</p>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}

      {/* ── Control Bar: Date Selector & Ranking Mode Switcher ── */}
      <div className="poster-control-bar" suppressHydrationWarning>
        <div className="control-left">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDateChange(selectedDay);
            }}
            className="poster-date-form"
          >
            <label htmlFor="report-day-picker" className="date-picker-label">
              <Calendar className="w-4 h-4 text-sky-400" />
              <span>Ngày đối soát:</span>
            </label>
            <input
              id="report-day-picker"
              type="date"
              value={selectedDay}
              max={todayStr}
              onChange={(e) => handleDateChange(e.target.value)}
              className="poster-date-input"
            />
            <div className="date-presets">
              <button
                type="button"
                className={`btn-date-preset ${selectedDay === todayStr ? "active" : ""}`}
                onClick={() => handleDateChange(todayStr)}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className={`btn-date-preset ${selectedDay === yesterdayStr ? "active" : ""}`}
                onClick={() => handleDateChange(yesterdayStr)}
              >
                Hôm qua
              </button>
              {latestPublishedDate &&
                latestPublishedDate !== todayStr &&
                latestPublishedDate !== yesterdayStr && (
                  <button
                    type="button"
                    className={`btn-date-preset ${selectedDay === latestPublishedDate ? "active" : ""}`}
                    onClick={() => handleDateChange(latestPublishedDate)}
                  >
                    Gần nhất ({latestPublishedDate.slice(5)})
                  </button>
                )}
            </div>
          </form>
        </div>

        <div className="control-right">
          {/* Switch ranking calculation mode */}
          <div className="ranking-mode-switch" role="tablist">
            <button
              type="button"
              className={`mode-btn ${rankingMode === "month" ? "active" : ""}`}
              onClick={() => {
                setRankingMode("month");
                triggerConfetti();
              }}
              role="tab"
              aria-selected={rankingMode === "month"}
            >
              <Trophy className="w-3.5 h-3.5 mr-1" />
              <span>Lũy kế tháng</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${rankingMode === "day" ? "active" : ""}`}
              onClick={() => setRankingMode("day")}
              role="tab"
              aria-selected={rankingMode === "day"}
            >
              <Zap className="w-3.5 h-3.5 mr-1" />
              <span>Doanh thu ngày</span>
            </button>
          </div>

          {/* Switch display view: List Ranking (Default) vs Table */}
          <div className="view-style-switch">
            <button
              type="button"
              className={`btn secondary btn-compact ${viewStyle === "list" ? "view-active" : ""}`}
              onClick={() => setViewStyle("list")}
              title="Danh sách Xếp hạng (Poster)"
            >
              <ListOrdered className="w-3.5 h-3.5 mr-1 text-sky-400" />
              <span>Danh sách</span>
            </button>
            <button
              type="button"
              className={`btn secondary btn-compact ${viewStyle === "table" ? "view-active" : ""}`}
              onClick={() => setViewStyle("table")}
              title="Bảng số liệu chi tiết"
            >
              <TableIcon className="w-3.5 h-3.5 mr-1 text-sky-400" />
              <span>Bảng số liệu</span>
            </button>
          </div>
        </div>
      </div>

      {/* Team controls use the existing compact toolbar styling. */}
      {(role === "admin" || role === "operator") && (
        <section className="poster-control-bar poster-team-controls" aria-label="Lọc theo team vận hành">
          <div className="poster-team-buttons">
            {role === "operator" && (
              <button type="button" className={`btn-date-preset ${team === "mine" ? "active" : ""}`}
                aria-pressed={team === "mine"} onClick={() => setTeam("mine")}>Team của tôi</button>
            )}
            <button type="button" className={`btn-date-preset ${team === "all" ? "active" : ""}`}
              aria-pressed={team === "all"} onClick={() => setTeam("all")}>Toàn công ty</button>
            {role === "admin" && teams.map((item) => {
              const id = item.operator_id ?? "unassigned";
              return <button key={id} type="button" className={`btn-date-preset poster-team-button ${team === id ? "active" : ""}`}
                aria-pressed={team === id} onClick={() => setTeam(id)}>
                <span>{item.operator_name}</span>
                <strong>{formatDiamonds(rankingMode === "month" ? item.month_diamonds : item.day_diamonds)} <Gem aria-hidden="true" size={12} /></strong>
              </button>;
            })}
          </div>
          <p className="poster-team-caption">
            {role === "operator"
              ? "Luôn xem được kim cương team mình. Số liệu ngoài team hiển thị khi Admin bật quyền. "
              : "Tổng mỗi team theo vận hành đang phụ trách; số liệu theo kỳ đang chọn. "}
            Lọc không thay đổi thứ hạng toàn công ty.
          </p>
          {role === "admin" && selectedTeam && (
            <p className="poster-team-summary" role="status">
              <strong>{selectedTeam.operator_name}</strong>
              <span>{selectedTeam.reported_idols}/{selectedTeam.idol_count} Idol có số liệu tháng</span>
              <span>Ngày: <strong>{formatDiamonds(selectedTeam.day_diamonds)}</strong> kim cương</span>
              <span>Tháng: <strong>{formatDiamonds(selectedTeam.month_diamonds)}</strong> kim cương</span>
            </p>
          )}
        </section>
      )}

      {/* ── LOGGED-IN IDOL'S PERSONAL HIGHLIGHT BANNER ── */}
      {role === "idol" && myRecord && myRank && (
        <section className="my-ranking-banner" aria-label="Thành tích cá nhân trên bảng vàng">
          <div className="my-ranking-badge">
            <span className="my-badge-label">HẠNG CỦA BẠN</span>
            <strong className="my-badge-num">#{myRank}</strong>
          </div>

          <div className="my-ranking-info">
            <div className="my-ranking-title-row">
              <span className="my-live-tag">
                <Radio className="w-3.5 h-3.5 text-sky-400" />
                <span>THÀNH TÍCH CỦA BẠN</span>
              </span>
              <strong className="my-creator-name">
                {currentUserName || myRecord.display_name}
              </strong>
              {myRecord.username && (
                <span className="my-creator-handle">@{myRecord.username}</span>
              )}
            </div>

            <p className="my-ranking-subtitle">
              {myRank === 1
                ? "👑 Xuất sắc! Bạn đang giữ vị trí QUÁN QUÂN toàn công ty kỳ này!"
                : myRank <= 3
                ? `🌟 Chúc mừng! Bạn đang đứng vững trong TOP 3 Creators xuất sắc nhất!`
                : `Bạn đang xếp thứ #${myRank} trên tổng số ${sortedRecords.length} Creators trong hệ thống.`}
            </p>

            {/* Distance to Top 1 if user can view diamonds and not top 1 */}
            {myRank > 1 && distanceToTop !== null && (
              <span className="my-distance-tag">
                <Target className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  Khoảng cách đến Quán quân:{" "}
                  <strong>
                    {formatDiamonds(distanceToTop)}
                  </strong>{" "}
                  kim cương
                </span>
              </span>
            )}
          </div>

          <div className="my-ranking-numbers">
            <div className="my-num-col">
              <span className="my-num-label">Lũy kế tháng của bạn</span>
              <strong className="my-num-val text-gold">
                {formatDiamonds(myRecord.month_diamonds)}{" "}
                <Gem className="w-4 h-4 inline text-amber-400" />
              </strong>
            </div>
            <div className="my-num-divider" />
            <div className="my-num-col">
              <span className="my-num-label">Ngày đối soát</span>
              <strong className="my-num-val text-cyan">
                {myRecord.day_diamonds
                  ? `+${formatDiamonds(myRecord.day_diamonds)} 💎`
                  : "Chưa ghi nhận"}
              </strong>
            </div>
            <button
              type="button"
              className="btn-jump-to-me"
              onClick={scrollToMyPosition}
              title="Cuộn tới vị trí của bạn trong danh sách"
            >
              <span>Vị trí của tôi</span>
              <Target className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* ── MAIN POSTER FRAME (UNIFIED LIST RANKING) ── */}
      <div
        className={`ranking-poster-frame ${viewStyle === "list" ? "theme-poster" : "theme-table-mode"}`}
        suppressHydrationWarning
      >
        {/* Background ambient lighting */}
        <div className="poster-ambient-glow glow-cyan" />
        <div className="poster-ambient-glow glow-gold" />
        <div className="poster-ambient-glow glow-navy" />

        {/* Poster Header */}
        <header className="poster-header">
          <div className="agency-badge">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="badge-title">ELDEN MEDIA CREATOR NETWORK</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>

          <h1 className="poster-main-title">
            BẢNG XẾP HẠNG KIM CƯƠNG
          </h1>
          <p className="poster-sub-title">
            TIKTOK LIVE CREATOR LEADERBOARD ·{" "}
            {rankingMode === "month"
              ? `TỔNG KẾT ${monthLabel.toUpperCase()}`
              : `BÁO CÁO NGÀY ${currentDay}`}
          </p>

          <div className="poster-period-pill">
            <span className="pill-dot" />
            <span>
              {rankingMode === "month"
                ? `Lũy kế từ ngày 01 đến ngày ${currentDay}`
                : `Số liệu ghi nhận trong ngày ${currentDay}`}
            </span>
          </div>

          {/* Summary Ribbon: Total company diamonds ONLY for Admin */}
          <div className="poster-kpi-ribbon">
            {role === "admin" && (
              <>
                <div className="kpi-ribbon-item">
                  <span className="ribbon-label">TỔNG KIM CƯƠNG THÁNG (TOÀN CÔNG TY)</span>
                  <strong className="ribbon-val text-gold">
                    {totalMonth.toLocaleString("vi-VN")}{" "}
                    <Gem className="w-4 h-4 inline text-amber-400" />
                  </strong>
                </div>

                <div className="kpi-ribbon-divider" />

                <div className="kpi-ribbon-item">
                  <span className="ribbon-label">DOANH THU TRONG NGÀY</span>
                  <strong className="ribbon-val text-cyan">
                    {dayActiveRows.length
                      ? `${totalDay.toLocaleString("vi-VN")} 💎`
                      : "Chưa có"}
                  </strong>
                </div>

                <div className="kpi-ribbon-divider" />
              </>
            )}

            <div className="kpi-ribbon-item">
              <span className="ribbon-label">QUÁN QUÂN DẪN ĐẦU</span>
              <strong className="ribbon-val text-white">
                {top1 ? top1.display_name : "—"}
              </strong>
            </div>

            <div className="kpi-ribbon-divider" />

            <div className="kpi-ribbon-item">
              <span className="ribbon-label">TỔNG SỐ IDOL LÊN BẢNG</span>
              <strong className="ribbon-val text-white">
                {records.length} Creators
              </strong>
            </div>

            {role !== "admin" && (
              <>
                <div className="kpi-ribbon-divider" />
                <div className="kpi-ribbon-item">
                  <span className="ribbon-label">KỲ ĐỐI SOÁT</span>
                  <strong className="ribbon-val text-cyan">
                    {currentDay}
                  </strong>
                </div>
              </>
            )}
          </div>
        </header>

        {/* ── Search Bar inside Poster ── */}
        <div className="poster-search-container">
          <div className="poster-search-wrap">
            <Search className="w-4 h-4 text-slate-400 search-icon-svg" />
            <input
              type="search"
              aria-label="Tìm Idol trên bảng xếp hạng"
              placeholder="Tìm kiếm Idol hoặc @username trên bảng vàng..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="poster-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="btn-clear-search"
                onClick={() => setSearchQuery("")}
                title="Xóa tìm kiếm"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Empty State ── */}
        {!records.length ? (
          <div className="poster-empty-state">
            <Trophy className="w-14 h-14 text-sky-400 opacity-60 mb-2" />
            <h2>Chưa có dữ liệu kim cương được công bố</h2>
            <p className="muted">
              Số liệu của kỳ này chưa được xuất bản. Vui lòng chọn ngày khác hoặc
              liên hệ Admin đối soát file TikTok.
            </p>
            {role === "admin" && (
              <Link href="/admin/imports" className="btn primary btn-compact">
                Đến trang Nhập file TikTok →
              </Link>
            )}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="poster-empty-search">
            Không có Idol phù hợp với team hoặc từ khóa đang chọn.
          </div>
        ) : viewStyle === "list" ? (
          /* ── UNIFIED LIST RANKING (CORE REQUIREMENT) ── */
          <section className="ranking-list-section" aria-label="Bảng xếp hạng danh sách">
            <div className="ranking-list-container">
              {filteredRecords.map((person) => {
                const rank = rankFor(person);
                const isTop1 = rank === 1;
                const isTop2 = rank === 2;
                const isTop3 = rank === 3;
                const isMe = person.idol_id === currentUserId;

                const rawMonth = person.month_diamonds || "0";
                const rawDay = person.day_diamonds;
                const primaryDiamonds =
                  rankingMode === "month"
                    ? BigInt(rawMonth)
                    : BigInt(rawDay || 0);

                const percentage = amountFor(person) != null && maxDiamondValue !== null ? Math.min(
                  100,
                  Math.max(
                    0,
                    Number((primaryDiamonds * BigInt(100)) / maxDiamondValue)
                  )
                ) : 0;

                // The RPC masks amounts outside the viewer's allowed scope.
                const showExactDiamonds = person.month_diamonds !== null;

                return (
                  <article
                    key={person.platform_account_id}
                    id={isMe ? "my-ranking-highlight-target" : undefined}
                    className={[
                      "ranking-row-card",
                      isTop1 ? "rank-tier-gold" : "",
                      isTop2 ? "rank-tier-silver" : "",
                      isTop3 ? "rank-tier-bronze" : "",
                      !isTop1 && !isTop2 && !isTop3 ? "rank-tier-standard" : "",
                      isMe ? "is-my-card" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={isTop1 ? triggerConfetti : undefined}
                    title={isTop1 ? "Nhấp để tung hoa chúc mừng Quán quân!" : undefined}
                  >
                    {/* Rank Badge Column */}
                    <div className="row-col-rank">
                      {isTop1 ? (
                        <div className="rank-podium-badge gold">
                          <Crown className="w-5 h-5 text-amber-300 animate-pulse" />
                          <span className="rank-num">#1</span>
                          <span className="rank-label">QUÁN QUÂN</span>
                        </div>
                      ) : isTop2 ? (
                        <div className="rank-podium-badge silver">
                          <Medal className="w-5 h-5 text-slate-200" />
                          <span className="rank-num">#2</span>
                          <span className="rank-label">Á QUÂN 1</span>
                        </div>
                      ) : isTop3 ? (
                        <div className="rank-podium-badge bronze">
                          <Award className="w-5 h-5 text-orange-300" />
                          <span className="rank-num">#3</span>
                          <span className="rank-label">Á QUÂN 2</span>
                        </div>
                      ) : (
                        <div className="rank-podium-badge standard">
                          <span className="rank-num">{rank == null ? "—" : `#${rank}`}</span>
                        </div>
                      )}
                    </div>

                    {/* Avatar Column */}
                    <div className="row-col-avatar">
                      <div
                        className={`row-avatar-ring ${
                          isTop1
                            ? "ring-gold"
                            : isTop2
                            ? "ring-silver"
                            : isTop3
                            ? "ring-bronze"
                            : "ring-standard"
                        }`}
                      >
                        <span className="row-avatar-initial">
                          {person.display_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {/* Creator Info Column */}
                    <div className="row-col-info">
                      <div className="row-name-line">
                        <strong
                          className={`row-creator-name ${
                            isTop1
                              ? "name-gold"
                              : isTop2
                              ? "name-silver"
                              : isTop3
                              ? "name-bronze"
                              : ""
                          }`}
                          title={person.display_name}
                        >
                          {person.display_name}
                        </strong>

                        {isMe && (
                          <span className="row-me-badge">
                            <CheckCircle2 className="w-3 h-3 text-sky-300" />
                            <span>BẠN</span>
                          </span>
                        )}

                        <span className="row-creator-handle">
                          {person.username ? `@${person.username}` : "Elden Idol"}
                        </span>

                        {showExactDiamonds && person.day_diamonds && (
                          <span className="meta-tag-boost">
                            <Zap className="w-3 h-3 text-amber-400" />
                            <span>+{formatDiamonds(person.day_diamonds)}</span>
                          </span>
                        )}
                      </div>

                      {/* Performance Progress Track */}
                      <div className="row-progress-wrap">
                        <div className="row-progress-track">
                          <div
                            className={`row-progress-bar ${
                              isTop1
                                ? "bar-gold"
                                : isTop2
                                ? "bar-silver"
                                : isTop3
                                ? "bar-bronze"
                                : isMe
                                ? "bar-me"
                                : "bar-standard"
                            }`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Diamond Count / Status Badge Column */}
                    <div className="row-col-diamonds">
                      {showExactDiamonds ? (
                        <div className="diamonds-display-block">
                          <div className="diamonds-primary-val">
                            <span
                              className={`val-number ${
                                isTop1
                                  ? "val-gold"
                                  : isTop2
                                  ? "val-silver"
                                  : isTop3
                                  ? "val-bronze"
                                  : ""
                              }`}
                            >
                              {formatDiamonds(
                                rankingMode === "month"
                                  ? person.month_diamonds
                                  : person.day_diamonds
                              )}
                            </span>
                            <Gem
                              className={`w-4 h-4 ${
                                isTop1
                                  ? "text-amber-400"
                                  : isTop2
                                  ? "text-sky-300"
                                  : isTop3
                                  ? "text-orange-400"
                                  : "text-sky-400"
                              }`}
                            />
                          </div>

                          <span className="diamonds-sub-label">
                            {rankingMode === "month" ? "Lũy kế tháng" : "Trong ngày"}
                          </span>
                        </div>
                      ) : (
                        /* Masked View: Idol viewing public list without diamond permission */
                        <div className="diamonds-masked-block">
                          <span
                            className={`masked-status-pill ${
                              isTop1
                                ? "pill-gold"
                                : isTop2
                                ? "pill-silver"
                                : isTop3
                                ? "pill-bronze"
                                : "pill-standard"
                            }`}
                          >
                            {isTop1 ? (
                              <>
                                <Crown className="w-3.5 h-3.5 inline mr-1 text-amber-300" />
                                Quán Quân
                              </>
                            ) : isTop2 ? (
                              <>
                                <Medal className="w-3.5 h-3.5 inline mr-1 text-slate-200" />
                                Á Quân 1
                              </>
                            ) : isTop3 ? (
                              <>
                                <Award className="w-3.5 h-3.5 inline mr-1 text-orange-300" />
                                Á Quân 2
                              </>
                            ) : (
                              "Top Creator"
                            )}
                          </span>

                          <span className="masked-sub-note">
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>Ẩn số liệu</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          /* ── TABLE VIEW MODE (SECONDARY OPTION) ── */
          <section className="table-view-container">
            <div className="table-wrap-poster">
              <table className="poster-data-table">
                <thead>
                  <tr>
                    <th style={{ width: "90px", textAlign: "center" }}>Hạng</th>
                    <th>Nhà sáng tạo (Idol)</th>
                    <th>Username TikTok</th>
                    <th className="num-col">Kim cương ngày</th>
                    <th className="num-col">Lũy kế tháng</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((r) => {
                    const rank = rankFor(r);
                    const isTop1 = rank === 1;
                    const isTop2 = rank === 2;
                    const isTop3 = rank === 3;
                    const isMe = r.idol_id === currentUserId;
                    const showDiamonds = r.month_diamonds !== null;

                    return (
                      <tr
                        key={r.platform_account_id}
                        id={isMe ? "my-ranking-highlight-target" : undefined}
                        className={[
                          isTop1 ? "row-top1" : "",
                          isTop2 ? "row-top2" : "",
                          isTop3 ? "row-top3" : "",
                          isMe ? "row-is-me" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td style={{ textAlign: "center" }}>
                          {isTop1 ? (
                            <span className="table-rank-medal gold">
                              <Crown className="w-4 h-4 inline mr-1 text-amber-300" />
                              #1
                            </span>
                          ) : isTop2 ? (
                            <span className="table-rank-medal silver">
                              <Medal className="w-4 h-4 inline mr-1 text-slate-200" />
                              #2
                            </span>
                          ) : isTop3 ? (
                            <span className="table-rank-medal bronze">
                              <Award className="w-4 h-4 inline mr-1 text-orange-200" />
                              #3
                            </span>
                          ) : (
                            <span className={`table-rank-num ${isMe ? "my-rank-num" : ""}`}>
                              {rank == null ? "—" : `#${rank}`}
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="table-user-cell">
                            <span className="initial-avatar-small">
                              {r.display_name.charAt(0).toUpperCase()}
                            </span>
                            <div className="table-user-meta">
                              <strong>{r.display_name}</strong>
                              {isMe && (
                                <span className="table-me-chip">
                                  <CheckCircle2 className="w-3 h-3 text-sky-400" />
                                  <span>BẠN</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="tiktok-pill">
                            {r.username ? `@${r.username}` : "—"}
                          </span>
                        </td>
                        <td className="num-col font-bold diamond-cell">
                          {showDiamonds ? (
                            r.day_diamonds ? (
                              <span>
                                {formatDiamonds(r.day_diamonds)}{" "}
                                <Gem className="w-3.5 h-3.5 inline text-sky-400" />
                              </span>
                            ) : (
                              "—"
                            )
                          ) : (
                            <span className="table-masked-cell">
                              <Lock className="w-3 h-3 text-slate-400 inline mr-1" />
                              Ẩn
                            </span>
                          )}
                        </td>
                        <td className="num-col font-bold text-ocean">
                          {showDiamonds ? (
                            <span>
                              {formatDiamonds(r.month_diamonds)}{" "}
                              <Gem className="w-3.5 h-3.5 inline text-sky-400" />
                            </span>
                          ) : (
                            <span className="table-masked-cell">
                              <Lock className="w-3 h-3 text-slate-400 inline mr-1" />
                              Ẩn
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Poster Footer Watermark */}
        <footer className="poster-footer">
          <div className="footer-left">
            <span>© ELDEN MEDIA ENTERTAINMENT · ALL RIGHTS RESERVED</span>
          </div>
          <div className="footer-right">
            <span>Cập nhật từ file TikTok đã công bố</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
