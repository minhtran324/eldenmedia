"use client";

import { useState, useMemo } from "react";
import { AssignmentForm, OperatorAccessForm, RevokeInviteForm, StatusForm } from "./account-forms";
import type { Member, OperatorInvite } from "@/types/database";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/auth/routing";

export type AdminHRProps = {
  members: Member[];
  operators: { id: string; full_name: string }[];
  invites: OperatorInvite[];
  usernames: Record<string, string | null>;
  initialTab?: string;
};

const VALID_TABS = ["overview", "teams", "pending", "operators"];

function InitialAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const letter = (name || "?").charAt(0).toUpperCase();
  if (large) {
    return (
      <div className="member-avatar-large" aria-hidden="true">
        {letter}
      </div>
    );
  }
  return (
    <div className="initial-avatar" aria-hidden="true">
      {letter}
    </div>
  );
}

function StatusPill({ status }: { status: Member["status"] }) {
  const cls =
    status === "pending" ? "role-pill amber" : status === "suspended" ? "role-pill red" : "role-pill";
  return <span className={cls}>{STATUS_LABELS[status]}</span>;
}

function RolePill({ role }: { role: Member["role"] }) {
  return <span className="role-pill">{ROLE_LABELS[role]}</span>;
}

function SearchBar({
  value,
  onChange,
  placeholder = "Tìm theo tên, email, TikTok username...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="hr-search-bar">
      <svg
        className="hr-search-icon"
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
      <input
        type="search"
        className="hr-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}

// ─── TAB 1: OVERVIEW ────────────────────────────────────────────────────────

function OverviewTab({
  members,
  operators,
  usernames,
  onGoToPending,
}: {
  members: Member[];
  operators: { id: string; full_name: string }[];
  usernames: Record<string, string | null>;
  onGoToPending: () => void;
}) {
  const idols = members.filter((m) => m.role === "idol");
  const activeIdols = idols.filter((m) => m.status === "active");
  const activeOperators = members.filter((m) => m.role === "operator" && m.status === "active");
  const pendingMembers = members.filter((m) => m.status === "pending");
  const suspendedMembers = members.filter((m) => m.status === "suspended");
  const assignedIdols = idols.filter((m) => m.operator_id !== null);

  const operatorIds = new Set(idols.map((m) => m.operator_id).filter(Boolean));
  const teamCount = operatorIds.size;
  const assignPct = idols.length > 0 ? Math.round((assignedIdols.length / idols.length) * 100) : 0;

  return (
    <div>
      {/* KPI Grid */}
      <div className="hr-kpi-grid">
        <article className="hr-kpi-card">
          <div className="hr-kpi-label">Tổng nhân sự</div>
          <div className="hr-kpi-value">{members.length}</div>
          <div className="hr-kpi-sub">tất cả vai trò</div>
        </article>
        <article className="hr-kpi-card">
          <div className="hr-kpi-label">Idol đang hoạt động</div>
          <div className="hr-kpi-value">{activeIdols.length}</div>
          <div className="hr-kpi-sub">trên {idols.length} idol</div>
        </article>
        <article className="hr-kpi-card">
          <div className="hr-kpi-label">Vận hành đang hoạt động</div>
          <div className="hr-kpi-value">{activeOperators.length}</div>
          <div className="hr-kpi-sub">
            {operators.length > 0 ? `${operators.length} có tài khoản` : "chưa có vận hành"}
          </div>
        </article>
        <article className={`hr-kpi-card${pendingMembers.length > 0 ? " kpi-alert" : ""}`}>
          <div className="hr-kpi-label">Chờ duyệt</div>
          <div className="hr-kpi-value">{pendingMembers.length}</div>
          <div className="hr-kpi-sub">
            {pendingMembers.length > 0 ? "cần xử lý ngay" : "không có yêu cầu"}
          </div>
        </article>
      </div>

      {/* Quick stats bar */}
      <section className="surface" style={{ marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
          <strong style={{ color: "var(--ink)" }}>{teamCount} team</strong> đang hoạt động &nbsp;·&nbsp;{" "}
          <strong style={{ color: "var(--ink)" }}>{assignPct}%</strong> idol đã được phân team (
          {assignedIdols.length}/{idols.length})
        </p>
      </section>

      {/* Cần xử lý ngay */}
      {pendingMembers.length > 0 && (
        <section className="surface" style={{ marginBottom: 20 }}>
          <div
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
          >
            <h2 style={{ margin: 0, fontSize: 15 }}>⚠️ Cần xử lý ngay</h2>
            <button type="button" className="quick-action-btn" onClick={onGoToPending}>
              Xem tất cả →
            </button>
          </div>
          <div className="alert-card-list">
            {pendingMembers.slice(0, 5).map((m) => (
              <div key={m.id} className="hr-alert-card">
                <InitialAvatar name={m.full_name} />
                <div className="hr-alert-name">{m.full_name || "Chưa có tên"}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.email}</div>
                <RolePill role={m.role} />
                <button type="button" className="quick-action-btn" onClick={onGoToPending}>
                  Duyệt
                </button>
              </div>
            ))}
            {pendingMembers.length > 5 && (
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                và {pendingMembers.length - 5} người khác...
              </p>
            )}
          </div>
        </section>
      )}

      {/* Tạm khóa gần đây */}
      {suspendedMembers.length > 0 && (
        <section className="surface">
          <h2 style={{ marginTop: 0, fontSize: 15 }}>🔒 Tài khoản đang tạm khóa ({suspendedMembers.length})</h2>
          <div className="operator-section">
            {suspendedMembers.map((m) => (
              <div key={m.id} className="operator-item">
                <InitialAvatar name={m.full_name} />
                <span className="operator-name">{m.full_name || "Chưa có tên"}</span>
                <RolePill role={m.role} />
                <StatusPill status={m.status} />
                {m.role === "idol" && usernames[m.id] && (
                  <span style={{ fontSize: 11, color: "var(--primary-hover)", fontWeight: 600 }}>
                    @{usernames[m.id]}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {pendingMembers.length === 0 && suspendedMembers.length === 0 && (
        <section className="surface">
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
            ✅ Mọi thứ ổn! Không có thành viên nào cần xử lý.
          </p>
        </section>
      )}
    </div>
  );
}

// ─── TAB 2: TEAMS ────────────────────────────────────────────────────────────

function TeamsTab({
  members,
  operators,
  usernames,
}: {
  members: Member[];
  operators: { id: string; full_name: string }[];
  usernames: Record<string, string | null>;
}) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredIdols = useMemo(() => {
    const q = search.trim().toLowerCase();
    const idols = members.filter((m) => m.role === "idol");
    if (!q) return idols;
    return idols.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q) ||
        (usernames[m.id] ?? "").toLowerCase().includes(q)
    );
  }, [members, search, usernames]);

  const teamGroups = useMemo(() => {
    const groups = new Map<string | null, { operatorName: string | null; idols: Member[] }>();
    for (const idol of filteredIdols) {
      const key = idol.operator_id ?? null;
      if (!groups.has(key)) {
        groups.set(key, { operatorName: idol.operator_name, idols: [] });
      }
      groups.get(key)!.idols.push(idol);
    }
    return Array.from(groups.entries()).sort(([keyA, a], [keyB, b]) => {
      if (keyA === null) return 1;
      if (keyB === null) return -1;
      return (a.operatorName ?? "").localeCompare(b.operatorName ?? "", "vi");
    });
  }, [filteredIdols]);

  return (
    <div>
      <SearchBar value={search} onChange={setSearch} placeholder="Tìm idol theo tên, email, TikTok..." />

      {teamGroups.length === 0 && (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Không tìm thấy idol nào phù hợp.</p>
      )}

      {teamGroups.map(([operatorId, group]) => {
        const isUnassigned = operatorId === null;
        return (
          <div key={operatorId ?? "__unassigned__"} className={`team-section${isUnassigned ? " team-unassigned" : ""}`}>
            <div className="team-section-header">
              <span className="team-name">
                {isUnassigned ? "📋 Chưa phân team" : `👤 Team ${group.operatorName ?? "Không tên"}`}
              </span>
              <span className="team-idol-count">{group.idols.length} idol</span>
            </div>
            <div className="team-idol-grid">
              {group.idols.map((idol) => (
                <div key={idol.id} className="idol-hr-card">
                  <div className="idol-hr-top">
                    <InitialAvatar name={idol.full_name} />
                    <div className="idol-hr-info">
                      <div className="idol-hr-name">{idol.full_name || "Chưa có tên"}</div>
                      {usernames[idol.id] ? (
                        <div className="idol-hr-username">@{usernames[idol.id]}</div>
                      ) : (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>Chưa liên kết TikTok</div>
                      )}
                      <div className="idol-hr-email">{idol.email}</div>
                    </div>
                    <StatusPill status={idol.status} />
                  </div>
                  {idol.status !== "suspended" && (
                    <>
                      <button
                        type="button"
                        className="btn secondary"
                        style={{ fontSize: 11, padding: "4px 10px" }}
                        onClick={() =>
                          setExpandedId(expandedId === idol.id ? null : idol.id)
                        }
                      >
                        {expandedId === idol.id ? "✕ Đóng" : "🔀 Chuyển team"}
                      </button>
                      {expandedId === idol.id && (
                        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                          <AssignmentForm member={idol} operators={operators} />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TAB 3: PENDING ──────────────────────────────────────────────────────────

function PendingTab({
  members,
  operators,
  usernames,
}: {
  members: Member[];
  operators: { id: string; full_name: string }[];
  usernames: Record<string, string | null>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const pendingMembers = members.filter((m) => m.status === "pending");

  if (pendingMembers.length === 0) {
    return (
      <section className="surface" style={{ textAlign: "center", padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
        <h2 style={{ marginTop: 0 }}>Không có thành viên nào chờ duyệt</h2>
        <p style={{ color: "var(--muted)" }}>Tất cả thành viên đã được xử lý. Tiếp tục phát huy!</p>
      </section>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pendingMembers.map((member) => {
        const isExpanded = expandedId === member.id;
        return (
          <article key={member.id} className="pending-member-card">
            <div className="pending-header">
              <InitialAvatar name={member.full_name} large />
              <div className="pending-info">
                <h3 className="pending-name">{member.full_name || "Chưa có tên"}</h3>
                <p className="pending-email">{member.email}</p>
                {member.role === "idol" && usernames[member.id] && (
                  <p className="pending-meta">@{usernames[member.id]}</p>
                )}
                <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <RolePill role={member.role} />
                  <StatusPill status={member.status} />
                  {member.joined_on && (
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>
                      Gia nhập: {member.joined_on}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Inline assignment form for idols */}
            {member.role === "idol" && (
              <div className="pending-actions">
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "0 0 8px" }}>
                    PHÂN CÔNG & DUYỆT
                  </p>
                  <AssignmentForm member={member} operators={operators} />
                </div>
              </div>
            )}

            {/* For non-idol pending members: show approve via status form toggle */}
            {member.role !== "idol" && (
              <div className="pending-actions">
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", margin: "0 0 8px" }}>
                    QUẢN LÝ TRẠNG THÁI
                  </p>
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 12 }}
                    onClick={() => setExpandedId(isExpanded ? null : member.id)}
                  >
                    {isExpanded ? "✕ Đóng" : "⚙️ Xử lý tài khoản"}
                  </button>
                  {isExpanded && (
                    <div style={{ marginTop: 10 }}>
                      <StatusForm member={member} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Danger: suspend */}
            {member.role === "idol" && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  style={{ fontSize: 11 }}
                  onClick={() => setExpandedId(isExpanded ? null : member.id)}
                >
                  {isExpanded ? "✕ Đóng" : "🔒 Khóa tài khoản"}
                </button>
                {isExpanded && (
                  <div style={{ marginTop: 10 }}>
                    <StatusForm member={member} />
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

// ─── TAB 4: OPERATORS ────────────────────────────────────────────────────────

function OperatorsTab({
  members,
  operators,
  invites,
}: {
  members: Member[];
  operators: { id: string; full_name: string }[];
  invites: OperatorInvite[];
}) {
  const idolsByOperator = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.role === "idol" && m.operator_id) {
        map.set(m.operator_id, (map.get(m.operator_id) ?? 0) + 1);
      }
    }
    return map;
  }, [members]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Section 1: Grant access */}
      <section className="surface">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>➕ Cấp quyền vận hành mới</h2>
        <OperatorAccessForm />
      </section>

      <div className="section-divider" />

      {/* Section 2: Active operators */}
      <section>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>
          ✅ Vận hành đang hoạt động ({operators.length})
        </h2>
        {operators.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Chưa có vận hành nào đang hoạt động.</p>
        ) : (
          <div className="operator-section">
            {operators.map((op) => {
              const idolCount = idolsByOperator.get(op.id) ?? 0;
              return (
                <div key={op.id} className="operator-item">
                  <InitialAvatar name={op.full_name} />
                  <span className="operator-name">{op.full_name}</span>
                  <span className="operator-idol-count">
                    {idolCount} idol{idolCount !== 1 ? "" : ""}
                  </span>
                  <span className="role-pill">Vận hành</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="section-divider" />

      {/* Section 3: Pending invites */}
      <section>
        <h2 style={{ fontSize: 15, margin: "0 0 12px" }}>
          ⏳ Chờ kích hoạt ({invites.length})
        </h2>
        {invites.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>Không có email nào đang chờ kích hoạt.</p>
        ) : (
          <div className="operator-section">
            {invites.map((invite) => (
              <div key={invite.id} className="invite-item">
                <InitialAvatar name={invite.full_name} />
                <div className="invite-info">
                  <div className="invite-name">{invite.full_name}</div>
                  <div className="invite-email">{invite.email}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                    Tạo lúc: {new Date(invite.created_at).toLocaleDateString("vi-VN")}
                  </div>
                </div>
                <RevokeInviteForm id={invite.id} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── MAIN CLIENT COMPONENT ───────────────────────────────────────────────────

export function AdminHRClient({
  members,
  operators,
  invites,
  usernames,
  initialTab,
}: AdminHRProps) {
  const [activeTab, setActiveTab] = useState(
    VALID_TABS.includes(initialTab ?? "") ? initialTab! : "overview"
  );

  const pendingCount = members.filter((m) => m.status === "pending").length;

  const switchTab = (t: string) => {
    setActiveTab(t);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/admin?tab=${t}`);
    }
  };

  const tabs = [
    { key: "overview", label: "Tổng quan", icon: "📊" },
    { key: "teams", label: "Theo team", icon: "👥" },
    { key: "pending", label: "Chờ duyệt", icon: "⏳", count: pendingCount },
    { key: "operators", label: "Vận hành", icon: "⚙️", count: invites.length },
  ];

  return (
    <div className="admin-hr-workspace">
      {/* Tab Strip */}
      <nav className="schedule-tab-strip" aria-label="Quản lý nhân sự" style={{ marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`schedule-tab-btn${activeTab === t.key ? " tab-active" : ""}`}
            onClick={() => switchTab(t.key)}
            aria-pressed={activeTab === t.key}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.count !== undefined && t.count > 0 && (
              <span className="tab-count-badge">{t.count}</span>
            )}
          </button>
        ))}
      </nav>

      {/* TAB: OVERVIEW */}
      {activeTab === "overview" && (
        <OverviewTab
          members={members}
          operators={operators}
          usernames={usernames}
          onGoToPending={() => switchTab("pending")}
        />
      )}

      {/* TAB: TEAMS */}
      {activeTab === "teams" && (
        <TeamsTab members={members} operators={operators} usernames={usernames} />
      )}

      {/* TAB: PENDING */}
      {activeTab === "pending" && (
        <PendingTab members={members} operators={operators} usernames={usernames} />
      )}

      {/* TAB: OPERATORS */}
      {activeTab === "operators" && (
        <OperatorsTab members={members} operators={operators} invites={invites} />
      )}
    </div>
  );
}
