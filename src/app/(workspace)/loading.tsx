export default function WorkspaceLoading() {
  return (
    <div className="workspace-content-loading" aria-busy="true" aria-label="Đang tải dữ liệu...">
      {/* Page heading skeleton */}
      <div className="skel-page-heading">
        <div className="skeleton skel-line w-sm" style={{ height: "10px" }} />
        <div className="skeleton skel-heading-main" />
        <div className="skeleton skel-heading-sub" />
      </div>

      {/* Stat cards skeleton */}
      <div className="skel-cards-row">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton skel-card" />
        ))}
      </div>

      {/* Main surface skeleton */}
      <div className="skel-surface">
        <div className="skeleton skel-surface-title" />
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton skel-table-row" style={{ opacity: 1 - i * 0.2 }} />
        ))}
      </div>
    </div>
  );
}
