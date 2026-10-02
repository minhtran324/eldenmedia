"use client";
import { useRouter } from "next/navigation";
import { useActionState, useId, useState } from "react";
import { saveHomepageOptions, saveHomepagePost } from "@/features/homepage/actions";
import { createClient } from "@/lib/supabase/client";
import { PERIOD_LABELS, POST_LABELS, toVnInput } from "@/lib/homepage";
import { ROLE_LABELS } from "@/lib/auth/routing";
import type { HomepagePost, Role } from "@/types/database";
import { SubmitButton } from "./account-forms";

export function HomepageOptions({ period }: { period: string }) {
  const [state, action] = useActionState(saveHomepageOptions, {});
  return <form action={action} className="stack-form"><label>Kỳ ranking<select name="ranking" defaultValue={period}>{Object.entries(PERIOD_LABELS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><p className="hint">Chọn Tháng này để cộng kim cương từng ngày trong tháng. Idol chỉ xem thứ hạng trên bảng tin; Vận hành và Admin xem thêm tổng kim cương. Sinh nhật trong ngày hiển thị trên trang chủ; nhắc trước 3 ngày đến tất cả Idol, Vận hành và Admin khi Cron đã được bật.</p><div aria-live="polite">{state.error && <p role="alert">{state.error}</p>}{state.success && <p>{state.success}</p>}</div><SubmitButton>Lưu cấu hình</SubmitButton></form>;
}

export function HomepagePostForm({ post }: { post?: HomepagePost }) {
  const router = useRouter();
  const [state, action] = useActionState(saveHomepagePost, {});
  const [imagePath, setImagePath] = useState(post?.image_path ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const prefix = useId();
  async function upload(file?: File) {
    if (!file) return;
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    if (!extension || file.size > 10 * 1024 * 1024 || !file.size) { setUploadError("Chọn ảnh JPG, PNG hoặc WebP, tối đa 10 MB."); return; }
    setUploading(true); setUploadError("");
    try {
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await createClient().storage.from("homepage-media").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      setImagePath(path);
    } catch { setUploadError("Không tải được ảnh. Kiểm tra mạng và quyền Admin rồi thử lại."); }
    finally { setUploading(false); }
  }
  if (state.success) return <div role="status"><p>{state.success}</p><button className="btn secondary" type="button" onClick={() => router.push("/home")}>Xem trang chủ</button></div>;
  return <form action={action} className="stack-form"><input type="hidden" name="id" value={post?.id ?? ""} /><input type="hidden" name="revision" value={post?.revision ?? ""} /><input type="hidden" name="image_path" value={imagePath} />
    <fieldset disabled={uploading} className="content-fields"><div className="form-grid">
      <label>Loại nội dung<select name="kind" defaultValue={post?.kind ?? "announcement"}>{Object.entries(POST_LABELS).map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select></label>
      <label>Trạng thái<select name="status" defaultValue={post?.status ?? "draft"}><option value="draft">Bản nháp</option><option value="published">Công bố theo thời gian bên dưới</option><option value="archived">Ẩn / lưu trữ</option></select></label>
    </div><label>Tiêu đề<input name="title" required maxLength={200} defaultValue={post?.title} /></label><label>Nội dung<textarea name="body" rows={5} maxLength={10000} defaultValue={post?.body} /></label>
    <label htmlFor={`${prefix}-image`}>Ảnh poster / minh họa (tối đa 10 MB)</label><input id={`${prefix}-image`} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
    {imagePath && <p className="hint">Đã có ảnh. <button type="button" onClick={() => setImagePath("")}>Bỏ ảnh khỏi bài</button></p>}
    <label>Liên kết HTTPS (không bắt buộc)<input name="link_url" type="url" maxLength={2000} defaultValue={post?.link_url ?? ""} /></label>
    <p className="hint">Tất cả thời gian bên dưới theo giờ Việt Nam. Để trống bắt đầu công bố = ngay khi lưu.</p>
    <div className="form-grid">{[["publish_from", "Bắt đầu công bố"], ["publish_until", "Ngừng hiển thị"], ["event_starts_at", "Bắt đầu sự kiện"], ["event_ends_at", "Kết thúc sự kiện"]].map(([name, label]) => <label key={name}>{label}<input name={name} type="datetime-local" defaultValue={toVnInput(post?.[name as "publish_from"])} /></label>)}</div>
    <label>Địa điểm sự kiện<input name="location" maxLength={300} defaultValue={post?.location ?? ""} /></label>
    <fieldset><legend>Hiển thị cho</legend><div className="content-checks">{(["admin", "operator", "idol"] as Role[]).map(role => <label key={role}><input type="checkbox" name="audience" value={role} defaultChecked={post ? post.audience.includes(role) : true} />{ROLE_LABELS[role]}</label>)}</div></fieldset>
    <label className="content-checks"><input type="checkbox" name="pinned" defaultChecked={post?.pinned} />Ghim bài lên đầu</label>
    <SubmitButton>{post ? "Lưu thay đổi" : "Tạo nội dung"}</SubmitButton></fieldset>
    <div aria-live="polite">{uploading && <p>Đang tải ảnh…</p>}{uploadError && <p role="alert">{uploadError}</p>}{state.error && <p role="alert">{state.error}</p>}</div>
  </form>;
}
