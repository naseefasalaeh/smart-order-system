"use client";

import { useEffect } from "react";

export function useCustomerOrderEvents(tableId: number, legacyReference: string, refresh: (replace?: boolean) => Promise<void>) {
  useEffect(() => {
    let stopped = false;
    let controller: AbortController | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const stopConnection = () => { clearTimeout(retry); controller?.abort(); controller = undefined; };
    const connect = async () => {
      if (stopped || controller || !navigator.onLine || document.visibilityState !== "visible") return;
      const sessionToken = localStorage.getItem(`smart-order-session-id-${tableId}`)
        ?? localStorage.getItem(`smart-order-session-${legacyReference}`);
      if (!sessionToken) return;
      const current = new AbortController(); controller = current;
      try {
        const response = await fetch("/api/customer-orders/events", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId, sessionToken }), signal: current.signal,
        });
        if (response.status === 403 || response.status === 400) { stopped = true; return; }
        if (!response.ok || !response.body) return;
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = "";
        while (!current.signal.aborted) {
          const { value, done } = await reader.read(); if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n"); pending = lines.pop() ?? "";
          for (const line of lines) {
            const event = JSON.parse(line);
            // Replace an older in-flight poll after a committed database event.
            if (event.type === "ready" || event.type === "change") void refresh(true);
          }
        }
      } catch { /* Existing polling remains the fallback during stream outages. */ }
      finally {
        if (controller === current) {
          controller = undefined;
          if (!stopped) retry = setTimeout(() => void connect(), 1500);
        }
      }
    };
    const resume = () => { if (document.visibilityState === "visible" && navigator.onLine) void connect(); else stopConnection(); };
    void connect();
    window.addEventListener("online", resume); window.addEventListener("offline", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      stopped = true; stopConnection();
      window.removeEventListener("online", resume); window.removeEventListener("offline", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [tableId, legacyReference, refresh]);
}
