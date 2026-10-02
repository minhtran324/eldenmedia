"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { choosePersonalDevice } from "@/features/operations/actions";
import { entryState, nextIdolTurn, lateMinutes, type OperationRow, type OpenDevice } from "@/lib/operations-flow";
import { LiveCamera, type CameraOperation } from "./live-camera";
import { useOnlineStatus } from "./pwa-provider";

const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Ho_Chi_Minh",
      })
    : "Chờ phòng";

export function IdolCheckinFlow({
  rows,
  device,
  serverNow,
}: {
  rows: OperationRow[];
  device: OpenDevice | null;
  serverNow: number;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [now, setNow] = useState(serverNow);
  const [camera, setCamera] = useState<CameraOperation | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const turn = nextIdolTurn(rows);

  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setNow(serverNow + Date.now() - started), 1000);
    const refresh = () => {
      if (!document.hidden && navigator.onLine) router.refresh();
    };
    const poll = setInterval(refresh, 15000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("notifications-changed", refresh);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("notifications-changed", refresh);
    };
  }, [router, serverNow]);

  const state = turn ? entryState(turn, now) : "completed";
  const inRoom = turn?.status === "in_room";
  const ownDevice = turn?.device_choice === "own";
  const correctLoan = Boolean(device && turn?.visit_id && device.room_visit_id === turn.visit_id);
  const step = !inRoom ? 1 : ownDevice || correctLoan || turn?.device_choice === "company" ? 3 : 2;
  const late = turn
    ? inRoom
      ? lateMinutes(turn.late_seconds)
      : turn.entry_due_at
      ? lateMinutes((now - new Date(turn.entry_due_at).getTime()) / 1000)
      : 0
    : 0;
  const remain = turn?.entry_due_at
    ? Math.max(0, Math.ceil((new Date(turn.entry_due_at).getTime() - now) / 1000))
    : 0;

  function complete(text: string) {
    setMessage(text);
    setCamera(null);
    setError("");
    if (camera === "checkout") setLeaving(false);
    router.refresh();
  }

  async function personal() {
    if (!turn) return;
    setBusy(true);
    setError("");
    try {
      const result = await choosePersonalDevice(turn.segment_id);
      if (result.error) setError(result.error);
      else complete(result.success ?? "Đã ghi nhận sử dụng máy cá nhân.");
    } catch {
      setError("Chưa kết nối được máy chủ. Thử lại sau khi có mạng.");
    } finally {
      setBusy(false);
    }
  }

  // ── CASE 1: No active turn & no device held ──
  if (!turn && !device) {
    const isCompletelyEmpty = rows.length === 0;
    const isAllDone = rows.length > 0 && rows.every((r) => r.status === "completed" || r.status === "skipped");

    return (
      <section className="surface idol-checkin-empty-card" aria-label="Trạng thái ca hôm nay">
        {isCompletelyEmpty ? (
          <div className="empty-shift-content">
            <div className="empty-shift-icon">☕</div>
            <span className="empty-shift-badge">HÔM NAY KHÔNG CÓ LỊCH LIVE</span>
            <h2 className="empty-shift-title">Hôm nay bạn không có ca live</h2>
            <p className="empty-shift-desc">
              Bạn chưa có ca phát sóng nào được xếp hôm nay. Bạn có thể xem lịch cả tuần hoặc đăng ký thêm ca mới.
            </p>
            <div className="empty-shift-actions">
              <Link href="/idol/schedule" className="btn btn-compact">
                📅 Xem lịch tuần của bạn
              </Link>
              <Link href="/idol/schedule?tab=register" className="btn secondary btn-compact">
                ✏️ Đăng ký ca live mới
              </Link>
            </div>
          </div>
        ) : isAllDone ? (
          <div className="empty-shift-content all-done">
            <div className="empty-shift-icon">🎉</div>
            <span className="empty-shift-badge done">HOÀN TẤT CA HÔM NAY</span>
            <h2 className="empty-shift-title">Đã hoàn thành các ca live hôm nay!</h2>
            <p className="empty-shift-desc">
              Tất cả {rows.filter((r) => r.status === "completed").length} ca live trong ngày đã được checkout thành công. Thiết bị đã được hoàn trả.
            </p>
            <div className="empty-shift-actions">
              <Link href="/idol/schedule" className="btn secondary btn-compact">
                Xem lịch tuần tới →
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty-shift-content">
            <div className="empty-shift-icon">✅</div>
            <h2 className="empty-shift-title">Đã xử lý các lượt phòng</h2>
            <p className="empty-shift-desc">
              Không còn lượt phòng nào đang chờ hoặc đang sử dụng. Chi tiết xem ở mục Lịch sử bên dưới.
            </p>
          </div>
        )}
      </section>
    );
  }

  // ── CASE 2: Active turn or held device ──
  return (
    <section className="surface idol-checkin-active-surface" aria-label="Tiến trình ca của tôi">
      {/* Turn Header Card */}
      <div className="idol-turn-hero">
        <div className="turn-hero-top">
          <span className="hero-tag">CA HIỆN TẠI</span>
          {turn && <span className="hero-date">🗓️ Ngày {turn.work_date}</span>}
        </div>

        <div className="turn-hero-main">
          {turn ? (
            <>
              <div className="hero-room-title">
                <span className="hero-room-icon">🏢</span>
                <h2>Phòng {turn.room_code}</h2>
              </div>
              <div className="hero-hours-pill">
                🕒 {time(turn.scheduled_start)} — {time(turn.scheduled_end)}
              </div>
            </>
          ) : (
            <h2>Đang giữ thiết bị công ty</h2>
          )}
        </div>
      </div>

      {/* 3-Step Visual Progress Bar */}
      {turn && (
        <div className="idol-flow-steps-mobile" aria-label="3 bước vào ca">
          {[
            { num: 1, label: "Check-in phòng" },
            { num: 2, label: "Nhận thiết bị" },
            { num: 3, label: "Trong ca / Ra phòng" },
          ].map(({ num, label }) => {
            const isDone = step > num;
            const isCurrent = step === num;
            return (
              <div
                key={num}
                className={`step-item ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""}`}
              >
                <div className="step-circle">{isDone ? "✓" : num}</div>
                <span className="step-label">{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Entry Deadline or Warning Alert */}
      {turn && !inRoom && (
        <div
          className={`idol-entry-alert ${state === "overdue" ? "is-overdue" : state === "ready" ? "is-ready" : "is-blocked"}`}
          aria-live="polite"
        >
          {state === "blocked" ? (
            <div className="alert-content">
              <span className="alert-icon">⏳</span>
              <div>
                <strong>Chờ phòng sẵn sàng</strong>
                <p>Đang chờ lượt trước checkout hoặc Vận hành chuẩn bị phòng. Bạn chưa bị tính trễ giờ.</p>
              </div>
            </div>
          ) : state === "early" ? (
            <div className="alert-content">
              <span className="alert-icon">🕒</span>
              <div>
                <strong>Chưa đến giờ check-in</strong>
                <p>Có thể quét QR vào sớm tối đa 30 phút khi phòng trống và đến lượt của bạn.</p>
              </div>
            </div>
          ) : (
            <div className="alert-content">
              <span className="alert-icon">{state === "overdue" ? "⚠️" : "⏰"}</span>
              <div>
                <strong>Hạn check-in: {time(turn.entry_due_at)}</strong>
                <p>
                  {late ? (
                    <span className="text-danger font-bold">Bạn đang trễ {late} phút! Vui lòng quét QR ngay.</span>
                  ) : (
                    <span>Thời gian còn lại: <strong>{Math.floor(remain / 60)} phút {remain % 60} giây</strong></span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {inRoom && late > 0 && (
        <div className="idol-entry-alert is-overdue" role="alert">
          <div className="alert-content">
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>Ghi nhận vi phạm: Check-in trễ {late} phút</strong>
              <p>Hệ thống đã lưu vào nhật ký và thông báo cho Vận hành phụ trách.</p>
            </div>
          </div>
        </div>
      )}

      {/* Held Device Notice */}
      {device && (
        <div className="idol-held-device-box">
          <span className="device-icon">📱</span>
          <div className="device-info">
            <span>Thiết bị đang giữ:</span>
            <strong>{device.device_code}</strong>
          </div>
          {!correctLoan && inRoom && (
            <span className="device-warning">
              (Máy từ lượt trước, cần trả trước khi nhận máy phòng này)
            </span>
          )}
        </div>
      )}

      {/* Feedback Messages */}
      {message && <p className="feedback success" role="status">{message}</p>}
      {error && <p className="feedback error" role="alert">{error}</p>}
      {!online && (
        <p className="feedback error">⚠️ Đang mất kết nối mạng. Hãy kết nối lại để quét QR.</p>
      )}

      {/* Action Buttons (Large, Mobile-friendly Touch Targets) */}
      {!camera ? (
        <div className="idol-action-buttons-mobile">
          {/* STEP 1: Checkin */}
          {turn && !inRoom && (
            <button
              type="button"
              className="btn btn-large w-full idol-btn-primary"
              disabled={!online || !["ready", "overdue"].includes(state)}
              onClick={() => setCamera("checkin")}
            >
              📸 Bước 1: Quét QR Check-in phòng
            </button>
          )}

          {/* STEP 2: Device */}
          {inRoom && !leaving && step === 2 && (
            <>
              {turn.pending_device_request && (
                <div className="pending-device-alert">
                  ⏳ Đang chờ chủ máy duyệt thiết bị <strong>{turn.requested_device_code}</strong>.
                </div>
              )}
              <button
                type="button"
                className="btn btn-large w-full idol-btn-primary"
                disabled={!online || Boolean(device)}
                onClick={() => setCamera("receive")}
              >
                📱 Bước 2: Quét QR nhận máy
              </button>
              <button
                type="button"
                className="btn secondary btn-large w-full"
                disabled={!online || busy || Boolean(device)}
                onClick={() => void personal()}
              >
                Không dùng máy công ty
              </button>
              <button
                type="button"
                className="btn secondary btn-compact w-full text-danger"
                disabled={!online}
                onClick={() => {
                  setLeaving(true);
                  setCamera("checkout");
                }}
              >
                Trả phòng / Hủy ca sớm
              </button>
            </>
          )}

          {/* STEP 3: Live in room & Checkout */}
          {inRoom && !leaving && step === 3 && (
            <>
              <div className="in-session-status">
                <span className="live-indicator-dot" />
                <p>
                  {ownDevice
                    ? "Đang live trong ca (Dùng máy cá nhân)."
                    : device
                    ? `Đang live trong ca (Máy: ${device.device_code}).`
                    : "Đã trả máy. Tiến hành bước trả phòng."}
                </p>
              </div>

              <button
                type="button"
                className="btn btn-large w-full checkout-hero-btn"
                disabled={!online}
                onClick={() => {
                  setLeaving(true);
                  setCamera(device ? "return" : "checkout");
                }}
              >
                🏁 Hoàn thành ca / Checkout
              </button>

              <div className="step-secondary-actions">
                {device && (
                  <button
                    type="button"
                    className="btn secondary btn-compact"
                    disabled={!online}
                    onClick={() => setCamera("return")}
                  >
                    Trả máy {device.device_code}
                  </button>
                )}
                {!device && (
                  <button
                    type="button"
                    className="btn secondary btn-compact"
                    disabled={!online}
                    onClick={() => setCamera("receive")}
                  >
                    Nhận máy công ty
                  </button>
                )}
              </div>
            </>
          )}

          {/* STEP 3 with leaving confirmed */}
          {inRoom && leaving && (
            <div className="leaving-confirm-box">
              <p>
                {device
                  ? "Bước 1/2: Quét QR trả máy tại bàn chung, sau đó checkout phòng."
                  : "Máy đã trả xong. Quét QR cửa phòng và chụp ảnh để checkout."}
              </p>
              <button
                type="button"
                className="btn btn-large w-full checkout-hero-btn"
                disabled={!online}
                onClick={() => setCamera(device ? "return" : "checkout")}
              >
                {device ? "📱 Quét QR trả máy" : "📸 Quét QR checkout phòng"}
              </button>
              <button
                type="button"
                className="btn secondary btn-compact w-full"
                onClick={() => setLeaving(false)}
              >
                ← Tiếp tục ca live
              </button>
            </div>
          )}

          {/* Device return button if holding device without turn */}
          {device && !turn && (
            <button
              type="button"
              className="btn btn-large w-full idol-btn-primary"
              disabled={!online}
              onClick={() => setCamera("return")}
            >
              📱 Quét QR trả máy {device.device_code}
            </button>
          )}
        </div>
      ) : (
        /* Camera Active Mode */
        <div className="idol-camera-wrap">
          <LiveCamera
            key={`${turn?.segment_id ?? "loan"}:${camera}`}
            segment={turn?.segment_id}
            operation={camera}
            onComplete={complete}
          />
          <button
            type="button"
            className="btn secondary w-full cancel-camera-btn"
            onClick={() => setCamera(null)}
          >
            ✕ Hủy quét và quay lại
          </button>
        </div>
      )}

      <p className="hint idol-hint-text">
        💡 Check-in/out ghi nhận thực tế giờ nhận và trả phòng. Vui lòng quét mã QR gắn tại cửa phòng và trên thân máy.
      </p>
    </section>
  );
}
