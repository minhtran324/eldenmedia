"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/* =============================================
   TOAST SYSTEM — Elden Media
   Usage: useToast().show("message", "success" | "error" | "info" | "warning")
   ============================================= */

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  detail?: string;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, detail?: string) => void;
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
  warning: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 5000; // ms

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

const LABELS: Record<ToastType, string> = {
  success: "Thành công",
  error: "Có lỗi xảy ra",
  info: "Thông tin",
  warning: "Cảnh báo",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    timerRef.current = setTimeout(dismiss, TOAST_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dismiss]);

  return (
    <div
      className={`toast-item toast-${toast.type} ${exiting ? "toast-exit" : "toast-enter"}`}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="toast-icon-wrap">
        <span className="toast-icon" aria-hidden="true">
          {ICONS[toast.type]}
        </span>
      </div>
      <div className="toast-body">
        <span className="toast-label">{LABELS[toast.type]}</span>
        <p className="toast-message">{toast.message}</p>
        {toast.detail && <p className="toast-detail">{toast.detail}</p>}
      </div>
      <button
        type="button"
        className="toast-dismiss"
        onClick={dismiss}
        aria-label="Đóng thông báo"
      >
        ✕
      </button>
      <div className="toast-progress" style={{ animationDuration: `${TOAST_DURATION}ms` }} />
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info", detail?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, message, type, detail }]);
  }, []);

  const success = useCallback((msg: string, detail?: string) => show(msg, "success", detail), [show]);
  const error = useCallback((msg: string, detail?: string) => show(msg, "error", detail), [show]);
  const info = useCallback((msg: string, detail?: string) => show(msg, "info", detail), [show]);
  const warning = useCallback((msg: string, detail?: string) => show(msg, "warning", detail), [show]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, success, error, info, warning }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container" aria-label="Thông báo hệ thống">
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/* =============================================
   FEEDBACK → TOAST BRIDGE
   Drop-in replacement for inline Feedback component.
   Listens to Server Action state and shows toast automatically.
   ============================================= */

import { useEffect as useEffectBridge } from "react";
import type { ActionState } from "@/features/accounts/actions";

/** Auto-shows a toast when server action state changes. Returns nothing (no inline display). */
export function ActionFeedback({ state }: { state: ActionState }) {
  const toast = useToast();
  const prevRef = useRef<ActionState>({});

  useEffectBridge(() => {
    if (state === prevRef.current) return;
    prevRef.current = state;
    if (state.error) toast.error(state.error);
    else if (state.success) toast.success(state.success);
  }, [state, toast]);

  return null;
}
