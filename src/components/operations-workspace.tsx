import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { vietnamToday } from "@/lib/scheduling";
import { WorkspaceShell } from "./workspace-shell";
import { IdolCheckinFlow } from "./idol-checkin-flow";
import { IdolPersonalHistory } from "./idol-personal-history";
import { OperatorOperationsView } from "./operator-operations-view";
import type { Role } from "@/types/database";

export async function OperationsWorkspace({
  role,
  page = 1,
  day: requestedDay,
  idol,
}: {
  role: Role;
  page?: number;
  day?: string;
  idol?: string;
}) {
  const { profile, supabase } = await requireActive(role);
  const currentPage = Math.max(1, Math.min(10000, Math.trunc(page) || 1));
  const today = vietnamToday();
  const base = `/${role}/operations`;
  const day =
    requestedDay &&
    /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) &&
    !Number.isNaN(Date.parse(requestedDay))
      ? requestedDay
      : today;

  const [report, ownDevice, inbox, loans] = await Promise.all([
    supabase.rpc("idol_operations_day", { day }),
    role === "idol"
      ? supabase.rpc("my_open_device", {})
      : Promise.resolve({ data: null, error: null }),
    role !== "idol"
      ? supabase
          .rpc("device_request_inbox", {}, { count: "exact" })
          .range((currentPage - 1) * 50, currentPage * 50 - 1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    role !== "idol"
      ? supabase.rpc("operational_loans", {})
      : Promise.resolve({ data: [], error: null }),
  ]);

  const current =
    role === "idol" && day !== today
      ? await supabase.rpc("idol_operations_day", { day: today })
      : report;

  const failed = [report, ownDevice, inbox, loans, current].find(
    (r) => r.error
  )?.error;

  // eslint-disable-next-line react-hooks/purity
  const serverNow = Date.now();

  const isMigrationError = ["PGRST202", "42883", "42703"].includes(
    failed?.code ?? ""
  );

  return (
    <WorkspaceShell profile={profile}>
      {/* ── Page Heading: Tailored to Role ── */}
      {role === "idol" ? (
        <section className="page-heading">
          <div className="heading-tag">
            <span>📱</span>
            <span>CA LIVE CỦA TÔI</span>
          </div>
          <h1>Vào ca theo từng bước</h1>
          <p>
            Nhận phòng trước khi live · Nhận máy nếu cần · Quét QR trả máy và checkout khi kết thúc.
          </p>
        </section>
      ) : (
        <section className="page-heading">
          <div className="heading-tag">
            <span>👁️</span>
            <span>GIÁM SÁT VẬN HÀNH CA LIVE</span>
          </div>
          <h1>Theo dõi ca live & Thiết bị</h1>
          <p>
            Giám sát thời gian vào/ra phòng của Idol · Duyệt thiết bị không đúng phòng · Kiểm soát thiết bị chưa trả.
          </p>
        </section>
      )}

      {failed ? (
        <section className="surface" role="alert">
          <h2>Chưa tải được tiến trình ca</h2>
          <p>
            {isMigrationError
              ? "Cần chạy migration SQL 019 sau 018 trên Supabase để dùng luồng mới."
              : "Vui lòng tải lại trang và kiểm tra kết nối."}
          </p>
          <p className="muted">Mã lỗi: {failed.code || "CONNECTION_ERROR"}</p>
          <Link className="btn secondary" href={base}>
            Tải lại trang
          </Link>
        </section>
      ) : role === "idol" ? (
        /* ══════════════════════════════════════════════════════════════
           IDOL EXPERIENCE: MOBILE-FIRST, STREAMLINED
        ══════════════════════════════════════════════════════════════ */
        <div className="idol-operations-container">
          {/* Section 1: Active Check-in / Checkout Flow */}
          <IdolCheckinFlow
            rows={current.data ?? []}
            device={ownDevice.data}
            serverNow={serverNow}
          />

          {/* Section 2: Personal Turn History & Daily Log */}
          <IdolPersonalHistory
            rows={report.data ?? []}
            day={day}
            today={today}
            base={base}
          />
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════
           OPERATOR & ADMIN EXPERIENCE: DESKTOP-OPTIMIZED DASHBOARD
        ══════════════════════════════════════════════════════════════ */
        <OperatorOperationsView
          rows={report.data ?? []}
          inbox={inbox.data ?? []}
          inboxCount={inbox.count ?? 0}
          loans={loans.data ?? []}
          day={day}
          today={today}
          base={base}
          serverNow={serverNow}
          initialIdol={idol}
          currentPage={currentPage}
        />
      )}
    </WorkspaceShell>
  );
}
