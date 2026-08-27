"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type UpdateOrderStatusButtonProps = {
  orderId: string;
  currentStatus: string;
  totalAmount: number;
};

type OrderAction = {
  status: string;
  label: string;
  loadingLabel: string;
  color: string;
};

const nextStatus: Record<string, OrderAction> = {
  pending: {
    status: "confirmed",
    label: "ยืนยันออเดอร์",
    loadingLabel: "กำลังยืนยัน...",
    color: "bg-orange-500 hover:bg-orange-600",
  },
  confirmed: {
    status: "preparing",
    label: "เริ่มทำอาหาร",
    loadingLabel: "กำลังอัปเดต...",
    color: "bg-blue-500 hover:bg-blue-600",
  },
  preparing: {
    status: "ready",
    label: "อาหารพร้อมเสิร์ฟ",
    loadingLabel: "กำลังอัปเดต...",
    color: "bg-green-500 hover:bg-green-600",
  },
};

export default function UpdateOrderStatusButton({
  orderId,
  currentStatus,
  totalAmount,
}: UpdateOrderStatusButtonProps) {
  const router = useRouter();
  const supabase = createClient();

  const [isUpdating, setIsUpdating] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const action = nextStatus[currentStatus];

  const updateStatus = async () => {
    if (!action || isUpdating) return;

    setIsUpdating(true);
    setErrorMessage("");

    const { data: updatedOrder, error } = await supabase
      .from("orders")
      .update({
        status: action.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("status", currentStatus)
      .select("id")
      .maybeSingle();

    if (error) {
      setErrorMessage(error.message);
      setIsUpdating(false);
      return;
    }

    if (!updatedOrder) {
      setErrorMessage(
        "ไม่สามารถเปลี่ยนสถานะได้ เพราะสถานะออเดอร์อาจถูกเปลี่ยนไปแล้ว",
      );
      setIsUpdating(false);
      router.refresh();
      return;
    }

    router.refresh();
    setIsUpdating(false);
  };

  const cancelOrder = async () => {
    if (isUpdating) return;

    const confirmed = window.confirm(
      "ยืนยันว่าต้องการยกเลิกออเดอร์นี้หรือไม่?",
    );

    if (!confirmed) return;

    setIsUpdating(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentStatus }),
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

      router.refresh();
    } catch {
      setErrorMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setIsUpdating(false);
    }
  };

  const receivePayment = async (paymentMethod: "cash" | "qr_code") => {
    if (isUpdating) return;

    setIsUpdating(true);
    setErrorMessage("");

    const { error } = await supabase.rpc("complete_order_payment", {
      p_order_id: orderId,
      p_payment_method: paymentMethod,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsUpdating(false);
      return;
    }

    setShowPaymentOptions(false);
    router.refresh();
    setIsUpdating(false);
  };

  if (currentStatus === "ready") {
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
                {isUpdating ? "กำลังบันทึก..." : "เงินสด"}
              </button>

              <button
                type="button"
                onClick={() => receivePayment("qr_code")}
                disabled={isUpdating}
                className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isUpdating ? "กำลังบันทึก..." : "QR Code"}
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

  if (!action) return null;

  const canCancel = ["pending", "confirmed", "preparing"].includes(
    currentStatus,
  );

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={updateStatus}
          disabled={isUpdating}
          className={`w-full rounded-xl px-4 py-3 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${action.color}`}
        >
          {isUpdating ? action.loadingLabel : action.label}
        </button>

        {canCancel && (
          <button
            type="button"
            onClick={cancelOrder}
            disabled={isUpdating}
            className="w-full rounded-xl border border-red-300 bg-white px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {isUpdating ? "กำลังดำเนินการ..." : "ยกเลิกออเดอร์"}
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