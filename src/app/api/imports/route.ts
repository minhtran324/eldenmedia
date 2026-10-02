import { createHash } from "node:crypto";
import { requireActive } from "@/lib/auth/server";
import { MAX_IMPORT_BYTES, parseTikTokImport } from "@/lib/tiktok-import";
import { appOrigin } from "@/lib/auth/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { supabase } = await requireActive("admin");
  const respond = (body: unknown, status = 200) =>
    Response.json(body, {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });

  if (request.headers.get("origin") !== appOrigin()) {
    return respond(
      { error: "Địa chỉ gửi yêu cầu không hợp lệ. Mở web qua APP_URL đã cấu hình." },
      403
    );
  }
  if (Number(request.headers.get("content-length")) > MAX_IMPORT_BYTES + 65536) {
    return respond({ error: "File tối đa 3 MB." }, 413);
  }

  try {
    const reader = request.body?.getReader();
    if (!reader) return respond({ error: "Chưa chọn file." }, 400);

    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_IMPORT_BYTES + 65536) {
        await reader.cancel();
        return respond({ error: "File tối đa 3 MB." }, 413);
      }
      chunks.push(next.value);
    }

    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();

    const file = form.get("file");
    const day = String(form.get("day") ?? "");

    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
      return respond({ error: "Chọn file .xlsx xuất từ TikTok." }, 400);
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day
    ) {
      return respond({ error: "Chọn ngày số liệu hợp lệ." }, 400);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await parseTikTokImport(bytes);
    if (parsed.issues.length) {
      return respond(
        {
          error: "File có lỗi; chưa lưu dữ liệu. Sửa các dòng sau rồi tải lại.",
          issues: parsed.issues,
        },
        422
      );
    }

    // ── Only extract data for Idols who have active accounts in the system ──
    // Creators in the Excel file that do not exist in the system are bypassed completely.
    const { data: accounts, error: accError } = await supabase
      .from("platform_accounts")
      .select("id, username, idol_id, profiles!inner(id, role, status)")
      .eq("profiles.role", "idol")
      .eq("profiles.status", "active");

    if (accError) {
      return respond(
        { error: "Chưa đọc được danh sách Idol từ hệ thống. Thử lại sau." },
        500
      );
    }

    const activeUsernames = new Set(
      (accounts ?? [])
        .map((a) => a.username?.trim().toLowerCase())
        .filter(Boolean) as string[]
    );

    const matchedEntries = parsed.entries.filter((e) =>
      activeUsernames.has(e.username)
    );
    const ignoredCount = parsed.entries.length - matchedEntries.length;

    if (matchedEntries.length === 0) {
      return respond(
        {
          error: `Không tìm thấy Idol nào trong hệ thống khớp với file Excel (đã quét ${parsed.entries.length} tài khoản trong file). Vui lòng kiểm tra lại username TikTok của các Idol trên hệ thống.`,
        },
        400
      );
    }

    const { data, error } = await supabase.rpc("stage_diamond_import", {
      day,
      filename: file.name.slice(0, 255),
      digest: createHash("sha256").update(bytes).digest("hex"),
      entries: matchedEntries,
    });

    if (error) {
      return respond(
        {
          error: error.message.includes("INVALID_DATE")
            ? "Ngày số liệu không được nằm trong tương lai."
            : "Chưa lưu được bản xem trước. Kiểm tra SQL 013 và thử lại.",
        },
        400
      );
    }

    return respond({
      id: data,
      total_in_file: parsed.entries.length,
      matched_count: matchedEntries.length,
      ignored_count: ignoredCount,
    });
  } catch (error) {
    return respond(
      {
        error:
          error instanceof Error && !error.message.includes("zip")
            ? error.message.slice(0, 250)
            : "Không đọc được file Excel. Xuất lại file .xlsx rồi thử lại.",
      },
      400
    );
  }
}
