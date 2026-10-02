/* Private images require session cookies; skip the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo, useId, useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveHomepageOptions, saveHomepagePost } from "@/features/homepage/actions";
import { createClient } from "@/lib/supabase/client";
import { POST_LABELS, toVnInput, vnDateTime } from "@/lib/homepage";
import { ROLE_LABELS } from "@/lib/auth/routing";
import type { HomepagePost, Role } from "@/types/database";
import { SubmitButton } from "./account-forms";

// ─── Post Editor Form Component ──────────────────────────────────────────────
export function PostEditorForm({
  post,
  onSuccess,
  onCancel,
}: {
  post?: HomepagePost;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [state, action] = useActionState(saveHomepagePost, {});
  const [selectedKind, setSelectedKind] = useState<'poster' | 'announcement' | 'event'>(post?.kind ?? "announcement");
  const [selectedStatus, setSelectedStatus] = useState<'draft' | 'published' | 'archived'>(post?.status ?? "draft");
  const [titleLength, setTitleLength] = useState(post?.title?.length ?? 0);
  const [bodyLength, setBodyLength] = useState(post?.body?.length ?? 0);
  const [selectedAudience, setSelectedAudience] = useState<Role[]>(post?.audience ?? ["admin", "operator", "idol"]);
  const [imagePath, setImagePath] = useState(post?.image_path ?? "");
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const prefix = useId();

  // Handle local image preview cleanup
  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  // Handle success feedback
  useEffect(() => {
    if (state.success) {
      router.refresh();
      if (onSuccess) {
        const timer = setTimeout(() => {
          onSuccess();
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [state.success, onSuccess, router]);

  async function upload(file?: File) {
    if (!file) return;
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
    if (!extension || file.size > 10 * 1024 * 1024 || !file.size) {
      setUploadError("Chọn ảnh JPG, PNG hoặc WebP, dung lượng tối đa 10 MB.");
      return;
    }

    setUploading(true);
    setUploadError("");

    const previewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(previewUrl);

    try {
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error } = await createClient()
        .storage.from("homepage-media")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (error) throw error;
      setImagePath(path);
    } catch {
      setUploadError("Không tải được ảnh lên kho lưu trữ. Vui lòng thử lại.");
      setLocalPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  function handleAudienceToggle(role: Role) {
    setSelectedAudience(prev => {
      if (prev.includes(role)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  }

  return (
    <form action={action} className="editor-form-container">
      <input type="hidden" name="id" value={post?.id ?? ""} />
      <input type="hidden" name="revision" value={post?.revision ?? ""} />
      <input type="hidden" name="image_path" value={imagePath} />
      <input type="hidden" name="kind" value={selectedKind} />

      {/* Hidden inputs for audience to match server action form.getAll("audience") */}
      {selectedAudience.map(role => (
        <input key={role} type="hidden" name="audience" value={role} />
      ))}

      {/* Section 1: Basic Information */}
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">📌</span>
          <div>
            <h3 className="editor-section-title">Thông tin cơ bản</h3>
            <p className="editor-section-sub">Chọn phân loại bài viết, trạng thái hiển thị và nội dung</p>
          </div>
        </div>

        {/* Kind Selector Cards */}
        <div>
          <label className="filter-label" style={{ display: "block", marginBottom: 8 }}>
            Phân loại bài viết
          </label>
          <div className="kind-selector-grid">
            <button
              type="button"
              className={`kind-select-card ${selectedKind === "announcement" ? "selected" : ""}`}
              onClick={() => setSelectedKind("announcement")}
            >
              <span className="kind-select-icon">📢</span>
              <strong className="kind-select-title">Thông báo</strong>
              <span className="kind-select-desc">Tin tức, quy định, thông điệp chung</span>
            </button>

            <button
              type="button"
              className={`kind-select-card ${selectedKind === "event" ? "selected" : ""}`}
              onClick={() => setSelectedKind("event")}
            >
              <span className="kind-select-icon">📅</span>
              <strong className="kind-select-title">Sự kiện</strong>
              <span className="kind-select-desc">Lịch họp, offline, tiệc sinh nhật</span>
            </button>

            <button
              type="button"
              className={`kind-select-card ${selectedKind === "poster" ? "selected" : ""}`}
              onClick={() => setSelectedKind("poster")}
            >
              <span className="kind-select-icon">🖼️</span>
              <strong className="kind-select-title">Poster / Banner</strong>
              <span className="kind-select-desc">Hình ảnh truyền thông, vinh danh</span>
            </button>
          </div>
        </div>

        {/* Status Selector */}
        <div className="form-field">
          <div className="form-label-row">
            <span className="form-label-title">
              <span className="form-label-icon">🚦</span>
              <span>Trạng thái công bố</span>
              <span className="required-star">*</span>
            </span>
          </div>
          <input type="hidden" name="status" value={selectedStatus} />
          <div className="status-selector-grid">
            <button
              type="button"
              className={`status-select-card ${selectedStatus === "published" ? "selected published" : ""}`}
              onClick={() => setSelectedStatus("published")}
            >
              <span className="status-icon-dot">🟢</span>
              <div className="status-card-text">
                <strong className="status-card-title">Đã công bố</strong>
                <span className="status-card-desc">Hiển thị công khai theo lịch hẹn</span>
              </div>
            </button>
            <button
              type="button"
              className={`status-select-card ${selectedStatus === "draft" ? "selected draft" : ""}`}
              onClick={() => setSelectedStatus("draft")}
            >
              <span className="status-icon-dot">🟡</span>
              <div className="status-card-text">
                <strong className="status-card-title">Bản nháp</strong>
                <span className="status-card-desc">Lưu nháp, nhân sự chưa nhìn thấy</span>
              </div>
            </button>
            <button
              type="button"
              className={`status-select-card ${selectedStatus === "archived" ? "selected archived" : ""}`}
              onClick={() => setSelectedStatus("archived")}
            >
              <span className="status-icon-dot">⚪</span>
              <div className="status-card-text">
                <strong className="status-card-title">Đã ẩn / Lưu trữ</strong>
                <span className="status-card-desc">Ngừng hiển thị trên bảng tin</span>
              </div>
            </button>
          </div>
        </div>

        {/* Title Input */}
        <div className="form-field">
          <div className="form-label-row">
            <label htmlFor={`${prefix}-title`} className="form-label-title">
              <span className="form-label-icon">📝</span>
              <span>Tiêu đề bài viết</span>
              <span className="required-star">*</span>
            </label>
            <span className="char-count">{titleLength}/200 ký tự</span>
          </div>
          <div className="input-icon-group">
            <span className="input-group-icon">✍️</span>
            <input
              id={`${prefix}-title`}
              name="title"
              required
              maxLength={200}
              defaultValue={post?.title}
              onChange={e => setTitleLength(e.target.value.length)}
              placeholder="Ví dụ: Thông báo lịch họp toàn thể Idol & Vận hành tuần mới..."
              className="form-input-styled"
            />
          </div>
          <p className="field-hint">Tiêu đề ngắn gọn, súc tích, nêu bật thông điệp quan trọng nhất.</p>
        </div>

        {/* Body Textarea */}
        <div className="form-field">
          <div className="form-label-row">
            <label htmlFor={`${prefix}-body`} className="form-label-title">
              <span className="form-label-icon">📄</span>
              <span>Nội dung chi tiết bài viết</span>
            </label>
            <span className="char-count">{bodyLength}/10.000 ký tự</span>
          </div>
          <textarea
            id={`${prefix}-body`}
            name="body"
            rows={6}
            maxLength={10000}
            defaultValue={post?.body}
            onChange={e => setBodyLength(e.target.value.length)}
            placeholder="Nhập thông điệp, quy định, hướng dẫn cụ thể hoặc lời chúc gửi đến mọi người..."
            className="form-textarea-styled"
          />
          <p className="field-hint">Hỗ trợ xuống dòng tự nhiên. Nội dung sẽ được hiển thị đầy đủ trên Trang chủ.</p>
        </div>
      </section>

      {/* Section 2: Image & Link */}
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">🖼️</span>
          <div>
            <h3 className="editor-section-title">Hình ảnh & Liên kết ngoài</h3>
            <p className="editor-section-sub">Đính kèm poster hoặc liên kết tài liệu đính kèm (nếu có)</p>
          </div>
        </div>

        <div>
          <label className="form-label-title" style={{ display: "block", marginBottom: 8 }}>
            <span className="form-label-icon">🎨</span>
            <span>Ảnh poster / banner minh họa</span>
          </label>

          {imagePath ? (
            <div className="upload-preview-box">
              <img
                src={localPreviewUrl || (post?.id ? `/api/homepage/media/${post.id}` : "")}
                alt="Ảnh minh họa"
                className="upload-preview-thumb"
              />
              <div className="upload-preview-info">
                <span className="upload-preview-status">✓ Đã gắn ảnh thành công</span>
                <span className="upload-preview-hint">Ảnh sẽ hiển thị nổi bật trên thẻ bài viết tại Trang chủ</span>
              </div>
              <button
                type="button"
                className="upload-btn-remove"
                onClick={() => {
                  setImagePath("");
                  setLocalPreviewUrl(null);
                }}
              >
                ✕ Xóa ảnh khỏi bài
              </button>
            </div>
          ) : (
            <label htmlFor={`${prefix}-file-input`} className="upload-dropzone">
              <span className="upload-dropzone-icon">📤</span>
              <strong style={{ fontSize: 13, color: "var(--ink)" }}>Nhấn để tải lên ảnh mới</strong>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>Hỗ trợ JPG, PNG, WebP (Tối đa 10 MB)</span>
              <input
                id={`${prefix}-file-input`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: "none" }}
                onChange={e => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          {uploading && (
            <p style={{ fontSize: 12, color: "var(--primary-hover)", marginTop: 6, fontWeight: 600 }}>
              ⏳ Đang tải ảnh lên hệ thống...
            </p>
          )}
          {uploadError && (
            <p style={{ fontSize: 12, color: "#e11d48", marginTop: 6, fontWeight: 600 }} role="alert">
              ⚠️ {uploadError}
            </p>
          )}
        </div>

        {/* Link URL Field */}
        <div className="form-field" style={{ marginTop: 8 }}>
          <div className="form-label-row">
            <label htmlFor={`${prefix}-link`} className="form-label-title">
              <span className="form-label-icon">🔗</span>
              <span>Liên kết đính kèm ngoài (tùy chọn)</span>
            </label>
          </div>
          <div className="input-icon-group">
            <span className="input-group-icon">🌐</span>
            <input
              id={`${prefix}-link`}
              name="link_url"
              type="url"
              maxLength={2000}
              defaultValue={post?.link_url ?? ""}
              placeholder="https://docs.google.com/... hoặc liên kết nhóm, tài liệu"
              className="form-input-styled"
            />
          </div>
          <p className="field-hint">Địa chỉ HTTPS hợp lệ. Nhân sự có thể nhấn nút &quot;Xem chi tiết liên kết&quot; trên thẻ bài để mở ra.</p>
        </div>
      </section>

      {/* Section 3: Schedule & Event info */}
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">⏱️</span>
          <div>
            <h3 className="editor-section-title">
              {selectedKind === "event" ? "Thời gian diễn ra & Lịch công bố" : "Lịch công bố hiển thị"}
            </h3>
            <p className="editor-section-sub">Thời gian tính theo múi giờ Việt Nam (UTC+7)</p>
          </div>
        </div>

        {/* If Event: Highlight event dates */}
        {selectedKind === "event" && (
          <div
            style={{
              padding: "16px 18px",
              background: "#faf5ff",
              border: "1.5px solid #e9d5ff",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#7e22ce", fontWeight: 800 }}>
              <span style={{ fontSize: 16 }}>📅</span>
              <span>THỜI GIAN & ĐỊA ĐIỂM SỰ KIỆN</span>
            </div>

            <div className="form-grid-2">
              <div className="form-field">
                <label htmlFor={`${prefix}-event-start`} className="form-label-title">
                  <span>🕒 Bắt đầu sự kiện</span>
                  <span className="required-star">*</span>
                </label>
                <div className="input-icon-group">
                  <span className="input-group-icon">📅</span>
                  <input
                    id={`${prefix}-event-start`}
                    name="event_starts_at"
                    type="datetime-local"
                    defaultValue={toVnInput(post?.event_starts_at)}
                    className="form-datetime-styled"
                  />
                </div>
              </div>

              <div className="form-field">
                <label htmlFor={`${prefix}-event-end`} className="form-label-title">
                  <span>🏁 Kết thúc sự kiện</span>
                </label>
                <div className="input-icon-group">
                  <span className="input-group-icon">📅</span>
                  <input
                    id={`${prefix}-event-end`}
                    name="event_ends_at"
                    type="datetime-local"
                    defaultValue={toVnInput(post?.event_ends_at)}
                    className="form-datetime-styled"
                  />
                </div>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor={`${prefix}-location`} className="form-label-title">
                <span>📍 Địa điểm tổ chức</span>
              </label>
              <div className="input-icon-group">
                <span className="input-group-icon">🏢</span>
                <input
                  id={`${prefix}-location`}
                  name="location"
                  maxLength={300}
                  defaultValue={post?.location ?? ""}
                  placeholder="Ví dụ: Phòng họp tầng 2, Elden Media hoặc Nhà hàng..."
                  className="form-input-styled"
                />
              </div>
              <p className="field-hint">Nhập phòng họp, địa chỉ hoặc nền tảng online (Zoom, Google Meet...).</p>
            </div>
          </div>
        )}

        <div className="form-grid-2">
          <div className="form-field">
            <label htmlFor={`${prefix}-pub-from`} className="form-label-title">
              <span>⏱️ Bắt đầu hiển thị</span>
            </label>
            <div className="input-icon-group">
              <span className="input-group-icon">📅</span>
              <input
                id={`${prefix}-pub-from`}
                name="publish_from"
                type="datetime-local"
                defaultValue={toVnInput(post?.publish_from)}
                className="form-datetime-styled"
              />
            </div>
            <p className="field-hint">Để trống = Hiển thị ngay khi lưu bài.</p>
          </div>

          <div className="form-field">
            <label htmlFor={`${prefix}-pub-until`} className="form-label-title">
              <span>🛑 Ngừng hiển thị</span>
            </label>
            <div className="input-icon-group">
              <span className="input-group-icon">📅</span>
              <input
                id={`${prefix}-pub-until`}
                name="publish_until"
                type="datetime-local"
                defaultValue={toVnInput(post?.publish_until)}
                className="form-datetime-styled"
              />
            </div>
            <p className="field-hint">Để trống = Hiển thị liên tục vô thời hạn.</p>
          </div>
        </div>
      </section>

      {/* Section 4: Audience & Pinning */}
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">👥</span>
          <div>
            <h3 className="editor-section-title">Phân quyền xem & Ghim bài</h3>
            <p className="editor-section-sub">Chọn nhóm nhân sự được xem bài viết và độ ưu tiên</p>
          </div>
        </div>

        <div>
          <label className="filter-label" style={{ display: "block", marginBottom: 8 }}>
            Hiển thị cho ai? (Chọn ít nhất 1 nhóm)
          </label>
          <div className="audience-chips-wrap">
            {(["idol", "operator", "admin"] as Role[]).map(r => {
              const active = selectedAudience.includes(r);
              const icons = { idol: "🎭", operator: "🛠️", admin: "👑" };
              return (
                <button
                  key={r}
                  type="button"
                  className={`audience-chip ${active ? "active" : ""}`}
                  onClick={() => handleAudienceToggle(r)}
                >
                  <span>{icons[r]}</span>
                  <span>{ROLE_LABELS[r]}</span>
                  <span style={{ fontSize: 11 }}>{active ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="pin-toggle-card">
          <input type="checkbox" name="pinned" defaultChecked={post?.pinned} />
          <div className="pin-toggle-text">
            <span className="pin-toggle-title">📌 Ghim bài viết lên đầu bảng tin</span>
            <span className="pin-toggle-desc">
              Bài viết sẽ luôn nằm ở vị trí ưu tiên đầu danh sách tin tức trên Trang chủ
            </span>
          </div>
        </label>
      </section>

      {/* Feedback Messages */}
      <div aria-live="polite">
        {state.error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fca5a5",
              borderRadius: "var(--radius-sm)",
              color: "#b91c1c",
              fontSize: 13,
              fontWeight: 600,
            }}
            role="alert"
          >
            ⚠️ {state.error}
          </div>
        )}
        {state.success && (
          <div
            style={{
              padding: "12px 16px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: "var(--radius-sm)",
              color: "#15803d",
              fontSize: 13,
              fontWeight: 700,
            }}
            role="status"
          >
            ✓ {state.success}
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="editor-action-bar">
        {onCancel && (
          <button type="button" className="btn secondary" onClick={onCancel} disabled={uploading}>
            Đóng
          </button>
        )}
        <SubmitButton>{post ? "Lưu thay đổi bài viết" : "Tạo bài viết mới"}</SubmitButton>
      </div>
    </form>
  );
}

// ─── Post Preview Modal Component ───────────────────────────────────────────
function PostPreviewModal({
  post,
  onClose,
  onEdit,
}: {
  post: HomepagePost;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="content-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="content-modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="content-modal-head">
          <h2 className="content-modal-title">
            <span>👁️</span>
            <span>Xem trước hiển thị trên Trang chủ</span>
          </h2>
          <button type="button" className="content-modal-close" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>

        <div className="content-modal-body">
          <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
            Đây là giao diện thực tế mà nhân sự (Idol / Vận hành / Admin) sẽ nhìn thấy trên Trang chủ:
          </p>

          <article className="surface home-post-card" style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
            <div className="post-header">
              <div className="post-tags">
                {post.pinned && (
                  <span className="post-tag tag-pinned">
                    <span>📌</span> ĐÃ GHIM
                  </span>
                )}
                <span className={`post-tag tag-${post.kind}`}>{POST_LABELS[post.kind]}</span>
              </div>
              <time className="post-time" dateTime={post.publish_from}>
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
                  <span className="event-icon">🕒</span>
                  <strong>
                    {vnDateTime(post.event_starts_at)}
                    {post.event_ends_at ? ` → ${vnDateTime(post.event_ends_at)}` : ""}
                  </strong>
                </div>
                {post.location && (
                  <div className="event-loc-row">
                    <span className="event-icon">📍</span>
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
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
          </article>
        </div>

        <div className="editor-action-bar" style={{ borderRadius: "0 0 var(--radius-lg) var(--radius-lg)" }}>
          <button type="button" className="btn secondary" onClick={onClose}>
            Đóng xem trước
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              onClose();
              onEdit();
            }}
          >
            ✏️ Chỉnh sửa bài này
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Form Component (Tab 3) ─────────────────────────────────────────
function HomepageSettingsForm({ period }: { period: string }) {
  const [state, action] = useActionState(saveHomepageOptions, {});
  const [selectedPeriod, setSelectedPeriod] = useState(period);

  return (
    <form action={action} className="editor-form-container">
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">💎</span>
          <div>
            <h3 className="editor-section-title">Kỳ xếp hạng kim cương (Ranking)</h3>
            <p className="editor-section-sub">
              Thiết lập chu kỳ tính tổng kim cương hiển thị trên bảng vinh danh Trang chủ
            </p>
          </div>
        </div>

        <div className="settings-period-options">
          <label className={`settings-period-card ${selectedPeriod === "month" ? "active" : ""}`}>
            <input
              type="radio"
              name="ranking"
              value="month"
              checked={selectedPeriod === "month"}
              onChange={() => setSelectedPeriod("month")}
            />
            <div className="period-card-content">
              <span className="period-card-title">
                <span>🗓️ Theo tháng này</span>
                <span className="badge-recommended">Khuyên dùng</span>
              </span>
              <span className="period-card-desc">
                Cộng dồn sản lượng kim cương từng ngày của các Idol trong tháng hiện tại. Reset bảng xếp hạng khi sang tháng mới để tạo động lực thi đua liên tục.
              </span>
            </div>
          </label>

          <label className={`settings-period-card ${selectedPeriod === "week" ? "active" : ""}`}>
            <input
              type="radio"
              name="ranking"
              value="week"
              checked={selectedPeriod === "week"}
              onChange={() => setSelectedPeriod("week")}
            />
            <div className="period-card-content">
              <span className="period-card-title">📆 Theo tuần này</span>
              <span className="period-card-desc">
                Tính tổng kim cương từ thứ Hai đến Chủ Nhật của tuần hiện tại. Phù hợp với các chiến dịch chạy nước rút theo tuần.
              </span>
            </div>
          </label>

          <label className={`settings-period-card ${selectedPeriod === "day" ? "active" : ""}`}>
            <input
              type="radio"
              name="ranking"
              value="day"
              checked={selectedPeriod === "day"}
              onChange={() => setSelectedPeriod("day")}
            />
            <div className="period-card-content">
              <span className="period-card-title">📅 Theo hôm nay</span>
              <span className="period-card-desc">
                Chỉ hiển thị thành tích của ngày gần nhất có dữ liệu đối soát.
              </span>
            </div>
          </label>
        </div>

        <div
          style={{
            padding: "14px 16px",
            background: "var(--surface-ocean)",
            border: "1px solid var(--line-ocean)",
            borderRadius: "var(--radius-sm)",
            fontSize: 12,
            color: "var(--ink-secondary)",
            lineHeight: 1.6,
          }}
        >
          <strong>💡 Phân quyền hiển thị:</strong> Idol xem thứ hạng vị trí trên Bảng vinh danh; Vận hành và Admin xem thêm tổng kim cương cụ thể sau khi đối soát file TikTok.
        </div>

        <div aria-live="polite">
          {state.error && <p style={{ color: "#e11d48", fontWeight: 600, fontSize: 13 }}>⚠️ {state.error}</p>}
          {state.success && <p style={{ color: "#15803d", fontWeight: 700, fontSize: 13 }}>✓ {state.success}</p>}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <SubmitButton>Lưu cấu hình kỳ ranking</SubmitButton>
        </div>
      </section>

      {/* Birthday Reminders Info Card */}
      <section className="editor-section-card">
        <div className="editor-section-head">
          <span className="section-icon">🎂</span>
          <div>
            <h3 className="editor-section-title">Cơ chế nhắc sinh nhật tự động</h3>
            <p className="editor-section-sub">Tự động kết nối hồ sơ nhân sự và gửi lời chúc</p>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "var(--ink-secondary)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎈</span>
            <div>
              <strong>Hiển thị tại Trang chủ:</strong> Thành viên có ngày sinh nhật trong ngày sẽ tự động được hiển thị trên thanh bên Trang chủ để đồng nghiệp chúc mừng.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🔔</span>
            <div>
              <strong>Thông báo sớm 3 ngày:</strong> Hệ thống tự động gửi thông báo đến toàn bộ Idol, Vận hành và Admin trước 3 ngày để chuẩn bị tiệc hoặc gửi lời chúc.
            </div>
          </div>
        </div>
      </section>
    </form>
  );
}

// ─── Main Admin Content Client Component ─────────────────────────────────────
export function AdminContentClient({
  posts,
  initialPeriod,
}: {
  posts: HomepagePost[];
  initialPeriod: string;
}) {
  const [activeTab, setActiveTab] = useState<"posts" | "create" | "settings">("posts");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | "announcement" | "event" | "poster">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft" | "archived">("all");
  const [onlyPinned, setOnlyPinned] = useState(false);

  // Modals state
  const [editingPost, setEditingPost] = useState<HomepagePost | null>(null);
  const [previewingPost, setPreviewingPost] = useState<HomepagePost | null>(null);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);

  // KPIs
  const totalCount = posts.length;
  const publishedCount = posts.filter(p => p.status === "published").length;
  const draftCount = posts.filter(p => p.status === "draft").length;
  const pinnedCount = posts.filter(p => p.pinned).length;

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      // Kind filter
      if (filterKind !== "all" && p.kind !== filterKind) return false;
      // Status filter
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      // Pinned filter
      if (onlyPinned && !p.pinned) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchBody = p.body?.toLowerCase().includes(q);
        const matchLocation = p.location?.toLowerCase().includes(q);
        if (!matchTitle && !matchBody && !matchLocation) return false;
      }
      return true;
    });
  }, [posts, filterKind, filterStatus, onlyPinned, searchQuery]);

  const tabs = [
    { key: "posts", label: "Danh sách bài viết", icon: "📋", count: totalCount },
    { key: "create", label: "Soạn bài mới", icon: "➕" },
    { key: "settings", label: "Cấu hình hiển thị", icon: "⚙️" },
  ];

  return (
    <div className="admin-content-workspace">
      {/* Top Header Row with Back link */}
      <div className="content-header-top">
        <Link href="/home" className="content-back-link">
          <span>←</span>
          <span>Xem Bảng tin trên Trang chủ</span>
        </Link>
      </div>

      {/* KPI Cards Strip */}
      <div className="content-kpi-grid">
        <article className="content-kpi-card">
          <div className="kpi-icon-wrap blue">
            <span>📰</span>
          </div>
          <div className="kpi-text">
            <span className="kpi-value">{totalCount}</span>
            <span className="kpi-label">Tổng bài viết</span>
          </div>
        </article>

        <article className="content-kpi-card">
          <div className="kpi-icon-wrap green">
            <span>🟢</span>
          </div>
          <div className="kpi-text">
            <span className="kpi-value">{publishedCount}</span>
            <span className="kpi-label">Đang hiển thị</span>
          </div>
        </article>

        <article className="content-kpi-card">
          <div className="kpi-icon-wrap amber">
            <span>📝</span>
          </div>
          <div className="kpi-text">
            <span className="kpi-value">{draftCount}</span>
            <span className="kpi-label">Bản nháp</span>
          </div>
        </article>

        <article className="content-kpi-card">
          <div className="kpi-icon-wrap purple">
            <span>📌</span>
          </div>
          <div className="kpi-text">
            <span className="kpi-value">{pinnedCount}</span>
            <span className="kpi-label">Đang ghim đầu</span>
          </div>
        </article>
      </div>

      {/* Main Tab Strip */}
      <nav className="schedule-tab-strip" aria-label="Quản lý bảng tin">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`schedule-tab-btn ${activeTab === t.key ? "tab-active" : ""}`}
            onClick={() => setActiveTab(t.key as "posts" | "create" | "settings")}
            aria-pressed={activeTab === t.key}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.count !== undefined && <span className="tab-count-badge">{t.count}</span>}
          </button>
        ))}
      </nav>

      {/* ── TAB 1: DANH SÁCH BÀI VIẾT ── */}
      {activeTab === "posts" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Toolbar */}
          <div className="content-toolbar">
            <div className="content-toolbar-row1">
              <div className="content-search-wrap">
                <span className="content-search-icon">🔍</span>
                <input
                  type="search"
                  className="content-search-input"
                  placeholder="Tìm bài viết theo tiêu đề, nội dung, địa điểm..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="content-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="Xóa tìm kiếm"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="content-toolbar-actions">
                <button
                  type="button"
                  className={`filter-pill ${onlyPinned ? "active" : ""}`}
                  onClick={() => setOnlyPinned(p => !p)}
                >
                  <span>📌</span>
                  <span>Chỉ bài ghim</span>
                </button>

                <button
                  type="button"
                  className="btn primary btn-compact"
                  onClick={() => setActiveTab("create")}
                >
                  <span>+ Soạn bài mới</span>
                </button>
              </div>
            </div>

            {/* Filter Bar: Kinds & Statuses */}
            <div className="content-filter-bar">
              <div className="filter-group">
                <span className="filter-label">Loại bài:</span>
                <button
                  type="button"
                  className={`filter-pill ${filterKind === "all" ? "active" : ""}`}
                  onClick={() => setFilterKind("all")}
                >
                  Tất cả <span className="filter-count">{posts.length}</span>
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterKind === "announcement" ? "active" : ""}`}
                  onClick={() => setFilterKind("announcement")}
                >
                  📢 Thông báo{" "}
                  <span className="filter-count">
                    {posts.filter(p => p.kind === "announcement").length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterKind === "event" ? "active" : ""}`}
                  onClick={() => setFilterKind("event")}
                >
                  📅 Sự kiện{" "}
                  <span className="filter-count">
                    {posts.filter(p => p.kind === "event").length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterKind === "poster" ? "active" : ""}`}
                  onClick={() => setFilterKind("poster")}
                >
                  🖼️ Poster{" "}
                  <span className="filter-count">
                    {posts.filter(p => p.kind === "poster").length}
                  </span>
                </button>
              </div>

              <div className="filter-group">
                <span className="filter-label">Trạng thái:</span>
                <button
                  type="button"
                  className={`filter-pill ${filterStatus === "all" ? "active" : ""}`}
                  onClick={() => setFilterStatus("all")}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterStatus === "published" ? "active" : ""}`}
                  onClick={() => setFilterStatus("published")}
                >
                  🟢 Đã công bố
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterStatus === "draft" ? "active" : ""}`}
                  onClick={() => setFilterStatus("draft")}
                >
                  🟡 Bản nháp
                </button>
                <button
                  type="button"
                  className={`filter-pill ${filterStatus === "archived" ? "active" : ""}`}
                  onClick={() => setFilterStatus("archived")}
                >
                  ⚪ Đã ẩn
                </button>
              </div>
            </div>
          </div>

          {/* Posts List */}
          {filteredPosts.length === 0 ? (
            <div className="content-empty-state">
              <span className="content-empty-icon">📰</span>
              <h3 className="content-empty-title">Không tìm thấy bài viết nào</h3>
              <p className="content-empty-sub">
                {searchQuery || filterKind !== "all" || filterStatus !== "all" || onlyPinned
                  ? "Thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các bộ lọc đang chọn."
                  : "Chưa có bài viết nào được tạo. Nhấn '+ Soạn bài mới' để đăng thông báo đầu tiên."}
              </p>
              {(searchQuery || filterKind !== "all" || filterStatus !== "all" || onlyPinned) && (
                <button
                  type="button"
                  className="btn secondary btn-compact"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterKind("all");
                    setFilterStatus("all");
                    setOnlyPinned(false);
                  }}
                  style={{ marginTop: 8 }}
                >
                  Xóa tất cả bộ lọc
                </button>
              )}
            </div>
          ) : (
            <div className="content-post-list">
              {filteredPosts.map(post => {
                const kindIcons = { announcement: "📢", event: "📅", poster: "🖼️" };
                const statusLabels = {
                  published: "🟢 Đã công bố",
                  draft: "🟡 Bản nháp",
                  archived: "⚪ Đã ẩn",
                };

                return (
                  <article
                    key={`${post.id}:${post.revision}`}
                    className={`content-item-card ${post.pinned ? "is-pinned" : ""} is-${post.status}`}
                  >
                    {/* Thumbnail Column */}
                    <div
                      className="item-thumb-col"
                      onClick={() => {
                        if (post.image_path) {
                          setZoomedImageUrl(`/api/homepage/media/${post.id}`);
                        }
                      }}
                      title={post.image_path ? "Nhấn để phóng to ảnh" : ""}
                    >
                      {post.image_path ? (
                        <>
                          <img
                            src={`/api/homepage/media/${post.id}`}
                            alt={post.title}
                            className="item-thumb-img"
                            loading="lazy"
                          />
                          <div className="thumb-zoom-overlay">
                            <span>🔍 Phóng to</span>
                          </div>
                        </>
                      ) : (
                        <div className="item-thumb-placeholder">
                          <span className="placeholder-icon">{kindIcons[post.kind]}</span>
                          <span className="placeholder-label">{POST_LABELS[post.kind]}</span>
                        </div>
                      )}
                    </div>

                    {/* Main Information Column */}
                    <div className="item-main-col">
                      <div className="item-badge-row">
                        <span className={`badge-status ${post.status}`}>
                          {statusLabels[post.status]}
                        </span>
                        <span className={`badge-kind ${post.kind}`}>
                          {kindIcons[post.kind]} {POST_LABELS[post.kind]}
                        </span>
                        {post.pinned && (
                          <span className="badge-pinned">
                            <span>📌</span> Đã ghim
                          </span>
                        )}
                        <span className="badge-audience">
                          👥 {post.audience.map(r => ROLE_LABELS[r]).join(", ")}
                        </span>
                      </div>

                      <h3 className="item-title">{post.title}</h3>

                      {post.body && <p className="item-body-preview">{post.body}</p>}

                      <div className="item-meta-row">
                        {post.kind === "event" && post.event_starts_at && (
                          <span className="item-meta-entry">
                            <span>📅 Diễn ra:</span>
                            <strong>
                              {vnDateTime(post.event_starts_at)}
                              {post.event_ends_at ? ` → ${vnDateTime(post.event_ends_at)}` : ""}
                            </strong>
                          </span>
                        )}
                        {post.location && (
                          <span className="item-meta-entry">
                            <span>📍 Địa điểm:</span>
                            <span>{post.location}</span>
                          </span>
                        )}
                        <span className="item-meta-entry">
                          <span>⏱️ Lịch hiển thị:</span>
                          <span>
                            {vnDateTime(post.publish_from)}
                            {post.publish_until ? ` → ${vnDateTime(post.publish_until)}` : " (Vô thời hạn)"}
                          </span>
                        </span>
                        <span className="item-meta-entry">
                          <span>🕒 Sửa lần cuối:</span>
                          <span>{vnDateTime(post.updated_at)}</span>
                        </span>
                        {post.link_url && (
                          <span className="item-meta-entry" style={{ color: "var(--primary-hover)" }}>
                            <span>🔗 Có link</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions Column */}
                    <div className="item-actions-col">
                      <button
                        type="button"
                        className="action-btn-edit"
                        onClick={() => setEditingPost(post)}
                      >
                        <span>✏️ Chỉnh sửa</span>
                      </button>
                      <button
                        type="button"
                        className="action-btn-preview"
                        onClick={() => setPreviewingPost(post)}
                      >
                        <span>👁️ Xem trước</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: SOẠN BÀI MỚI ── */}
      {activeTab === "create" && (
        <div style={{ maxWidth: 840, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px", color: "var(--ink)" }}>
              Soạn thảo bài viết mới
            </h2>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
              Điền các thông tin để thông báo đến Idol, Vận hành hoặc toàn thể công ty
            </p>
          </div>
          <PostEditorForm
            onSuccess={() => {
              setActiveTab("posts");
            }}
            onCancel={() => setActiveTab("posts")}
          />
        </div>
      )}

      {/* ── TAB 3: CẤU HÌNH HIỂN THỊ ── */}
      {activeTab === "settings" && (
        <div className="content-settings-grid">
          <HomepageSettingsForm period={initialPeriod} />
        </div>
      )}

      {/* ── EDIT POST MODAL ── */}
      {editingPost && (
        <div
          className="content-modal-backdrop"
          onClick={() => setEditingPost(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="content-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="content-modal-head">
              <h2 className="content-modal-title">
                <span>✏️</span>
                <span>Chỉnh sửa bài viết</span>
              </h2>
              <button
                type="button"
                className="content-modal-close"
                onClick={() => setEditingPost(null)}
                aria-label="Đóng modal"
              >
                ✕
              </button>
            </div>
            <div className="content-modal-body">
              <PostEditorForm
                post={editingPost}
                onSuccess={() => {
                  setEditingPost(null);
                }}
                onCancel={() => setEditingPost(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── PREVIEW POST MODAL ── */}
      {previewingPost && (
        <PostPreviewModal
          post={previewingPost}
          onClose={() => setPreviewingPost(null)}
          onEdit={() => {
            const p = previewingPost;
            setPreviewingPost(null);
            setEditingPost(p);
          }}
        />
      )}

      {/* ── IMAGE ZOOM MODAL ── */}
      {zoomedImageUrl && (
        <div
          className="content-modal-backdrop"
          onClick={() => setZoomedImageUrl(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              className="content-modal-close"
              style={{
                position: "absolute",
                top: -36,
                right: 0,
                color: "#ffffff",
                background: "rgba(0,0,0,0.5)",
                borderRadius: "50%",
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
              }}
              onClick={() => setZoomedImageUrl(null)}
              aria-label="Đóng"
            >
              ✕
            </button>
            <img
              src={zoomedImageUrl}
              alt="Phóng to poster"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                objectFit: "contain",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
