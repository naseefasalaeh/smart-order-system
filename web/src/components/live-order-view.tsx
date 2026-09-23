"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopRole } from "@/lib/dashboard-auth";
import { useRouter } from "next/navigation";

export const OrderViewRefresh = createContext<(() => Promise<void>) | null>(null);
export const useOrderViewRefresh = () => useContext(OrderViewRefresh);

export function OrderViewRetry({ refresh }: { refresh: () => Promise<void> }) {
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  return <button className="ml-3 underline disabled:opacity-60" disabled={pending} aria-busy={pending}
    onClick={async () => {
      if (locked.current) return;
      locked.current = true;
      setPending(true);
      try { await refresh(); }
      catch { /* The view retains its Thai error and last successful snapshot. */ }
      finally { locked.current = false; setPending(false); }
    }}>{pending ? "กำลังดำเนินการ…" : "ลองใหม่"}</button>;
}

export function useLiveOrderView<T extends { error: unknown }>(initial: T, userId: string, role: ShopRole, allowed: readonly ShopRole[], load: (db: SupabaseClient) => Promise<T>) {
  const [data, setData] = useState(initial);
  const [previousInitial, setPreviousInitial] = useState(initial);
  const [error, setError] = useState("");
  const inFlight = useRef<{ generation: number; promise: Promise<void> } | null>(null);
  const generation = useRef(0);
  const router = useRouter();
  if (previousInitial !== initial) { setPreviousInitial(initial); setData(initial); setError(""); }
  useEffect(() => { generation.current += 1; return () => { generation.current += 1; }; }, [initial]);
  const refresh = useCallback(() => {
    const currentGeneration = generation.current;
    if (inFlight.current?.generation === currentGeneration) return inFlight.current.promise;
    const request = async () => {
      try {
        const db = createClient();
        // Both reads use the user's JWT and RLS. Profile is checked afresh before
        // showing data; no cross-request authorization cache or service-role key.
        const [profile, next] = await Promise.all([
          db.from("profiles").select("role,is_active").eq("id", userId).maybeSingle(), load(db),
        ]);
        if (currentGeneration !== generation.current) return;
        if (profile.error) throw new Error("ตรวจสอบสิทธิ์ไม่สำเร็จชั่วคราว กรุณาลองใหม่");
        if (!profile.data?.is_active || !allowed.includes(profile.data.role)) {
          router.replace("/access-denied");
          throw new Error("บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้");
        }
        if (profile.data.role !== role) {
          // Reload role-specific controls through the server's authoritative guard.
          router.refresh();
          return;
        }
        if (next.error) throw new Error("โหลดออเดอร์ล่าสุดไม่สำเร็จ กรุณาลองใหม่");
        if (currentGeneration === generation.current) { setData(next); setError(""); }
      } catch (cause) {
        if (currentGeneration === generation.current) setError("โหลดข้อมูลล่าสุดไม่สำเร็จชั่วคราว กรุณาตรวจสถานะก่อนทำรายการต่อ");
        throw cause;
      }
    };
    const promise = request().finally(() => {
      if (inFlight.current?.promise === promise) inFlight.current = null;
    });
    inFlight.current = { generation: currentGeneration, promise };
    return promise;
  }, [allowed, load, userId, role, router]);
  const refreshAfterMutation = useCallback(async () => {
    // A poll that began before the write may contain stale data. Wait for it,
    // then issue a new read rather than deduplicating the committed write into it.
    if (inFlight.current) await inFlight.current.promise.catch(() => {});
    await refresh();
  }, [refresh]);
  return { data, refresh, refreshAfterMutation, error };
}
