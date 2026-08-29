"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type OrderRealtimeRefreshProps = {
  channelName: string;
  fallbackIntervalMs?: number;
};

const refreshDebounceMs = 300;

export default function OrderRealtimeRefresh({
  channelName,
  fallbackIntervalMs = 15_000,
}: OrderRealtimeRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let isActive = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;

    const refreshOrders = () => {
      if (!isActive || refreshTimer) return;

      refreshTimer = setTimeout(() => {
        refreshTimer = null;

        if (isActive) {
          router.refresh();
        }
      }, refreshDebounceMs);
    };

    const stopFallbackPolling = () => {
      if (!fallbackTimer) return;

      clearInterval(fallbackTimer);
      fallbackTimer = null;
    };

    const startFallbackPolling = () => {
      if (!isActive || fallbackTimer) return;

      fallbackTimer = setInterval(refreshOrders, fallbackIntervalMs);
    };

    const handleOnline = () => refreshOrders();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshOrders();
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Poll while the initial WebSocket connection is being established. Once
    // Realtime is subscribed, polling is stopped and only resumes on failure.
    startFallbackPolling();

    const channel = supabase
      .channel(channelName)
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
          stopFallbackPolling();
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
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      void supabase.removeChannel(channel);
    };
  }, [channelName, fallbackIntervalMs, router]);

  return null;
}
