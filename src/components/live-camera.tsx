"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { beginCapture, finishCapture, returnDevice, scanDevice } from "@/features/operations/actions";
import { createClient } from "@/lib/supabase/client";
import type { CaptureTicket } from "@/types/database";
import { useOnlineStatus } from "./pwa-provider";

export type CameraOperation = "checkin" | "checkout" | "receive" | "return";
export function LiveCamera({ segment = "", operation, onComplete }: { segment?: string; operation: CameraOperation; onComplete: (message: string) => void }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState<CaptureTicket | null>(null), [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState(""), [uploaded, setUploaded] = useState(false), [note, setNote] = useState("");
  const [error, setError] = useState(""), [success, setSuccess] = useState("");
  const video = useRef<HTMLVideoElement>(null), scanAllowed = useRef(false);
  useEffect(() => { scanAllowed.current = online && !ticket && !busy && !photo; }, [online, ticket, busy, photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const handleDecoded = useEffectEvent(async (raw: string) => {
    if (!navigator.onLine) { setError("Đang mất mạng. Kết nối lại trước khi xác thực QR."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      if (operation === "checkin" || operation === "checkout") {
        const result = await beginCapture(segment, raw, operation);
        if (result.ticket) setTicket(result.ticket);
        else { setError(result.error ?? "Chưa mở được phiên chụp."); setEnabled(false); }
      } else {
        const result = operation === "receive" ? await scanDevice(segment, raw) : await returnDevice(raw);
        setError(result.error ?? ""); setSuccess(result.success ?? ""); setEnabled(false); router.refresh();
        if (!result.error) { window.dispatchEvent(new Event("notifications-changed")); onComplete(result.success ?? "Đã ghi nhận."); }
      }
    } catch { setError("Mất kết nối. Tải lại để kiểm tra trạng thái trước khi quét lại."); setEnabled(false); }
    finally { setBusy(false); }
  });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false, stream: MediaStream | undefined, frame = 0, lastScan = 0;
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { willReadFrequently: true });
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("SECURE_CONTEXT");
        const decoder = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        if (!video.current) { stream.getTracks().forEach(t => t.stop()); return; }
        video.current.srcObject = stream; await video.current.play();
        if (cancelled) return;
        setReady(true);
        const tick = (time: number) => {
          if (cancelled) return;
          const source = video.current;
          if (scanAllowed.current && context && source && source.readyState >= 2 && time - lastScan > 200) {
            lastScan = time;
            canvas.width = Math.min(640, source.videoWidth); canvas.height = Math.round(source.videoHeight * canvas.width / source.videoWidth);
            if (canvas.width && canvas.height) {
              context.drawImage(source, 0, 0, canvas.width, canvas.height);
              const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
              const result = decoder(pixels.data, pixels.width, pixels.height);
              if (result) { scanAllowed.current = false; void handleDecoded(result.data); }
            }
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        if (!cancelled) { setError("Không mở được camera. Cho phép quyền camera và dùng HTTPS trên điện thoại (localhost dùng được trên máy tính)."); setEnabled(false); }
      }
    }
    void start();
    return () => { cancelled = true; cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); setReady(false); };
  }, [enabled]);

  function restart() { if (!navigator.onLine) { setError("Kết nối mạng trước khi quét QR."); return; } setPhoto(null); setPreview(""); setUploaded(false); setTicket(null); setError(""); setSuccess(""); setEnabled(true); }
  async function capture() {
    const source = video.current;
    if (!source || source.readyState < 2 || !source.videoWidth) { setError("Camera chưa sẵn sàng."); return; }
    const canvas = document.createElement("canvas"); canvas.width = Math.min(1280, source.videoWidth); canvas.height = Math.round(source.videoHeight * canvas.width / source.videoWidth);
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) { setError("Chụp ảnh chưa thành công. Thử lại."); return; }
    setPhoto(blob); setPreview(URL.createObjectURL(blob)); setEnabled(false); setUploaded(false);
  }
  async function confirm() {
    if (!navigator.onLine) { setError("Chưa có mạng để xác nhận. Giữ trang này mở rồi thử lại khi kết nối ổn định."); return; }
    if (!photo || !ticket) return;
    setBusy(true); setError("");
    try {
      if (!uploaded) {
        const { error: uploadError } = await createClient().storage.from("room-attendance").upload(ticket.path, photo, { contentType: "image/jpeg", upsert: false, cacheControl: "0" });
        if (uploadError && String("statusCode" in uploadError ? uploadError.statusCode : "") !== "409") { setError("Ảnh chưa tải lên được. Kiểm tra mạng hoặc quét lại nếu phiên chụp quá 5 phút."); return; }
        setUploaded(true);
      }
      const result = await finishCapture(ticket.id, note);
      if (result.error) setError(result.error);
      else { setSuccess(result.success ?? "Đã ghi nhận."); setPhoto(null); setPreview(""); setTicket(null); setNote(""); router.refresh(); window.dispatchEvent(new Event("notifications-changed")); onComplete(result.success ?? "Đã ghi nhận."); }
    } catch { setError("Kết nối bị gián đoạn. Có thể bấm xác nhận lại; cùng phiên chụp sẽ không tạo bản ghi trùng."); }
    finally { setBusy(false); }
  }
  const locked = enabled || busy || Boolean(ticket);
  return <section className="camera-task"><h3>{{ checkin: "Check-in phòng", checkout: "Checkout phòng", receive: "Nhận máy điện thoại", return: "Trả máy điện thoại" }[operation]}</h3><div className="stack-form">
    <p className="hint">{operation === "return" ? "Đặt máy tại bàn chung rồi quét QR máy đang giữ. Hệ thống tự xác nhận trả máy." : operation === "receive" ? "Quét QR máy. Máy gắn đúng phòng sẽ được nhận ngay; máy không gắn với phòng phải chờ người quản lý máy duyệt." : "Quét QR phòng rồi chụp toàn cảnh phòng. Hoàn tất khi ảnh được tải lên và xác nhận."}</p>
    {!enabled && !ticket && <button type="button" className="btn" disabled={!online || busy || (operation !== "return" && !segment)} onClick={restart}>Mở camera quét QR</button>}
    {enabled && <div className="camera-frame"><video ref={video} muted playsInline autoPlay aria-label="Camera quét QR và chụp phòng" /><p>{busy ? "Đang xác minh…" : ticket ? "QR hợp lệ. Hướng camera vào toàn cảnh phòng và chụp." : ready ? "Đưa mã QR vào giữa khung hình" : "Đang mở camera…"}</p></div>}
    {enabled && ticket && <button type="button" className="btn" disabled={!ready || busy} onClick={() => void capture()}>Chụp ảnh phòng</button>}
    {photo && preview && <>{/* Local camera blob only; never a public storage URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Ảnh phòng vừa chụp, chờ xác nhận" className="capture-preview" />
      <label>Ghi chú (không bắt buộc)<textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} rows={3} /></label>
      <button type="button" className="btn" disabled={!online || busy} onClick={() => void confirm()}>{busy ? "Đang tải ảnh và xác nhận…" : "Xác nhận ảnh & ghi nhận"}</button>
      <button type="button" className="btn secondary" disabled={!online || busy} onClick={restart}>Quét lại & chụp lại</button>
    </>}
    {locked && <button type="button" className="btn secondary" disabled={busy} onClick={() => { setEnabled(false); setTicket(null); setPhoto(null); setPreview(""); }}>Đóng camera / hủy thao tác</button>}
    <div aria-live="polite">{error && <p className="feedback error" role="alert">{error}</p>}{success && <p className="feedback success">{success}</p>}</div>
  </div></section>;
}
