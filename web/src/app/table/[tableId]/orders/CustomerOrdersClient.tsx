"use client";

import PlateProgress from "@/components/plate-progress";
import PaymentProgress from "@/components/payment-progress";
import { paidItemQuantity } from "@/lib/payment-progress";
import { orderDisplayStatus } from "@/lib/plate-progress";
import { formatOrderNumber } from "@/lib/order-number";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomerOrderEvents } from "@/components/customer-order-events";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CustomerMenu } from "@/lib/customer-menu-catalog";
import type { OrderData } from "./EditOrderModal";

type Order = OrderData;

const statusLabels: Record<string, string> = {
  partially_served: "เสิร์ฟแล้วบางส่วน",
  confirmed: "รับออเดอร์แล้ว",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  served: "เสิร์ฟแล้ว กรุณาชำระเงินที่เคาน์เตอร์",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

function isOrderEditable(order: Order): boolean {
  if (order.status !== "confirmed") return false;
  if (!order.order_items || order.order_items.length === 0) return false;
  return order.order_items.every(
    (item) =>
      (!item.completed_plates || item.completed_plates.length === 0) &&
      (!item.served_plates || item.served_plates.length === 0),
  );
}

export default function CustomerOrdersClient({
  tableId,
  tableNumber,
  legacyReference,
  menus = [],
}: {
  tableId: number;
  tableNumber: string;
  legacyReference: string;
  menus?: CustomerMenu[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditSuccess = searchParams.get("editSuccess") === "1";
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const hasLoadedSuccessfullyRef = useRef(false);
  const isSessionActiveRef = useRef(true);
  const pollingTimerRef = useRef<number | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);

  const stopPolling = useCallback((abortRequest = false) => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }

    if (abortRequest) {
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    }
  }, []);

  const loadOrders = useCallback(async (replaceInFlight = false) => {
    if (
      !isSessionActiveRef.current ||
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
      `smart-order-session-id-${tableId}`,
    ) ?? window.localStorage.getItem(`smart-order-session-${legacyReference}`);

    if (!sessionToken) {
      isSessionActiveRef.current = false;
      stopPolling();
      setOrders([]);
      setConnectionWarning(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;

    try {
      const response = await fetch("/api/customer-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableId, sessionToken }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || "โหลดออเดอร์ไม่สำเร็จ");
      }

      hasLoadedSuccessfullyRef.current = true;
      setConnectionWarning(false);
      setError("");

      if (result.session?.status === "closed") {
        isSessionActiveRef.current = false;
        stopPolling();
        window.localStorage.removeItem(
          `smart-order-session-id-${tableId}`,
        );
        setOrders([]);
        setError("");
        return;
      }

      if (!result.session || result.session.status !== "active") {
        isSessionActiveRef.current = false;
        stopPolling();
        setOrders([]);
        setError("");
        return;
      }

      setOrders(result.orders ?? []);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") {
        return;
      }

      setConnectionWarning(true);

      if (!hasLoadedSuccessfullyRef.current) {
        setError("ไม่สามารถโหลดข้อมูลออเดอร์ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่");
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  }, [stopPolling, tableId, legacyReference]);

  useCustomerOrderEvents(tableId, legacyReference, loadOrders);

  useEffect(() => {
    const canPoll = () =>
      isSessionActiveRef.current &&
      navigator.onLine &&
      document.visibilityState === "visible";

    const startPolling = (loadImmediately = false) => {
      if (!canPoll()) return;

      if (!pollingTimerRef.current) {
        pollingTimerRef.current = window.setInterval(
          () => void loadOrders(),
          5000,
        );
      }

      if (loadImmediately) {
        void loadOrders(true);
      }
    };

    const handleOnline = () => startPolling(true);
    const handleOffline = () => {
      stopPolling(true);
      setConnectionWarning(true);
      setLoading(false);

      if (!hasLoadedSuccessfullyRef.current) {
        setError("ไม่สามารถโหลดข้อมูลออเดอร์ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่");
      }
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
      if (navigator.onLine) {
        startPolling(true);
      } else {
        handleOffline();
      }
    }, 0);

    return () => {
      window.clearTimeout(initialTimer);
      stopPolling(true);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadOrders, stopPolling]);

  const total = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + order.order_items.reduce((total, item) => total + Math.round(Number(item.unit_price) * 100) * (item.quantity - paidItemQuantity(item)), 0) / 100, 0),
    [orders],
  );

  const cancelOrder = async (orderId: string) => {
    if (cancellingId || !window.confirm("ยืนยันว่าต้องการยกเลิกออเดอร์นี้หรือไม่?")) return;
    const sessionToken = window.localStorage.getItem(`smart-order-session-id-${tableId}`) ?? window.localStorage.getItem(`smart-order-session-${legacyReference}`);
    if (!sessionToken) { setCancelMessage("ไม่พบรอบโต๊ะปัจจุบัน กรุณาโหลดหน้าใหม่"); return; }
    setCancellingId(orderId);
    setCancelMessage("");
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, tableId }),
      });
      const result = await response.json();
      if (!response.ok) { setCancelMessage(result.error ?? "ยกเลิกออเดอร์ไม่สำเร็จ"); return; }
      setCancelMessage("ยกเลิกออเดอร์สำเร็จ");
      await loadOrders(true);
    } catch {
      setCancelMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
    } finally { setCancellingId(null); }
  };

  useEffect(() => {
    if (isEditSuccess) {
      const timer = setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("editSuccess");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isEditSuccess]);

  const handleStartEdit = (order: Order) => {
    const draftItems = order.order_items.map((item, index) => {
      const catalogMenu = menus.find((m) => m.id === item.menu_id);
      const basePrice = catalogMenu
        ? catalogMenu.price
        : Number(item.menu_price_snapshot || item.unit_price);
      const menuName =
        item.menu_name_snapshot || item.menus?.name || catalogMenu?.name || "รายการอาหาร";

      const optionSelections = (item.order_item_options ?? []).map((opt) => {
        let optId = opt.menu_option_id;
        if (!optId && catalogMenu) {
          for (const grp of catalogMenu.option_groups) {
            const matched = grp.options.find((o) => o.name === opt.option_name);
            if (matched) {
              optId = matched.id;
              break;
            }
          }
        }
        return {
          optionId: optId ?? opt.id,
          quantity: opt.quantity || 1,
        };
      });

      const selectedOptions = (item.order_item_options ?? []).map((opt) => {
        let optId = opt.menu_option_id;
        let groupName = "";
        if (catalogMenu) {
          for (const grp of catalogMenu.option_groups) {
            const matched = grp.options.find((o) => o.name === opt.option_name);
            if (matched) {
              optId = matched.id;
              groupName = grp.name;
              break;
            }
          }
        }
        return {
          id: optId ?? opt.id,
          name: opt.option_name,
          additional_price: Number(opt.additional_price || 0),
          max_quantity: 99,
          max_available_quantity: 99,
          is_available: true,
          quantity: opt.quantity || 1,
          group_name: groupName,
        };
      });

      const unitPrice =
        (Math.round(basePrice * 100) +
          selectedOptions.reduce(
            (sum, o) => sum + Math.round(o.additional_price * 100) * o.quantity,
            0,
          )) /
        100;

      return {
        cartId: `edit-${item.id}-${index}`,
        menuId: item.menu_id || catalogMenu?.id || 0,
        menuName,
        basePrice,
        quantity: item.quantity,
        note: item.note || null,
        optionSelections,
        selectedOptions,
        unitPrice,
      };
    });

    const editDraft = {
      orderId: order.id,
      orderNumber: order.order_number,
      diningType: order.dining_type,
      orderNote: order.note || "",
      items: draftItems,
    };

    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(
        `smart-order-edit-draft-${tableId}`,
        JSON.stringify(editDraft),
      );
    }

    router.push(`/table/${legacyReference}?editOrder=${order.id}`);
  };

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-orange-500">SMART ORDER</p>
            <h1 className="mt-1 text-3xl font-bold">ออเดอร์ของโต๊ะ {tableNumber}</h1>
            <p className="mt-2 text-sm text-zinc-500">สถานะจะอัปเดตอัตโนมัติ</p>
          </div>
          <Link
            href={`/table/id-${tableId}`}
            className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white"
          >
            สั่งเพิ่ม
          </Link>
        </div>

        {connectionWarning && (
          <div className="mt-4 rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            ขาดการเชื่อมต่อ กำลังรอเชื่อมต่อใหม่
          </div>
        )}
        {isEditSuccess && (
          <p
            role="status"
            className="mt-4 rounded-xl bg-green-50 border border-green-200 p-4 font-medium text-green-800"
          >
            แก้ไขออเดอร์สำเร็จ
          </p>
        )}
        {cancelMessage && <p role="status" className="mt-4 rounded-xl bg-white p-4 text-zinc-800">{cancelMessage}</p>}

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center">กำลังโหลดออเดอร์...</div>
        ) : error ? (
          <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">{error}</div>
        ) : orders.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center text-zinc-500">
            ยังไม่มีออเดอร์ในรอบโต๊ะนี้
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold">ออเดอร์ {formatOrderNumber(order.order_number)}</p><p className="text-sm text-orange-700">{order.dining_type === "takeaway" ? "กลับบ้าน (Takeaway)" : "ทานที่ร้าน"}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-600">
                    {statusLabels[orderDisplayStatus(order)] ?? order.status}
                  </span>
                </div>

                <div className="mt-5 divide-y divide-zinc-100">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0">
                      <div className="flex justify-between gap-4">
                        <p className="font-semibold">
                          {item.menu_name_snapshot ?? item.menus?.name ?? "เมนู"} × {item.quantity}
                        </p>
                        <p className="font-semibold">{formatPrice(item.subtotal)} บาท</p>
                      </div>
                      {item.order_item_options.map((option) => (
                        <p key={option.id} className="mt-1 text-sm text-orange-600">
                          {option.option_name} × {option.quantity} ต่อจาน
                        </p>
                      ))}
                      <PlateProgress item={item} status={order.status} />
                      <PaymentProgress item={item} />
                      {item.note && <p className="mt-1 text-sm text-zinc-500">{item.note}</p>}
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex justify-between border-t border-zinc-200 pt-4 text-lg font-bold">
                  <span>รวมออเดอร์</span>
                  <span className="text-orange-500">{formatPrice(order.total_amount)} บาท</span>
                </div>
                {isOrderEditable(order) ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      data-testid="edit-order-btn"
                      onClick={() => handleStartEdit(order)}
                      className="rounded-xl bg-orange-500 hover:bg-orange-600 px-4 py-2 font-semibold text-white shadow-xs transition"
                    >
                      แก้ไขออเดอร์
                    </button>
                    <button
                      type="button"
                      disabled={cancellingId !== null}
                      onClick={() => void cancelOrder(order.id)}
                      className="rounded-xl border border-red-300 px-4 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 transition"
                    >
                      {cancellingId === order.id ? "กำลังยกเลิก..." : "ยกเลิกออเดอร์"}
                    </button>
                  </div>
                ) : (
                  (order.status === "preparing" ||
                    (order.status === "confirmed" && !isOrderEditable(order))) && (
                    <p className="mt-4 text-sm font-medium text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-200">
                      ร้านเริ่มทำอาหารแล้ว ไม่สามารถแก้ไขออเดอร์ได้
                    </p>
                  )
                )}
              </article>
            ))}

            <div className="rounded-2xl bg-zinc-900 p-6 text-white">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold">ยอดรวมรอบโต๊ะ</span>
                <span className="text-2xl font-bold text-orange-400">{formatPrice(total)} บาท</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
