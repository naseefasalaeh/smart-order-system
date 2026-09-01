"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type QueueStatus = "pending" | "confirmed" | "preparing" | "ready";

type QueueOrder = {
  queueNumber: string;
  status: QueueStatus;
  created_at: string;
  isMine: boolean;
};

const waitingStatuses = new Set<QueueStatus>([
  "pending",
  "confirmed",
  "preparing",
]);

const statusLabels: Record<QueueStatus, string> = {
  pending: "รอยืนยัน",
  confirmed: "รับออเดอร์แล้ว",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
};

const statusStyles: Record<QueueStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
};

export default function CustomerQueueClient({
  tableNumber,
}: {
  tableNumber: number;
}) {
  const [queue, setQueue] = useState<QueueOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [hasLoadedSuccessfully, setHasLoadedSuccessfully] = useState(false);
  const canContinuePollingRef = useRef(true);
  const pollingTimerRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback((abortRequest = false) => {
    if (pollingTimerRef.current !== null) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (abortRequest) {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    }
  }, []);

  const expireSession = useCallback(() => {
    canContinuePollingRef.current = false;
    stopPolling(true);
    window.localStorage.removeItem(`smart-order-session-${tableNumber}`);
    setQueue([]);
    setSessionExpired(true);
    setLoadFailed(false);
    setLoading(false);
  }, [stopPolling, tableNumber]);

  const loadQueue = useCallback(
    async (replaceInFlight = false) => {
      if (
        !canContinuePollingRef.current ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      if (requestControllerRef.current) {
        if (!replaceInFlight) return;
        requestControllerRef.current.abort();
      }

      const sessionToken = window.localStorage.getItem(
        `smart-order-session-${tableNumber}`,
      );

      if (!sessionToken) {
        expireSession();
        return;
      }

      const controller = new AbortController();
      requestControllerRef.current = controller;

      try {
        const response = await fetch("/api/customer-queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableNumber, sessionToken }),
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 400 || response.status === 401) {
          expireSession();
          return;
        }

        if (!response.ok) {
          throw new Error("Queue request failed");
        }

        const result = (await response.json()) as QueueOrder[];

        setHasLoadedSuccessfully(true);
        setQueue(Array.isArray(result) ? result : []);
        setOffline(false);
        setLoadFailed(false);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadFailed(true);
      } finally {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [expireSession, tableNumber],
  );

  useEffect(() => {
    const canPoll = () =>
      canContinuePollingRef.current &&
      navigator.onLine &&
      document.visibilityState === "visible";

    const startPolling = (loadImmediately = false) => {
      if (!canPoll()) return;

      if (pollingTimerRef.current === null) {
        pollingTimerRef.current = window.setInterval(
          () => void loadQueue(),
          5000,
        );
      }

      if (loadImmediately) void loadQueue(true);
    };

    const handleOnline = () => {
      setOffline(false);
      startPolling(true);
    };
    const handleOffline = () => {
      stopPolling(true);
      setOffline(true);
      setLoading(false);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startPolling(true);
      } else {
        stopPolling(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const initialTimer = window.setTimeout(() => {
      if (navigator.onLine) startPolling(true);
      else handleOffline();
    }, 0);

    return () => {
      window.clearTimeout(initialTimer);
      stopPolling(true);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadQueue, stopPolling]);

  const queueSummary = useMemo(() => {
    const waitingCount = queue.filter((order) =>
      waitingStatuses.has(order.status),
    ).length;
    const referenceIndex = queue.findIndex((order) => order.isMine);

    if (referenceIndex < 0) {
      return { waitingCount, ordersAhead: null };
    }

    const ordersAhead = queue
      .slice(0, referenceIndex)
      .filter((order) => waitingStatuses.has(order.status)).length;

    return { waitingCount, ordersAhead };
  }, [queue]);

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="font-semibold text-orange-500">SMART ORDER</p>
            <h1 className="mt-1 text-3xl font-bold text-zinc-900">คิวร้าน</h1>
            <p className="mt-2 text-sm text-zinc-500">
              อัปเดตอัตโนมัติทุก 5 วินาที
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/table/${tableNumber}`}
              className="rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
            >
              กลับไปหน้าเมนู
            </Link>
            <Link
              href={`/table/${tableNumber}/orders`}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-700"
            >
              ออเดอร์ของฉัน
            </Link>
          </div>
        </div>

        {offline && (
          <div className="mt-5 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            ขณะนี้ออฟไลน์ ระบบจะอัปเดตอีกครั้งเมื่อเชื่อมต่ออินเทอร์เน็ต
          </div>
        )}

        {loadFailed && !sessionExpired && (
          <div className="mt-5 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            อัปเดตคิวไม่สำเร็จชั่วคราว กำลังลองใหม่โดยยังแสดงข้อมูลล่าสุด
          </div>
        )}

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            กำลังโหลดคิวร้าน...
          </div>
        ) : sessionExpired ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-bold text-zinc-900">
              ไม่พบรอบโต๊ะที่กำลังใช้งาน
            </h2>
            <p className="mt-2 text-sm text-zinc-500">
              กรุณากลับไปหน้าเมนูและเริ่มสั่งอาหารใหม่
            </p>
          </div>
        ) : !hasLoadedSuccessfully && loadFailed ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-zinc-700">
              ยังไม่สามารถโหลดคิวร้านได้
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              ระบบจะลองใหม่ให้อัตโนมัติ
            </p>
          </div>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-zinc-900 p-6 text-white shadow-sm">
                <p className="text-sm text-zinc-300">ออเดอร์ที่กำลังรอในร้าน</p>
                <p className="mt-2 text-4xl font-bold text-orange-400">
                  {queueSummary.waitingCount}
                </p>
              </div>

              {queueSummary.ordersAhead !== null && (
                <div className="rounded-2xl bg-orange-500 p-6 text-white shadow-sm">
                  <p className="text-sm text-orange-100">
                    ออเดอร์ที่เข้าก่อนคุณ
                  </p>
                  <p className="mt-2 text-4xl font-bold">
                    {queueSummary.ordersAhead}
                  </p>
                </div>
              )}
            </section>

            <p className="mt-4 text-sm text-zinc-500">
              ลำดับอาจเปลี่ยนตามประเภทอาหารและการจัดคิวของครัว
            </p>

            {queue.length === 0 ? (
              <div className="mt-6 rounded-2xl bg-white p-8 text-center text-zinc-500 shadow-sm">
                ขณะนี้ไม่มีออเดอร์ในคิวร้าน
              </div>
            ) : (
              <section className="mt-6 space-y-3">
                {queue.map((order) => (
                  <article
                    key={`${order.queueNumber}-${order.created_at}`}
                    className={`flex items-center justify-between gap-4 rounded-2xl border p-5 shadow-sm ${
                      order.isMine
                        ? "border-orange-400 bg-orange-50"
                        : "border-transparent bg-white"
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xl font-bold text-zinc-900">
                          {order.queueNumber}
                        </p>
                        {order.isMine && (
                          <span className="rounded-full bg-orange-500 px-2.5 py-1 text-xs font-bold text-white">
                            ออเดอร์ของฉัน
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {new Date(order.created_at).toLocaleString("th-TH")}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${statusStyles[order.status]}`}
                    >
                      {statusLabels[order.status]}
                    </span>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
