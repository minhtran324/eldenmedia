import Link from "next/link";
import { requireActive } from "@/lib/auth/server";
import { isUuid } from "@/lib/auth/routing";
import { WorkspaceShell } from "@/components/workspace-shell";
import { AdminImportClient } from "@/components/admin-import-client";
import { vietnamToday, addDays } from "@/lib/scheduling";

export default async function Imports({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string; page?: string; tab?: string }>;
}) {
  const { profile, supabase } = await requireActive("admin");
  const params = await searchParams;
  const page = Math.max(1, Math.min(10000, parseInt(params.page ?? "1", 10) || 1));

  const [historyResult, peopleResult, accountsResult] = await Promise.all([
    supabase
      .from("import_batches")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .order("id")
      .range((page - 1) * 20, page * 20 - 1),
    supabase
      .from("profiles")
      .select("id,full_name")
      .eq("role", "idol")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("platform_accounts").select("id,idol_id,username"),
  ]);

  // Determine active batch ID: use requested batch, or default to the most recent batch
  const requestedBatchId = params.batch && isUuid(params.batch) ? params.batch : null;
  const defaultBatchId = historyResult.data?.[0]?.id ?? null;
  const activeBatchId = requestedBatchId ?? defaultBatchId;

  const [selectedBatchResult, rowsResult, monthPreviewResult] = activeBatchId
    ? await Promise.all([
        supabase.from("import_batches").select("*").eq("id", activeBatchId).maybeSingle(),
        supabase
          .from("diamond_import_rows")
          .select("*")
          .eq("batch_id", activeBatchId)
          .order("row_number")
          .limit(1000),
        supabase.rpc("diamond_import_month_preview", { batch: activeBatchId }),
      ])
    : [
        { data: null, error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];

  const batch = selectedBatchResult.data;

  const currentPublishedResult = batch
    ? await supabase
        .from("import_batches")
        .select("id,file_path,data_date")
        .eq("data_date", batch.data_date)
        .eq("status", "published")
        .maybeSingle()
    : { data: null, error: null };

  const unavailable =
    historyResult.error ||
    selectedBatchResult.error ||
    peopleResult.error ||
    accountsResult.error ||
    rowsResult.error ||
    monthPreviewResult.error;

  const todayStr = vietnamToday();
  const yesterdayStr = addDays(todayStr, -1);

  // Serialized data for Client Component
  const serializedRows = (rowsResult.data ?? []).map((r) => ({
    batch_id: r.batch_id,
    row_number: r.row_number,
    username: r.username,
    diamonds: String(r.diamonds),
    account_id: r.account_id,
  }));

  const previewsMap: Record<
    number,
    { month_before: string | null; month_after: string | null }
  > = {};
  for (const p of monthPreviewResult.data ?? []) {
    previewsMap[p.row_number] = {
      month_before: p.month_before,
      month_after: p.month_after,
    };
  }

  const idols = (peopleResult.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    username:
      accountsResult.data?.find((a) => a.idol_id === p.id)?.username ?? null,
  }));

  const accounts = (accountsResult.data ?? []).map((a) => ({
    id: a.id,
    idol_id: a.idol_id,
    username: a.username,
  }));

  const history = (historyResult.data ?? []).map((b) => ({
    id: b.id,
    data_date: b.data_date,
    file_path: b.file_path,
    file_hash: b.file_hash,
    status: b.status,
    created_at: b.created_at,
    published_at: b.published_at,
  }));

  return (
    <WorkspaceShell profile={profile}>
      <section className="page-heading">
        <div className="heading-tag">
          <span>📊</span>
          <span>SỐ LIỆU TIKTOK & ĐỐI CHIẾU</span>
        </div>
        <h1>Nhập & Đối chiếu Kim cương TikTok</h1>
        <p>
          Tải file báo cáo ngày → Hệ thống tự động nhận diện và khớp số liệu Idol
          → Rà soát các trường hợp sai lệch → Công bố lên bảng xếp hạng.
        </p>
      </section>

      {unavailable ? (
        <section className="surface" role="alert">
          <h2>Chưa tải được đầy đủ dữ liệu</h2>
          <p>
            Vui lòng kiểm tra kết nối Supabase và đảm bảo đã chạy migration SQL
            017.
          </p>
          <Link className="btn secondary" href="/admin/imports">
            Tải lại trang
          </Link>
        </section>
      ) : (
        <AdminImportClient
          batch={batch}
          rows={serializedRows}
          previews={previewsMap}
          idols={idols}
          accounts={accounts}
          currentPublished={currentPublishedResult.data}
          history={history}
          historyCount={historyResult.count ?? 0}
          currentPage={page}
          initialTab={params.tab}
          todayStr={todayStr}
          yesterdayStr={yesterdayStr}
        />
      )}
    </WorkspaceShell>
  );
}
