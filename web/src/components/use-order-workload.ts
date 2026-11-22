"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadOrderWorkload } from "@/lib/order-workload";
import type { ShopRole } from "@/lib/dashboard-auth";

export function useOrderWorkload(role: ShopRole) {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof loadOrderWorkload>> | null>(null);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const seen = useRef<Set<string> | null>(null);
  const identity = useRef("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const request = async () => {
      if (role !== "staff" && role !== "kitchen_staff") return;
      try {
        const db = createClient();
        const user = await db.auth.getUser();
        if (user.error || !user.data.user) throw new Error("AUTH_REQUIRED");
        const profile = await db.from("profiles").select("role,is_active").eq("id", user.data.user.id).maybeSingle();
        if (profile.error || !profile.data?.is_active || profile.data.role !== role) throw new Error("ROLE_CHANGED");
        const next = await loadOrderWorkload(db, role);
        if (!mounted.current) return;
        if (role === "staff") {
          const key = `smart-order-ready-plates-seen:${user.data.user.id}`;
          if (identity.current !== key) { identity.current = key; seen.current = null; }
          if (seen.current === null) {
            try {
              const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
              if (Array.isArray(stored) && stored.every(id => typeof id === "string")) seen.current = new Set(stored);
            } catch { /* Private browser storage may be unavailable. */ }
          }
          // First successful snapshot is the baseline, not a burst of old alerts.
          const fresh = seen.current === null ? [] : next.ready.filter(order => !seen.current!.has(order.id));
          seen.current ??= new Set();
          next.ready.forEach(order => seen.current!.add(order.id));
          try { sessionStorage.setItem(key, JSON.stringify([...seen.current].slice(-1000))); } catch { /* Keep in-memory deduplication. */ }
          if (role === "staff" && fresh.length) {
            const groups = new Map<string, { label: string; quantity: number }>();
            fresh.forEach(plate => {
              const entry = groups.get(plate.group) ?? { label: plate.label, quantity: 0 };
              entry.quantity += 1; groups.set(plate.group, entry);
            });
            setNotice([...groups.values()].map(entry => `${entry.label} ${entry.quantity} จาน พร้อมเสิร์ฟแล้ว`).join(" · "));
          }
        }
        setSnapshot(next); setFailed(false);
      } catch (cause) {
        if (mounted.current) { setSnapshot(null); setNotice(""); setFailed(true); }
        throw cause;
      }
    };
    const promise = request().finally(() => { if (inFlight.current === promise) inFlight.current = null; });
    inFlight.current = promise;
    return promise;
  }, [role]);
  useEffect(() => {
    const handleMutation = (event: Event) => {
      if ((event as CustomEvent<{ pending: boolean }>).detail.pending) return;
      // An earlier poll may have read before the commit. Follow it with a new read.
      void (async () => { await inFlight.current?.catch(() => {}); if (mounted.current) await refresh(); })().catch(() => {});
    };
    window.addEventListener("order-mutation", handleMutation);
    return () => window.removeEventListener("order-mutation", handleMutation);
  }, [refresh]);
  const dismissNotice = useCallback(() => setNotice(""), []);
  return { snapshot, notice, failed, refresh, dismissNotice };
}
