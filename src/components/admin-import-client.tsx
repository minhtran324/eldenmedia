"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  mapUsername,
  publishImport,
  revertImport,
  deleteImportBatch,
  changeBatchDate,
  updateRowDiamonds,
  setManualIdolDiamonds,
} from "@/features/imports/actions";
import { vnDateTime } from "@/lib/homepage";

export type ImportBatchItem = {
  id: string;
  data_date: string;
  file_path: string;
  file_hash: string;
  status: string;
  created_at: string;
  published_at?: string | null;
};

export type ImportRowItem = {
  batch_id: string;
  row_number: number;
  username: string;
  diamonds: string; // serialized string to prevent BigInt hydration issues
  account_id: string | null;
};

export type IdolProfile = {
  id: string;
  name: string;
  username: string | null;
};

export type PlatformAccountItem = {
  id: string;
  idol_id: string;
  username: string | null;
};

export type MonthPreviewMap = Record<
  number,
  { month_before: string | null; month_after: string | null }
>;

const STATUS_CONFIG: Record<
  string,
  { label: string; tagClass: string; icon: string }
> = {
  staged: {
    label: "Chờ công bố",
    tagClass: "import-status-staged",
    icon: "🟡",
  },
  published: {
    label: "Đang công bố",
    tagClass: "import-status-published",
    icon: "🟢",
  },
  reverted: {
    label: "Đã thu hồi / thay thế",
    tagClass: "import-status-reverted",
    icon: "⚪",
  },
  failed: {
    label: "Lỗi xử lý",
    tagClass: "import-status-failed",
    icon: "🔴",
  },
};

function formatNumber(val: string | number | null | undefined): string {
  if (val == null || val === "") return "—";
  try {
    return BigInt(val).toLocaleString("vi-VN");
  } catch {
    return String(val);
  }
}

export function AdminImportClient({
  batch,
  rows,
  previews,
  idols,
  accounts,
  currentPublished,
  history,
  historyCount,
  currentPage,
  initialTab,
  todayStr,
  yesterdayStr,
}: {
  batch: ImportBatchItem | null;
  rows: ImportRowItem[];
  previews: MonthPreviewMap;
  idols: IdolProfile[];
  accounts: PlatformAccountItem[];
  currentPublished: { id: string; file_path: string; data_date: string } | null;
  history: ImportBatchItem[];
  historyCount: number;
  currentPage: number;
  initialTab?: string;
  todayStr: string;
  yesterdayStr: string;
}) {
  const router = useRouter();

  // Show/hide upload dropzone
  const [isUploadOpen, setIsUploadOpen] = useState(!batch);

  // Modals for batch date change and batch deletion
  const [isDateChangeOpen, setIsDateChangeOpen] = useState(false);
  const [isDeleteBatchOpen, setIsDeleteBatchOpen] = useState(false);

  // Group rows into Matched vs Unmatched
  const { matchedRows, unmatchedRows, totalDiamonds, matchedDiamonds } =
    useMemo(() => {
      let totalD = BigInt(0);
      let matchedD = BigInt(0);
      const matched: (ImportRowItem & {
        idol_id: string;
        idol_name: string;
        month_before: string | null;
        month_after: string | null;
      })[] = [];
      const unmatched: (ImportRowItem & {
        current_account_username: string | null;
        current_idol_name: string | null;
      })[] = [];

      for (const r of rows) {
        const dVal = BigInt(r.diamonds);
        totalD += dVal;

        const acc = accounts.find((a) => a.id === r.account_id);
        const isMatched = Boolean(
          acc &&
            acc.username?.trim().toLowerCase() === r.username.trim().toLowerCase() &&
            idols.some((p) => p.id === acc.idol_id)
        );

        if (isMatched) {
          const idol = idols.find((p) => p.id === acc!.idol_id);
          matchedD += dVal;
          matched.push({
            ...r,
            idol_id: idol!.id,
            idol_name: idol!.name,
            month_before: previews[r.row_number]?.month_before ?? null,
            month_after: previews[r.row_number]?.month_after ?? null,
          });
        } else {
          const idol = idols.find((p) => p.id === acc?.idol_id);
          unmatched.push({
            ...r,
            current_account_username: acc?.username ?? null,
            current_idol_name: idol?.name ?? null,
          });
        }
      }

      return {
        matchedRows: matched,
        unmatchedRows: unmatched,
        totalDiamonds: totalD,
        matchedDiamonds: matchedD,
      };
    }, [rows, accounts, idols, previews]);

  // Idols in the system who are NOT matched in this Excel batch
  const missingIdols = useMemo(() => {
    const matchedIdolIds = new Set(matchedRows.map((r) => r.idol_id));
    return idols.filter((p) => !matchedIdolIds.has(p.id));
  }, [idols, matchedRows]);

  // Active tab: default to 'matched' (Idol đã lấy số liệu)
  const [activeTab, setActiveTab] = useState<string>(
    initialTab && ["matched", "missing", "unmatched", "history"].includes(initialTab)
      ? initialTab
      : "matched"
  );

  // Search queries within tabs
  const [matchedSearch, setMatchedSearch] = useState("");
  const [missingSearch, setMissingSearch] = useState("");
  const [unmatchedSearch, setUnmatchedSearch] = useState("");

  const filteredMatchedRows = useMemo(() => {
    if (!matchedSearch.trim()) return matchedRows;
    const q = matchedSearch.toLowerCase().trim();
    return matchedRows.filter(
      (r) =>
        r.username.toLowerCase().includes(q) ||
        r.idol_name.toLowerCase().includes(q)
    );
  }, [matchedRows, matchedSearch]);

  const filteredMissingIdols = useMemo(() => {
    if (!missingSearch.trim()) return missingIdols;
    const q = missingSearch.toLowerCase().trim();
    return missingIdols.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.username && p.username.toLowerCase().includes(q))
    );
  }, [missingIdols, missingSearch]);

  const filteredUnmatchedRows = useMemo(() => {
    if (!unmatchedSearch.trim()) return unmatchedRows;
    const q = unmatchedSearch.toLowerCase().trim();
    return unmatchedRows.filter((r) => r.username.toLowerCase().includes(q));
  }, [unmatchedRows, unmatchedSearch]);

  const statusInfo = batch ? STATUS_CONFIG[batch.status] ?? STATUS_CONFIG.staged : null;

  return (
    <div className="admin-import-workspace">
      {/* ── Top Bar: Upload Toggle, Rollback Controls & Batch Overview ── */}
      <div className="import-top-control-bar">
        <div className="import-top-left">
          {batch ? (
            <div className="active-batch-summary">
              <span className="active-batch-tag">Bản đang chọn:</span>
              <span className="active-batch-date">📅 Ngày {batch.data_date}</span>
              <span className="active-batch-filename">({batch.file_path})</span>
              <span className={`import-badge ${statusInfo?.tagClass}`}>
                {statusInfo?.icon} {statusInfo?.label}
              </span>
            </div>
          ) : (
            <div className="active-batch-summary">
              <span className="active-batch-tag">Chưa chọn bản nhập</span>
              <span className="muted">Tải lên file TikTok để lấy số liệu các Idol.</span>
            </div>
          )}
        </div>

        <div className="import-top-right">
          {/* Quick Rollback / Date Change buttons when a batch is active */}
          {batch && batch.status === "staged" && (
            <div className="batch-correction-buttons">
              <button
                type="button"
                className="btn secondary btn-compact"
                onClick={() => setIsDateChangeOpen((prev) => !prev)}
                title="Đổi ngày số liệu nếu nhập nhầm ngày"
              >
                📅 Đổi ngày báo cáo
              </button>
              <button
                type="button"
                className="btn secondary danger-btn btn-compact"
                onClick={() => setIsDeleteBatchOpen(true)}
                title="Hủy / Xóa bản nhập nháp này"
              >
                🗑️ Hủy bản nhập
              </button>
            </div>
          )}

          <button
            type="button"
            className={`btn secondary btn-compact ${isUploadOpen ? "active-toggle" : ""}`}
            onClick={() => setIsUploadOpen((prev) => !prev)}
          >
            <span>{isUploadOpen ? "✕ Đóng tải file" : "📤 Tải file TikTok mới"}</span>
          </button>
        </div>
      </div>

      {/* ── Date Correction Inline Drawer (if user entered wrong date) ── */}
      {batch && isDateChangeOpen && batch.status === "staged" && (
        <ChangeBatchDateForm
          batchId={batch.id}
          currentDate={batch.data_date}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
          onClose={() => setIsDateChangeOpen(false)}
        />
      )}

      {/* ── Delete / Rollback Staged Batch Modal ── */}
      {batch && isDeleteBatchOpen && batch.status === "staged" && (
        <DeleteBatchModal
          batchId={batch.id}
          dataDate={batch.data_date}
          onClose={() => setIsDeleteBatchOpen(false)}
        />
      )}

      {/* ── Upload Area (Collapsible / Hero) ── */}
      {isUploadOpen && (
        <section className="surface import-upload-panel">
          <div className="import-upload-header">
            <div>
              <h2>Tải lên báo cáo TikTok (.xlsx)</h2>
              <p className="muted">
                Hệ thống chỉ lấy số liệu của các <strong>Idol có tài khoản trong công ty</strong>.
                Các tài khoản người dùng khác trong file sẽ tự động được bỏ qua hoàn toàn.
              </p>
            </div>
            {batch && (
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => setIsUploadOpen(false)}
                title="Đóng bảng tải file"
              >
                ✕
              </button>
            )}
          </div>
          <ImportDropzone
            todayStr={todayStr}
            yesterdayStr={yesterdayStr}
            onSuccess={(batchId) => {
              setIsUploadOpen(false);
              router.push(`/admin/imports?batch=${batchId}`);
              router.refresh();
            }}
          />
        </section>
      )}

      {/* ── Reconciliation Dashboard (when a batch is selected) ── */}
      {batch && (
        <>
          {/* KPI Strip */}
          <div className="import-kpi-grid">
            <div className="import-kpi-card kpi-matched">
              <div className="import-kpi-header">
                <span className="import-kpi-label">Idol có số liệu trong file</span>
                <span className="import-kpi-icon">🟢</span>
              </div>
              <div className="import-kpi-value">{matchedRows.length}</div>
              <div className="import-kpi-sub">Đã tự động lấy số liệu</div>
            </div>

            <div
              className={`import-kpi-card ${
                missingIdols.length > 0 ? "kpi-missing" : "kpi-clean"
              }`}
            >
              <div className="import-kpi-header">
                <span className="import-kpi-label">Idol chưa có số liệu</span>
                <span className="import-kpi-icon">👥</span>
              </div>
              <div className="import-kpi-value">{missingIdols.length}</div>
              <div className="import-kpi-sub">
                {missingIdols.length > 0
                  ? "Tạm bỏ qua hoặc sửa thủ công"
                  : "Tất cả Idol đều có số liệu"}
              </div>
            </div>

            <div className="import-kpi-card kpi-diamonds">
              <div className="import-kpi-header">
                <span className="import-kpi-label">Tổng kim cương ngày</span>
                <span className="import-kpi-icon">💎</span>
              </div>
              <div className="import-kpi-value">
                {totalDiamonds.toLocaleString("vi-VN")}
              </div>
              <div className="import-kpi-sub">Báo cáo ngày {batch.data_date}</div>
            </div>

            <div className="import-kpi-card">
              <div className="import-kpi-header">
                <span className="import-kpi-label">Tổng Idol công ty</span>
                <span className="import-kpi-icon">🏢</span>
              </div>
              <div className="import-kpi-value">{idols.length}</div>
              <div className="import-kpi-sub">Đang hoạt động trong hệ thống</div>
            </div>

            {unmatchedRows.length > 0 && (
              <div className="import-kpi-card kpi-alert">
                <div className="import-kpi-header">
                  <span className="import-kpi-label">Chưa trùng khớp</span>
                  <span className="import-kpi-icon">⚠️</span>
                </div>
                <div className="import-kpi-value">{unmatchedRows.length}</div>
                <div className="import-kpi-sub">Dòng cũ chưa ghép Idol</div>
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <nav className="import-tab-strip" aria-label="Các mục đối chiếu">
            <button
              type="button"
              className={`import-tab-btn ${activeTab === "matched" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("matched")}
            >
              <span>🟢 Idol đã lấy số liệu từ file</span>
              <span className="tab-count-badge badge-success">
                {matchedRows.length}
              </span>
            </button>

            <button
              type="button"
              className={`import-tab-btn ${activeTab === "missing" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("missing")}
            >
              <span>👥 Idol chưa có số liệu</span>
              <span className="tab-count-badge badge-neutral">
                {missingIdols.length}
              </span>
            </button>

            {unmatchedRows.length > 0 && (
              <button
                type="button"
                className={`import-tab-btn ${activeTab === "unmatched" ? "tab-active" : ""}`}
                onClick={() => setActiveTab("unmatched")}
              >
                <span>⚠️ Dòng chưa khớp ({unmatchedRows.length})</span>
              </button>
            )}

            <button
              type="button"
              className={`import-tab-btn ${activeTab === "history" ? "tab-active" : ""}`}
              onClick={() => setActiveTab("history")}
            >
              <span>📋 Lịch sử nhập</span>
              <span className="tab-count-badge badge-neutral">{historyCount}</span>
            </button>
          </nav>

          {/* ── TAB 1: Idol đã lấy số liệu từ file (Matched Rows) + Sửa thủ công ── */}
          {activeTab === "matched" && (
            <section className="surface tab-panel-surface">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    🟢 Danh sách Idol đã lấy số liệu ({matchedRows.length} Idol · {matchedDiamonds.toLocaleString("vi-VN")} 💎)
                  </h2>
                  <p className="panel-desc">
                    Hệ thống tự động lọc và lấy số liệu kim cương từ file Excel cho các Idol đã có tài khoản TikTok.
                    Bạn có thể bấm &ldquo;Sửa số kim cương&rdquo; nếu cần điều chỉnh thủ công.
                  </p>
                </div>
                <div className="panel-search-box">
                  <input
                    type="search"
                    placeholder="Tìm theo tên Idol hoặc @username..."
                    value={matchedSearch}
                    onChange={(e) => setMatchedSearch(e.target.value)}
                    className="import-search-input"
                  />
                </div>
              </div>

              {matchedRows.length === 0 ? (
                <div className="import-empty-state">
                  <span>ℹ️</span>
                  <span>Chưa có Idol nào khớp với danh sách trong file này.</span>
                </div>
              ) : filteredMatchedRows.length === 0 ? (
                <div className="import-empty-search">
                  Không tìm thấy Idol nào khớp với &ldquo;{matchedSearch}&rdquo;.
                </div>
              ) : (
                <div className="import-table-wrap">
                  <table className="import-table modern-import-table">
                    <thead>
                      <tr>
                        <th style={{ width: "60px" }}>Dòng</th>
                        <th>Idol</th>
                        <th>TikTok</th>
                        <th className="num-col">Kim cương ngày</th>
                        <th className="num-col">Tổng tháng trước</th>
                        <th className="num-col">Tổng sau công bố</th>
                        <th style={{ width: "140px", textAlign: "center" }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatchedRows.map((r) => (
                        <tr key={r.row_number}>
                          <td className="row-num-cell">#{r.row_number}</td>
                          <td className="idol-cell">
                            <div className="matched-idol-info">
                              <span className="initial-avatar-small">
                                {r.idol_name.charAt(0).toUpperCase()}
                              </span>
                              <strong>{r.idol_name}</strong>
                            </div>
                          </td>
                          <td className="username-cell">
                            <span className="tiktok-pill">@{r.username}</span>
                          </td>
                          <td className="num-col font-bold diamond-cell">
                            {formatNumber(r.diamonds)} 💎
                          </td>
                          <td className="num-col muted">
                            {formatNumber(r.month_before)}
                          </td>
                          <td className="num-col font-bold text-ocean">
                            {formatNumber(r.month_after)}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {batch.status === "staged" ? (
                              <ManualRowEditAction
                                batchId={batch.id}
                                rowNumber={r.row_number}
                                idolName={r.idol_name}
                                currentDiamonds={r.diamonds}
                              />
                            ) : (
                              <span className="match-status-pill green">
                                ✓ Đã công bố
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ── TAB 2: Idol chưa có số liệu + Bỏ qua / Nhập tay ── */}
          {activeTab === "missing" && (
            <section className="surface tab-panel-surface">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    👥 Idol trong hệ thống chưa có số liệu ({missingIdols.length})
                  </h2>
                  <p className="panel-desc">
                    Các Idol này không có tên trong file Excel ngày {batch.data_date}.
                    Bạn có thể <strong>tạm bỏ qua</strong> để tiếp tục công bố (mặc định 0 kim cương),
                    hoặc bấm <strong>Nhập số liệu tay</strong> nếu muốn bổ sung số kim cương.
                  </p>
                </div>
                <div className="panel-search-box">
                  <input
                    type="search"
                    placeholder="Tìm tên Idol..."
                    value={missingSearch}
                    onChange={(e) => setMissingSearch(e.target.value)}
                    className="import-search-input"
                  />
                </div>
              </div>

              {missingIdols.length === 0 ? (
                <div className="import-empty-state green">
                  <span>🎉</span>
                  <span>
                    100% Idol trong công ty đều đã có số liệu trong ngày này!
                  </span>
                </div>
              ) : filteredMissingIdols.length === 0 ? (
                <div className="import-empty-search">
                  Không tìm thấy Idol nào khớp với &ldquo;{missingSearch}&rdquo;.
                </div>
              ) : (
                <div className="missing-idols-grid">
                  {filteredMissingIdols.map((idol) => (
                    <article className="missing-idol-card" key={idol.id}>
                      <div className="missing-idol-top">
                        <span className="initial-avatar">
                          {idol.name.charAt(0).toUpperCase()}
                        </span>
                        <div className="missing-idol-details">
                          <strong className="missing-idol-name">{idol.name}</strong>
                          <span className="missing-idol-username">
                            {idol.username ? (
                              `@${idol.username}`
                            ) : (
                              <em className="text-warning">Chưa có TikTok</em>
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="missing-idol-bottom">
                        <span className="missing-status-tag">
                          0 kim cương trong file
                        </span>
                        {batch.status === "staged" && (
                          <ManualAddIdolAction
                            batchId={batch.id}
                            idolId={idol.id}
                            idolName={idol.name}
                          />
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* ── TAB 3 (If any): Dòng chưa khớp Idol ── */}
          {activeTab === "unmatched" && unmatchedRows.length > 0 && (
            <section className="surface tab-panel-surface">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    ⚠️ Dòng chưa trùng khớp với Idol ({unmatchedRows.length})
                  </h2>
                  <p className="panel-desc">
                    Các dòng dưới đây chưa được nhận diện Idol. Bạn có thể ghép Idol cho từng dòng nếu đây là tài khoản mới của Idol.
                  </p>
                </div>
                <div className="panel-search-box">
                  <input
                    type="search"
                    placeholder="Tìm username TikTok..."
                    value={unmatchedSearch}
                    onChange={(e) => setUnmatchedSearch(e.target.value)}
                    className="import-search-input"
                  />
                </div>
              </div>

              <div className="unmatched-items-list">
                {filteredUnmatchedRows.map((row) => (
                  <UnmatchedRowCard
                    key={`${row.batch_id}-${row.row_number}`}
                    row={row}
                    batchId={batch.id}
                    batchStatus={batch.status}
                    idols={idols}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── TAB 4: Lịch sử nhập ── */}
          {activeTab === "history" && (
            <section className="surface tab-panel-surface">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    📋 Lịch sử các lần nhập file ({historyCount})
                  </h2>
                  <p className="panel-desc">
                    Danh sách các báo cáo TikTok đã tải lên và trạng thái công bố tương ứng.
                  </p>
                </div>
              </div>

              {!history.length ? (
                <div className="import-empty-state">
                  <span>📂</span>
                  <span>Chưa có lịch sử nhập file nào.</span>
                </div>
              ) : (
                <div className="history-batch-list">
                  {history.map((b) => {
                    const isSelected = b.id === batch.id;
                    const st = STATUS_CONFIG[b.status] ?? STATUS_CONFIG.staged;
                    return (
                      <article
                        className={`history-batch-card ${isSelected ? "selected-batch" : ""}`}
                        key={b.id}
                      >
                        <div className="history-batch-info">
                          <div className="history-batch-primary">
                            <span className="history-date">📅 Ngày {b.data_date}</span>
                            <span className={`import-badge ${st.tagClass}`}>
                              {st.icon} {st.label}
                            </span>
                            {isSelected && (
                              <span className="current-viewing-tag">
                                (Đang xem)
                              </span>
                            )}
                          </div>
                          <span className="history-filename">📄 {b.file_path}</span>
                          <span className="history-time muted">
                            Tải lên lúc {vnDateTime(b.created_at)}
                          </span>
                        </div>
                        <div className="history-batch-actions">
                          {isSelected ? (
                            <span className="btn secondary btn-compact disabled">
                              Đang xem
                            </span>
                          ) : (
                            <Link
                              href={`/admin/imports?batch=${b.id}`}
                              className="btn secondary btn-compact"
                            >
                              Xem đối chiếu →
                            </Link>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {historyCount > 20 && (
                <nav className="pagination">
                  <span>Trang {currentPage}</span>
                  {currentPage > 1 && (
                    <Link
                      href={`/admin/imports?page=${currentPage - 1}`}
                      className="btn secondary btn-compact"
                    >
                      ← Trang trước
                    </Link>
                  )}
                  {currentPage * 20 < historyCount && (
                    <Link
                      href={`/admin/imports?page=${currentPage + 1}`}
                      className="btn secondary btn-compact"
                    >
                      Trang sau →
                    </Link>
                  )}
                </nav>
              )}
            </section>
          )}

          {/* ── Publish Action Center with "Tạm bỏ qua Idol chưa có số liệu" Option ── */}
          <section className="surface import-publish-container">
            {batch.status === "staged" && (
              <div className="import-action-banner ready-publish">
                <div className="action-banner-icon">🚀</div>
                <div className="action-banner-text">
                  <strong>Sẵn sàng công bố số liệu ngày {batch.data_date}</strong>
                  <p>
                    Đã lấy số liệu cho <strong>{matchedRows.length} Idol</strong> trong file.
                    {missingIdols.length > 0
                      ? ` Có ${missingIdols.length} Idol chưa có số liệu (sẽ tạm bỏ qua và ghi nhận 0 kim cương).`
                      : " Tất cả Idol đều đã có số liệu đầy đủ."}
                  </p>
                </div>
                <PublishBatchForm
                  batchId={batch.id}
                  currentPublishedId={currentPublished?.id ?? null}
                  dataDate={batch.data_date}
                  missingCount={missingIdols.length}
                />
              </div>
            )}

            {batch.status === "published" && (
              <div className="import-action-banner published-active">
                <div className="action-banner-icon">🎉</div>
                <div className="action-banner-text">
                  <strong>
                    Số liệu ngày {batch.data_date} đang được công bố chính thức
                  </strong>
                  <p>
                    Đã cộng dồn vào bảng xếp hạng tháng và báo cáo doanh thu kim cương của Idol.
                    Nếu phát hiện nhập nhầm ngày, bạn có thể bấm &ldquo;Thu hồi số liệu&rdquo; bên phải.
                  </p>
                </div>
                <div className="action-banner-buttons">
                  <Link
                    className="btn secondary"
                    href={`/home?month=${batch.data_date.slice(0, 7)}`}
                  >
                    🏆 Xem BXH tháng
                  </Link>
                  <Link
                    className="btn secondary"
                    href={`/reports?day=${batch.data_date}`}
                  >
                    📊 Báo cáo ngày
                  </Link>
                  <RevertBatchForm batchId={batch.id} dataDate={batch.data_date} />
                </div>
              </div>
            )}

            {batch.status === "reverted" && (
              <div className="import-action-banner reverted-banner">
                <div className="action-banner-icon">⚪</div>
                <div className="action-banner-text">
                  <strong>Bản nhập này đã được thu hồi</strong>
                  <p>
                    Dữ liệu ngày này hiện đã được gỡ khỏi bảng xếp hạng tháng.
                    Bạn có thể xóa bản này để nhập lại ngày mới, hoặc công bố lại.
                  </p>
                </div>
                <div className="action-banner-buttons">
                  <button
                    type="button"
                    className="btn secondary danger-btn btn-compact"
                    onClick={() => setIsDeleteBatchOpen(true)}
                  >
                    🗑️ Xóa bản đã thu hồi
                  </button>
                  <PublishBatchForm
                    batchId={batch.id}
                    currentPublishedId={currentPublished?.id ?? null}
                    dataDate={batch.data_date}
                    missingCount={missingIdols.length}
                    isRepublish
                  />
                </div>
              </div>
            )}
          </section>
        </>
      )}

      {/* ── When no batch is selected and upload is closed ── */}
      {!batch && !isUploadOpen && (
        <section className="surface empty-workspace-state">
          <span className="empty-icon">📁</span>
          <h2>Chưa chọn bản báo cáo nào</h2>
          <p className="muted">
            Chọn một bản nhập từ lịch sử bên dưới hoặc bấm &ldquo;Tải file TikTok mới&rdquo;
            để bắt đầu.
          </p>
          <button
            type="button"
            className="btn primary"
            onClick={() => setIsUploadOpen(true)}
          >
            📤 Tải file TikTok mới
          </button>
        </section>
      )}
    </div>
  );
}

// ── Dropzone & Upload Sub-component ──
function ImportDropzone({
  todayStr,
  yesterdayStr,
  onSuccess,
}: {
  todayStr: string;
  yesterdayStr: string;
  onSuccess: (batchId: string) => void;
}) {
  const [day, setDay] = useState(yesterdayStr);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issues, setIssues] = useState<{ row: number; message: string }[]>([]);

  const handleFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Vui lòng chỉ chọn file Excel định dạng .xlsx xuất từ TikTok.");
      return;
    }
    if (f.size > 3 * 1024 * 1024) {
      setError("File vượt quá dung lượng tối đa cho phép (3 MB).");
      return;
    }
    setError("");
    setIssues([]);
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Vui lòng chọn hoặc kéo thả file Excel vào đây.");
      return;
    }
    setBusy(true);
    setError("");
    setIssues([]);

    try {
      const form = new FormData();
      form.set("day", day);
      form.set("file", file);

      const res = await fetch("/api/imports", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Không tải được file báo cáo.");
        setIssues(data.issues ?? []);
      } else {
        onSuccess(data.id);
      }
    } catch {
      setError(
        "Mất kết nối hoặc phiên đăng nhập đã hết hạn. Hãy tải lại trang và thử lại."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="import-dropzone-form" onSubmit={handleSubmit}>
      {/* Date selector with quick presets */}
      <div className="import-date-picker-row">
        <label className="import-label" htmlFor="import-day-input">
          <strong>Ngày số liệu trên báo cáo:</strong>
        </label>
        <div className="date-input-group">
          <input
            id="import-day-input"
            type="date"
            name="day"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
            disabled={busy}
            className="import-date-field"
          />
          <button
            type="button"
            className={`btn-preset ${day === yesterdayStr ? "preset-active" : ""}`}
            onClick={() => setDay(yesterdayStr)}
            disabled={busy}
          >
            Hôm qua ({yesterdayStr})
          </button>
          <button
            type="button"
            className={`btn-preset ${day === todayStr ? "preset-active" : ""}`}
            onClick={() => setDay(todayStr)}
            disabled={busy}
          >
            Hôm nay ({todayStr})
          </button>
        </div>
      </div>
      <p className="hint">
        Chọn chính xác ngày ghi trên báo cáo của TikTok (không phải ngày hiện tại).
      </p>

      {/* Drag & Drop Area */}
      <div
        className={`import-dropzone ${isDragging ? "dropzone-active" : ""} ${
          file ? "dropzone-has-file" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        <input
          type="file"
          id="dropzone-file-input"
          accept=".xlsx"
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {file ? (
          <div className="chosen-file-info">
            <span className="file-icon">📊</span>
            <div className="file-text">
              <strong className="file-name">{file.name}</strong>
              <span className="file-size muted">
                {(file.size / 1024).toFixed(1)} KB
              </span>
            </div>
            <button
              type="button"
              className="btn secondary btn-compact"
              onClick={() => setFile(null)}
              disabled={busy}
            >
              Chọn file khác
            </button>
          </div>
        ) : (
          <label htmlFor="dropzone-file-input" className="dropzone-label">
            <span className="dropzone-icon">☁️</span>
            <strong className="dropzone-prompt">
              Kéo thả file .xlsx vào đây hoặc bấm để chọn file
            </strong>
            <span className="dropzone-hint muted">
              Hệ thống sẽ tự nhận diện Idol và bỏ qua các tài khoản ngoài công ty
            </span>
          </label>
        )}
      </div>

      {error && (
        <div className="import-alert-box error" role="alert">
          <strong>Lỗi:</strong> {error}
        </div>
      )}

      {issues.length > 0 && (
        <div className="import-errors">
          <strong>Phát hiện {issues.length} lỗi trong file:</strong>
          <ul>
            {issues.map((issue, idx) => (
              <li key={idx}>
                Dòng {issue.row}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="import-submit-bar">
        <button className="btn primary" disabled={busy || !file} type="submit">
          {busy ? (
            <span className="btn-spinner">Đang đọc & đối chiếu file…</span>
          ) : (
            "📤 Tải lên và lấy số liệu Idol"
          )}
        </button>
      </div>
    </form>
  );
}

// ── Manual Edit Row Action Component ──
function ManualRowEditAction({
  batchId,
  rowNumber,
  idolName,
  currentDiamonds,
}: {
  batchId: string;
  rowNumber: number;
  idolName: string;
  currentDiamonds: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [val, setVal] = useState(currentDiamonds);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      form.set("row", String(rowNumber));
      form.set("diamonds", val);

      const res = await updateRowDiamonds({}, form);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ success: res.success });
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn secondary btn-compact edit-row-btn"
        onClick={() => {
          setVal(currentDiamonds);
          setIsOpen(true);
        }}
        title="Sửa số kim cương thủ công"
      >
        ✏️ Sửa
      </button>
    );
  }

  return (
    <div className="inline-edit-popover">
      <form onSubmit={handleSave} className="inline-edit-form">
        <label className="edit-popover-label">
          Sửa kim cương ({idolName}):
          <input
            type="number"
            min="0"
            step="1"
            required
            value={val}
            onChange={(e) => setVal(e.target.value)}
            disabled={isPending}
            className="edit-popover-input"
          />
        </label>
        <div className="edit-popover-actions">
          <button
            type="submit"
            className="btn primary btn-compact"
            disabled={isPending}
          >
            {isPending ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            className="btn secondary btn-compact"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            Hủy
          </button>
        </div>
        {feedback?.error && (
          <p className="feedback error text-xs">{feedback.error}</p>
        )}
      </form>
    </div>
  );
}

// ── Manual Add Diamonds for Missing Idol Component ──
function ManualAddIdolAction({
  batchId,
  idolId,
  idolName,
}: {
  batchId: string;
  idolId: string;
  idolName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [val, setVal] = useState("0");
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      form.set("idol", idolId);
      form.set("diamonds", val);

      const res = await setManualIdolDiamonds({}, form);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ success: res.success });
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn secondary btn-compact"
        onClick={() => setIsOpen(true)}
      >
        ➕ Nhập số liệu tay
      </button>
    );
  }

  return (
    <div className="inline-add-popover">
      <form onSubmit={handleSave} className="inline-edit-form">
        <label className="edit-popover-label">
          Số kim cương cho {idolName}:
          <input
            type="number"
            min="0"
            step="1"
            required
            value={val}
            onChange={(e) => setVal(e.target.value)}
            disabled={isPending}
            className="edit-popover-input"
          />
        </label>
        <div className="edit-popover-actions">
          <button
            type="submit"
            className="btn primary btn-compact"
            disabled={isPending}
          >
            {isPending ? "Đang thêm…" : "Thêm vào bản nhập"}
          </button>
          <button
            type="button"
            className="btn secondary btn-compact"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            Hủy
          </button>
        </div>
        {feedback?.error && (
          <p className="feedback error text-xs">{feedback.error}</p>
        )}
      </form>
    </div>
  );
}

// ── Change Batch Date Form Sub-component ──
function ChangeBatchDateForm({
  batchId,
  currentDate,
  todayStr,
  yesterdayStr,
  onClose,
}: {
  batchId: string;
  currentDate: string;
  todayStr: string;
  yesterdayStr: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [newDate, setNewDate] = useState(currentDate);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDate === currentDate) {
      onClose();
      return;
    }
    setFeedback(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      form.set("new_day", newDate);

      const res = await changeBatchDate({}, form);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        setFeedback({ success: res.success });
        onClose();
        router.refresh();
      }
    });
  };

  return (
    <div className="surface batch-date-change-card">
      <div className="date-change-header">
        <strong>📅 Đổi ngày báo cáo cho bản nhập này</strong>
        <button
          type="button"
          className="btn-icon-close"
          onClick={onClose}
          title="Đóng"
        >
          ✕
        </button>
      </div>
      <p className="muted text-sm">
        Nếu bạn lỡ chọn nhầm ngày khi tải file, hãy chọn lại ngày chính xác bên dưới:
      </p>
      <form onSubmit={handleSubmit} className="date-change-form">
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          required
          disabled={isPending}
          className="import-date-field"
        />
        <button
          type="button"
          className="btn secondary btn-compact"
          onClick={() => setNewDate(yesterdayStr)}
          disabled={isPending}
        >
          Hôm qua ({yesterdayStr})
        </button>
        <button
          type="button"
          className="btn secondary btn-compact"
          onClick={() => setNewDate(todayStr)}
          disabled={isPending}
        >
          Hôm nay ({todayStr})
        </button>
        <button
          type="submit"
          className="btn primary btn-compact"
          disabled={isPending || newDate === currentDate}
        >
          {isPending ? "Đang đổi…" : "Lưu ngày mới"}
        </button>
      </form>
      {feedback?.error && (
        <p className="feedback error text-xs">{feedback.error}</p>
      )}
    </div>
  );
}

// ── Delete / Cancel Staged Batch Modal Sub-component ──
function DeleteBatchModal({
  batchId,
  dataDate,
  onClose,
}: {
  batchId: string;
  dataDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleDelete = () => {
    setFeedback(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);

      const res = await deleteImportBatch({}, form);
      if (res.error) {
        setFeedback({ error: res.error });
      } else {
        onClose();
        router.push("/admin/imports");
        router.refresh();
      }
    });
  };

  return (
    <div className="surface batch-delete-modal-card">
      <h3 className="text-danger">⚠️ Hủy và xóa bản nhập ngày {dataDate}?</h3>
      <p className="muted text-sm">
        Toàn bộ số liệu xem trước của bản nhập này sẽ bị xóa bỏ. Bạn có thể tải lại file mới với ngày chính xác bất cứ lúc nào.
      </p>
      <div className="delete-modal-actions">
        <button
          type="button"
          className="btn danger btn-compact"
          onClick={handleDelete}
          disabled={isPending}
        >
          {isPending ? "Đang xóa…" : "Xác nhận xóa bản nhập"}
        </button>
        <button
          type="button"
          className="btn secondary btn-compact"
          onClick={onClose}
          disabled={isPending}
        >
          Hủy bỏ
        </button>
      </div>
      {feedback?.error && (
        <p className="feedback error text-xs">{feedback.error}</p>
      )}
    </div>
  );
}

// ── Unmatched Row Resolver Card (Legacy rows support) ──
function UnmatchedRowCard({
  row,
  batchId,
  batchStatus,
  idols,
}: {
  row: ImportRowItem & {
    current_account_username: string | null;
    current_idol_name: string | null;
  };
  batchId: string;
  batchStatus: string;
  idols: IdolProfile[];
}) {
  const router = useRouter();
  const [selectedIdolId, setSelectedIdolId] = useState("");
  const [allowRename, setAllowRename] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const selectedIdol = idols.find((p) => p.id === selectedIdolId);
  const isRenameCase = Boolean(
    selectedIdol?.username &&
      selectedIdol.username.trim().toLowerCase() !== row.username.trim().toLowerCase()
  );

  const handleResolve = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIdolId) {
      setFeedback({ error: "Vui lòng chọn một Idol để ghép." });
      return;
    }

    setFeedback(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      form.set("row", String(row.row_number));
      form.set("idol", selectedIdolId);
      form.set("expected_username", selectedIdol?.username ?? "");
      if (allowRename) form.set("rename", "on");

      const result = await mapUsername({}, form);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ success: "Đã liên kết thành công!" });
        router.refresh();
      }
    });
  };

  return (
    <article className="unmatched-card">
      <div className="unmatched-card-main">
        <div className="unmatched-meta-row">
          <span className="unmatched-row-badge">Dòng #{row.row_number}</span>
          <span className="unmatched-diamonds">
            💎 {formatNumber(row.diamonds)} kim cương
          </span>
        </div>

        <div className="unmatched-user-block">
          <span className="tiktok-logo">🎵</span>
          <span className="unmatched-handle">@{row.username}</span>
        </div>
      </div>

      <div className="unmatched-card-action">
        {batchStatus === "staged" ? (
          <form className="unmatched-inline-form" onSubmit={handleResolve}>
            <label className="action-form-label">
              Ghép dòng này với Idol:
              <select
                className="idol-select-input"
                value={selectedIdolId}
                onChange={(e) => {
                  setSelectedIdolId(e.target.value);
                  setAllowRename(false);
                  setFeedback(null);
                }}
                disabled={isPending}
                required
              >
                <option value="">-- Chọn Idol nhận số liệu --</option>
                {idols.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{" "}
                    {p.username
                      ? `(@${p.username})`
                      : " [Chưa có TikTok]"}
                  </option>
                ))}
              </select>
            </label>

            {isRenameCase && selectedIdol && (
              <div className="rename-warning-box">
                <span className="rename-warn-icon">⚠️</span>
                <div className="rename-warn-text">
                  <p>
                    Idol <strong>{selectedIdol.name}</strong> hiện đang gắn với TikTok{" "}
                    <strong>@{selectedIdol.username}</strong>.
                  </p>
                  <label className="rename-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allowRename}
                      onChange={(e) => setAllowRename(e.target.checked)}
                      disabled={isPending}
                    />
                    <span>
                      Xác nhận đổi sang <strong>@{row.username}</strong>
                    </span>
                  </label>
                </div>
              </div>
            )}

            <div className="unmatched-form-submit">
              <button
                type="submit"
                className="btn primary btn-compact"
                disabled={isPending || !selectedIdolId || (isRenameCase && !allowRename)}
              >
                {isPending ? "Đang lưu liên kết…" : "💾 Ghép Idol"}
              </button>
            </div>

            {feedback?.error && (
              <p className="feedback error" role="alert">
                {feedback.error}
              </p>
            )}
            {feedback?.success && (
              <p className="feedback success" role="status">
                {feedback.success}
              </p>
            )}
          </form>
        ) : (
          <div className="unmatched-readonly-note muted">
            Bản nhập đã hoàn tất hoặc thu hồi.
          </div>
        )}
      </div>
    </article>
  );
}

// ── Publish Form Sub-component (with Skip Missing Option) ──
function PublishBatchForm({
  batchId,
  currentPublishedId,
  dataDate,
  missingCount,
  isRepublish = false,
}: {
  batchId: string;
  currentPublishedId: string | null;
  dataDate: string;
  missingCount: number;
  isRepublish?: boolean;
}) {
  const router = useRouter();
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [skipMissingConfirmed, setSkipMissingConfirmed] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      form.set("current", currentPublishedId ?? "");
      if (replaceConfirmed || !currentPublishedId) {
        form.set("replace", "on");
      }

      const result = await publishImport({}, form);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ success: result.success });
        router.refresh();
      }
    });
  };

  return (
    <form className="publish-form-wrap" onSubmit={handleSubmit}>
      {/* Option to skip missing idols and publish */}
      {missingCount > 0 && (
        <div className="skip-missing-box">
          <label className="import-check">
            <input
              type="checkbox"
              checked={skipMissingConfirmed}
              onChange={(e) => setSkipMissingConfirmed(e.target.checked)}
              disabled={isPending}
            />
            <span>
              Tạm bỏ qua <strong>{missingCount} Idol</strong> chưa có số liệu (ghi nhận 0 kim cương cho ngày {dataDate}) và cập nhật sau.
            </span>
          </label>
        </div>
      )}

      {currentPublishedId && (
        <div className="replace-notice-box">
          <label className="import-check">
            <input
              type="checkbox"
              name="replace"
              checked={replaceConfirmed}
              onChange={(e) => setReplaceConfirmed(e.target.checked)}
              required
              disabled={isPending}
            />
            <span>
              Xác nhận thay thế toàn bộ số liệu ngày <strong>{dataDate}</strong> bằng bản này.
            </span>
          </label>
        </div>
      )}

      <button
        type="submit"
        className="btn primary btn-publish-cta"
        disabled={isPending || (Boolean(currentPublishedId) && !replaceConfirmed)}
      >
        {isPending
          ? "Đang lưu & tính lại tổng tháng…"
          : isRepublish
          ? "🚀 Công bố lại số liệu ngày"
          : "🚀 Lưu & Công bố số liệu ngày"}
      </button>

      {feedback?.error && (
        <p className="feedback error" role="alert">
          {feedback.error}
        </p>
      )}
      {feedback?.success && (
        <p className="feedback success" role="status">
          {feedback.success}
        </p>
      )}
    </form>
  );
}

// ── Revert Form Sub-component ──
function RevertBatchForm({
  batchId,
  dataDate,
}: {
  batchId: string;
  dataDate: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    error?: string;
    success?: string;
  } | null>(null);

  const handleRevert = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const form = new FormData();
      form.set("batch", batchId);
      if (confirmRevert) form.set("confirm", "on");

      const result = await revertImport({}, form);
      if (result.error) {
        setFeedback({ error: result.error });
      } else {
        setFeedback({ success: result.success });
        setIsOpen(false);
        router.refresh();
      }
    });
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        className="btn secondary danger-btn btn-compact"
        onClick={() => setIsOpen(true)}
      >
        Thu hồi số liệu…
      </button>
    );
  }

  return (
    <form className="revert-modal-box" onSubmit={handleRevert}>
      <p className="text-danger font-bold">
        ⚠️ Xác nhận thu hồi số liệu ngày {dataDate}?
      </p>
      <p className="muted text-sm">
        Dữ liệu ngày này sẽ bị gỡ khỏi tổng tháng và bảng xếp hạng ngay lập tức.
        Bản nhập sẽ quay về trạng thái đã thu hồi để bạn có thể xóa hoặc sửa đổi ngày.
      </p>
      <label className="import-check">
        <input
          type="checkbox"
          checked={confirmRevert}
          onChange={(e) => setConfirmRevert(e.target.checked)}
          required
          disabled={isPending}
        />
        <span>Tôi xác nhận thu hồi số liệu ngày này.</span>
      </label>
      <div className="revert-actions-row">
        <button
          type="submit"
          className="btn danger btn-compact"
          disabled={isPending || !confirmRevert}
        >
          {isPending ? "Đang thu hồi…" : "Đồng ý thu hồi"}
        </button>
        <button
          type="button"
          className="btn secondary btn-compact"
          onClick={() => setIsOpen(false)}
          disabled={isPending}
        >
          Hủy
        </button>
      </div>
      {feedback?.error && (
        <p className="feedback error" role="alert">
          {feedback.error}
        </p>
      )}
    </form>
  );
}
