"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOrderViewRefresh } from "./live-order-view";

type UpdateOrderStatusButtonProps = {
  orderId: string;
  currentStatus: string;
  totalAmount: number;
  canAdvanceStatus?: boolean;
  canCancelOrder?: boolean;
  canServeAndPay?: boolean;
  diningType?: string;
  onServed?: () => void;
};

type OrderAction = {
  status: string;
  label: string;
  loadingLabel: string;
  color: string;
};

const nextStatus: Record<string, OrderAction> = {
  confirmed: {
    status: "preparing",
    label: "เริ่มทำอาหาร",
    loadingLabel: "กำลังดำเนินการ…",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  preparing: {
    status: "ready",
    label: "อาหารพร้อมเสิร์ฟ",
    loadingLabel: "กำลังดำเนินการ…",
    color: "bg-green-500 hover:bg-green-600",
  },
};

export default function UpdateOrderStatusButton({
  orderId,
  currentStatus,
  totalAmount,
  canAdvanceStatus = true,
  canCancelOrder = true,
  canServeAndPay = false,
  diningType,
  onServed,
}: UpdateOrderStatusButtonProps) {
  const router = useRouter();
  const refreshView = useOrderViewRefresh();
  const supabase = createClient();

  const [mutating, setIsUpdating] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const locked = useRef(false);
  const isUpdating = mutating || refreshing;
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const action = currentStatus === "ready" && canServeAndPay
    ? { status: "served", label: diningType === "takeaway" ? "ส่งมอบแล้ว" : "เสิร์ฟแล้ว", loadingLabel: "กำลังดำเนินการ…", color: "bg-green-600 hover:bg-green-700" }
    : canAdvanceStatus ? nextStatus[currentStatus] : undefined;
  const canCancel = canCancelOrder && currentStatus === "confirmed";

  function begin() {
    if (locked.current || isUpdating) return false;
    locked.current = true;
    setIsUpdating(true); setErrorMessage("");
    window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: true } }));
    return true;
  }
  function finish() {
    locked.current = false; setIsUpdating(false);
    window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: false } }));
  }
  async function refresh() {
    if (refreshView) await refreshView();
    else startTransition(() => router.refresh());
  }

  const updateStatus = async () => {
    if (!action || !begin()) return;
    try {
    const { error } = action.status === "served"
      ? await supabase.rpc("serve_order", { p_order_id: orderId })
      : await supabase.rpc("advance_order_status", {
      p_order_id: orderId, p_expected: currentStatus, p_next: action.status,
    });

    if (error) {
      setErrorMessage(error.code === "P0001" ? "สถานะออเดอร์เปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่" : "เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่");
      if (error.code === "P0001") await refresh();
      return;
    }

    if (action.status === "served") onServed?.();
    await refresh();
    } catch { setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสถานะก่อนลองใหม่"); }
    finally { finish(); }
  };

  const cancelOrder = async () => {
    if (isUpdating) return;

    const confirmed = window.confirm(
      "ยืนยันว่าต้องการยกเลิกออเดอร์นี้หรือไม่?",
    );

    if (!confirmed) return;

    if (!begin()) return;

    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
      };

      if (!response.ok) {
        setErrorMessage(
          result.error || result.details || "ไม่สามารถยกเลิกออเดอร์ได้",
        );
        return;
      }

      await refresh();
    } catch {
      setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      finish();
    }
  };

  const receivePayment = async (paymentMethod: "cash" | "qr_code") => {
    if (!begin()) return;
    try {
    const { error } = await supabase.rpc("complete_order_payment", {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
    });

    if (error) {
      setErrorMessage("รับชำระเงินไม่สำเร็จ กรุณาตรวจสถานะออเดอร์แล้วลองใหม่");
      if (error.code === "P0001") await refresh();
      return;
    }

    setShowPaymentOptions(false);
    await refresh();
    } catch { setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจรายการชำระเงินก่อนลองใหม่"); }
    finally { finish(); }
  };

  if (currentStatus === "served" && canServeAndPay) {
    return (
      <div>
        {!showPaymentOptions ? (
          <button
            type="button"
            onClick={() => {
              setErrorMessage("");
              setShowPaymentOptions(true);
            }}
            disabled={isUpdating}
            className="w-full rounded-xl bg-zinc-800 px-4 py-3 font-semibold text-white transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            รับชำระเงิน
          </button>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="font-semibold text-zinc-900">เลือกช่องทางชำระเงิน</p>

            <p className="mt-1 text-sm text-zinc-600">
              ยอดชำระ ฿
              {Number(totalAmount).toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => receivePayment("cash")}
                disabled={isUpdating}
                className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? "กำลังดำเนินการ…" : "เงินสด"}
              </button>

              <button
                type="button"
                onClick={() => receivePayment("qr_code")}
                disabled={isUpdating}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? "กำลังดำเนินการ…" : "QR Code"}
              </button>

              <button
                type="button"
                onClick={() => setShowPaymentOptions(false)}
                disabled={isUpdating}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ย้อนกลับ
              </button>
            </div>
          </div>
        )}

        {errorMessage && (
          <p className="mt-2 text-sm text-red-600">
            ไม่สามารถรับชำระเงินได้: {errorMessage}
          </p>
        )}
      </div>
    );
  }

  if (!action && !canCancel) return null;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {action && <button
          type="button"
          onClick={updateStatus}
          disabled={isUpdating}
          className={`w-full rounded-xl px-4 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${action.color}`}
        >
          {isUpdating ? action.loadingLabel : action.label}
        </button>}

        {canCancel && (
          <button
            type="button"
            onClick={cancelOrder}
            disabled={isUpdating}
            className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isUpdating ? "กำลังดำเนินการ…" : "ยกเลิกออเดอร์"}
          </button>
        )}
      </div>

      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">
          ไม่สามารถดำเนินการได้: {errorMessage}
        </p>
      )}
    </div>
  );
}
