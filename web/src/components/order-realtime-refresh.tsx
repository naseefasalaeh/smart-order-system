"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type OrderRealtimeRefreshProps = {
  channelName: string;
  fallbackIntervalMs?: number;
  pollWhenSubscribed?: boolean;
  onRefresh?: () => Promise<void>;
};

const refreshDebounceMs = 300;

export default function OrderRealtimeRefresh({
  channelName,
  fallbackIntervalMs = 15_000,
  pollWhenSubscribed = false,
  onRefresh,
}: OrderRealtimeRefreshProps) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const refreshingRef = useRef(false);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  useEffect(() => {
    const supabase = createClient();
    let isActive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let pendingMutations = 0;
    let loading = false;
    let queued = false;
    let checking = false;
    let fingerprint: string | null = null;

    const refreshOrders = () => {
      if (!isActive) return;
      queued = true;
      if (refreshTimer || pendingMutations || loading || (!onRefresh && refreshingRef.current) || document.visibilityState === "hidden") return;

      refreshTimer = setTimeout(() => {
        refreshTimer = null;

        if (isActive && !pendingMutations && document.visibilityState !== "hidden") {
          queued = false;
          loading = true;
          startTransition(async () => {
            try {
              if (onRefresh) await onRefresh();
              else router.refresh();
            } catch {
              // A failed refresh must not acknowledge the poll's version.
              fingerprint = null;
            } finally {
              loading = false;
              if (queued) refreshOrders();
            }
          });
        }
      }, refreshDebounceMs);
    };

    // RLS-protected lightweight reads: do not rerender the whole page when nothing changed.
    const checkForChanges = async () => {
      if (!isActive || checking || pendingMutations || loading || refreshingRef.current || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const result = channelName === "ingredients-order-stock"
          ? await supabase.from("ingredients").select("id,stock_quantity,minimum_stock,updated_at").order("id")
          : await supabase.from("orders").select("id,status,updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1);
        if (result.error || !isActive) return;
        const next = JSON.stringify([result.count, result.data]);
        if (fingerprint !== next) { fingerprint = next; refreshOrders(); }
      } catch {
        // Keep the current view; the next poll retries. A manual/focus refresh
        // uses the view's Thai error banner if the connection remains unavailable.
      } finally { checking = false; }
    };
    const handleMutation = (event: Event) => {
      const pending = Boolean((event as CustomEvent<{ pending: boolean }>).detail.pending);
      pendingMutations = Math.max(0, pendingMutations + (pending ? 1 : -1));
      if (pending && refreshTimer) { clearTimeout(refreshTimer); refreshTimer = null; }
      // Keep remote events that arrive during another order's mutation/read.
      if (!pendingMutations && queued) refreshOrders();
    };

    const stopFallbackPolling = () => {
      if (!fallbackTimer) return;

      clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const startFallbackPolling = () => {
      if (!isActive || fallbackTimer) return;

      fallbackTimer = setInterval(() => void checkForChanges(), fallbackIntervalMs);
    };

    const handleOnline = () => refreshOrders();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshOrders();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("order-mutation", handleMutation);

    // Stock views keep polling as a backstop even when a subscribed socket
    // misses an event. Other order views retain failure-only polling.
    startFallbackPolling();

    const channel = supabase
      // The SDK reuses channels with the same topic. An effect remount can race
      // asynchronous removeChannel and unsubscribe the replacement subscription.
      // Give each effect lifetime its own topic so cleanup only removes its owner.
      .channel(`${channelName}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        refreshOrders,
      )
      .subscribe((status, error) => {
        if (!isActive) return;

        if (status === "SUBSCRIBED") {
          if (!pollWhenSubscribed) stopFallbackPolling();
          // Covers changes between SSR and initial subscription, as well as reconnects.
          refreshOrders();
          return;
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          startFallbackPolling();

          if (error) {
            console.error("Order Realtime subscription failed:", error);
          }
        }
      });

    return () => {
      isActive = false;

      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      stopFallbackPolling();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleOnline);
      window.removeEventListener("order-mutation", handleMutation);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      void supabase.removeChannel(channel);
    };
  }, [channelName, fallbackIntervalMs, pollWhenSubscribed, router, onRefresh]);

  return null;
}
