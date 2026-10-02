"use client";
import { useEffect, useState } from "react";

export function useServerClock(serverNow: number) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setNow(serverNow + Date.now() - started), 15000);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}
