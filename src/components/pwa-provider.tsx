"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type PwaContextValue = {
  canInstall: boolean;
  installed: boolean;
  installing: boolean;
  installMessage: string;
  install(): Promise<void>;
  updateReady: boolean;
  updating: boolean;
  updateMessage: string;
  reloadApp(): void;
};
const PwaContext = createContext<PwaContextValue | null>(null);
const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
};
export function useOnlineStatus() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
const subscribeStandalone = (notify: () => void) => {
  const query = window.matchMedia("(display-mode: standalone)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone, () => false);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installedInSession, setInstalledInSession] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installMessage, setInstallMessage] = useState("");
  const [updateState, setUpdateState] = useState<"waiting" | "activated" | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState("");
  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const reloadRequested = useRef(false);
  const reloadTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const onInstalled = () => { setInstalledInSession(true); setPrompt(null); setInstallMessage("Đã thêm Elden Media vào thiết bị."); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !window.isSecureContext || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let controlled = Boolean(navigator.serviceWorker.controller);
    let lastCheck = Date.now();
    const cleanups: (() => void)[] = [];
    const onController = () => {
      if (controlled) {
        if (reloadRequested.current) window.location.reload();
        else setUpdateState("activated"); // Other tabs retain their unsaved work.
      }
      controlled = true;
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    const checkUpdate = () => {
      if (!navigator.onLine || document.visibilityState !== "visible" || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      void registration.current?.update().catch(() => { /* Retry on the next visit/connection. */ });
    };
    const onVisible = () => { if (document.visibilityState === "visible") checkUpdate(); };
    window.addEventListener("online", checkUpdate);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(checkUpdate, 60 * 60 * 1000);

    void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then(reg => {
      if (disposed) return;
      registration.current = reg;
      const checkWaiting = () => { if (reg.waiting && navigator.serviceWorker.controller) setUpdateState("waiting"); };
      const watchInstalling = () => {
        const worker = reg.installing;
        if (!worker) return;
        const onState = () => { if (worker.state === "installed") checkWaiting(); };
        worker.addEventListener("statechange", onState);
        cleanups.push(() => worker.removeEventListener("statechange", onState));
      };
      checkWaiting();
      watchInstalling();
      reg.addEventListener("updatefound", watchInstalling);
      cleanups.push(() => reg.removeEventListener("updatefound", watchInstalling));
    }).catch(() => { /* The online app remains usable without a worker. */ });

    return () => {
      disposed = true;
      cleanups.forEach(cleanup => cleanup());
      navigator.serviceWorker.removeEventListener("controllerchange", onController);
      window.removeEventListener("online", checkUpdate);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
      if (reloadTimeout.current) clearTimeout(reloadTimeout.current);
    };
  }, []);

  async function install() {
    if (!prompt || installing) return;
    setInstalling(true);
    setInstallMessage("");
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallMessage(choice.outcome === "accepted" ? "Đã gửi yêu cầu cài đặt. Làm theo hướng dẫn của trình duyệt." : "Bạn có thể cài lại từ menu của trình duyệt.");
    } catch { setInstallMessage("Chưa mở được cài đặt. Hãy dùng menu của trình duyệt theo hướng dẫn bên dưới."); }
    finally { setInstalling(false); setPrompt(null); }
  }

  function reloadApp() {
    if (!navigator.onLine || updating) return;
    if (updateState === "activated" || !registration.current?.waiting) { window.location.reload(); return; }
    setUpdating(true);
    setUpdateMessage("");
    reloadRequested.current = true;
    registration.current.waiting.postMessage({ type: "ELDEN_ACTIVATE_UPDATE" });
    reloadTimeout.current = setTimeout(() => {
      reloadRequested.current = false;
      setUpdating(false);
      setUpdateMessage("Chưa tải được bản mới. Bạn có thể thử lại sau khi lưu xong công việc.");
    }, 10_000);
  }

  return <PwaContext.Provider value={{
    canInstall: Boolean(prompt) && !standalone && !installedInSession,
    installed: standalone || installedInSession,
    installing, installMessage, install,
    updateReady: updateState !== null, updating, updateMessage, reloadApp,
  }}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("PwaProvider required");
  return value;
}

export function PwaStatus() {
  const online = useOnlineStatus();
  const { updateReady, updating, updateMessage, reloadApp } = usePwa();
  if (online && !updateReady) return null;
  return <div className="pwa-status" aria-live="polite">
    {!online && <div className="pwa-notice pwa-offline" role="status"><strong>Thiết bị đang mất mạng</strong><p>Kết nối lại trước khi gửi thao tác. Nếu vừa gửi, kiểm tra trạng thái trước khi thực hiện lại.</p></div>}
    {updateReady && <div className="pwa-notice"><div><strong>Có phiên bản mới của Elden Media</strong><p>Lưu xong biểu mẫu hoặc xác nhận ảnh đang chụp trước khi tải lại.</p>{updateMessage && <p role="status">{updateMessage}</p>}</div><button className="btn secondary btn-compact" type="button" disabled={!online || updating} onClick={reloadApp}>{updating ? "Đang cập nhật…" : "Tải lại ứng dụng"}</button></div>}
  </div>;
}
