"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { collectItemPaymentAction } from "@/app/dashboard/payments/actions";
import type { loadPendingPayments } from "@/lib/order-views";
import { paidItemQuantity as paidQuantity } from "@/lib/payment-progress";
import PaymentHistory from "@/components/payment-history";
import { formatOrderNumber } from "@/lib/order-number";

type Order = Awaited<ReturnType<typeof loadPendingPayments>>["orders"][number];
const money = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function SessionPayment({
  orders,
  allOrders = [],
  refresh,
}: {
  orders: Order[];
  allOrders?: Order[];
  refresh: () => Promise<void>;
}) {
  // Available other tables/sessions with unpaid items for combined payment
  const currentSessionKey = orders[0].session_id ?? orders[0].id;
  const [combinedSessionKeys, setCombinedSessionKeys] = useState<string[]>([]);
  const [showCombineSection, setShowCombineSection] = useState(false);
  const [cashReceived, setCashReceived] = useState<string>("");

  // Group all orders by session to find candidate other tables
  const otherSessions = Array.from(
    allOrders.reduce((map, order) => {
      const key = order.session_id ?? order.id;
      if (key !== currentSessionKey) {
        const existing = map.get(key) ?? [];
        map.set(key, [...existing, order]);
      }
      return map;
    }, new Map<string, Order[]>()).entries()
  ).map(([key, sOrders]) => {
    const sTable = Array.isArray(sOrders[0].restaurant_tables)
      ? sOrders[0].restaurant_tables[0]
      : sOrders[0].restaurant_tables;
    const sTableName = sOrders[0].dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${sTable?.table_number ?? "-"}`;
    const sUnpaidItems = sOrders.flatMap(o =>
      o.order_items.map(item => Math.max(0, item.quantity - paidQuantity(item)))
    ).filter(q => q > 0);
    const sUnpaidTotalSatang = sOrders.flatMap(o =>
      o.order_items.map(item => Math.max(0, item.quantity - paidQuantity(item)) * Math.round(Number(item.unit_price) * 100))
    ).reduce((a, b) => a + b, 0);

    return {
      sessionKey: key,
      tableName: sTableName,
      orderCount: sOrders.length,
      orders: sOrders,
      unpaidItemCount: sUnpaidItems.reduce((a, b) => a + b, 0),
      unpaidTotalSatang: sUnpaidTotalSatang,
    };
  }).filter(s => s.unpaidItemCount > 0);

  // Active combined orders: this session + any checked other sessions
  const activeCombinedOrders = [
    ...orders,
    ...otherSessions.filter(s => combinedSessionKeys.includes(s.sessionKey)).flatMap(s => s.orders),
  ];

  // Default to selecting all remaining unpaid plates on load
  const [selected, setSelected] = useState<Record<number, number>>(() => {
    return Object.fromEntries(
      activeCombinedOrders.flatMap(order =>
        order.order_items.map(item => [
          item.id,
          Math.max(0, item.quantity - paidQuantity(item)),
        ])
      )
    );
  });

  function handleToggleCombinedSession(sKey: string, sOrders: Order[]) {
    const isChecked = combinedSessionKeys.includes(sKey);
    if (isChecked) {
      setCombinedSessionKeys(prev => prev.filter(k => k !== sKey));
    } else {
      setCombinedSessionKeys(prev => [...prev, sKey]);
      setSelected(prev => {
        const updated = { ...prev };
        for (const order of sOrders) {
          for (const item of order.order_items) {
            const rem = Math.max(0, item.quantity - paidQuantity(item));
            if (rem > 0) updated[item.id] = rem;
          }
        }
        return updated;
      });
    }
  }
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const locked = useRef(false);
  const attempt = useRef<{
    id: string;
    method: string;
    items: { item_id: number; quantity: number }[];
    totalSatang?: number;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [retryTotal, setRetryTotal] = useState(0);
  const [restoring, setRestoring] = useState(true);
  const storageKey = `smart-order-payment:${orders[0].session_id ?? orders[0].id}`;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const request = JSON.parse(saved);
          if (
            typeof request.id === "string" &&
            ["cash", "qr_code"].includes(request.method) &&
            Array.isArray(request.items)
          ) {
            attempt.current = request;
            setRetryTotal(Number(request.totalSatang) || 0);
            setUncertain(true);
          }
        }
      } catch {
        /* New requests check storage before sending. */
      }
      setRestoring(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const table = Array.isArray(orders[0].restaurant_tables)
    ? orders[0].restaurant_tables[0]
    : orders[0].restaurant_tables;

  const lines = activeCombinedOrders.flatMap(order => {
    const orderTable = Array.isArray(order.restaurant_tables)
      ? order.restaurant_tables[0]
      : order.restaurant_tables;
    const tableName =
      order.dining_type === "takeaway"
        ? "กลับบ้าน"
        : `โต๊ะ ${orderTable?.table_number ?? "-"}`;
    return order.order_items.map(item => ({
      order,
      item,
      tableName,
      remaining: Math.max(0, item.quantity - paidQuantity(item)),
    }));
  });

  const unpaidLines = lines.filter(line => line.remaining > 0);
  const isAllSelected =
    unpaidLines.length > 0 &&
    unpaidLines.every(line => (selected[line.item.id] ?? 0) === line.remaining);

  const outstanding = lines.reduce(
    (sum, line) =>
      sum + Math.round(Number(line.item.unit_price) * 100) * line.remaining,
    0
  );

  const items = lines.flatMap(({ item, remaining }) => {
    const quantity = Math.min(remaining, selected[item.id] ?? 0);
    return quantity > 0 ? [{ item_id: item.id, quantity }] : [];
  });

  const total = items.reduce(
    (sum, line) =>
      sum +
      Math.round(
        Number(lines.find(x => x.item.id === line.item_id)!.item.unit_price) * 100
      ) *
        line.quantity,
    0
  );

  const displayTotal = uncertain ? retryTotal : total;
  const remainingBalance = Math.max(0, outstanding - total);

  // Cash change calculator
  const cashAmount = parseFloat(cashReceived) || 0;
  const displayTotalBaht = displayTotal / 100;
  const changeAmount = cashAmount - displayTotalBaht;

  function handleToggleSelectAll() {
    if (isAllSelected) {
      setSelected({});
    } else {
      setSelected(
        Object.fromEntries(unpaidLines.map(line => [line.item.id, line.remaining]))
      );
    }
  }

  function handleToggleItem(itemId: number, remaining: number) {
    if (remaining <= 0) return;
    setSelected(prev => {
      const currentQty = prev[itemId] ?? 0;
      return {
        ...prev,
        [itemId]: currentQty > 0 ? 0 : remaining,
      };
    });
  }

  function handleStepQuantity(itemId: number, remaining: number, delta: number) {
    if (remaining <= 0) return;
    setSelected(prev => {
      const currentQty = prev[itemId] ?? 0;
      const nextQty = Math.max(0, Math.min(remaining, currentQty + delta));
      return {
        ...prev,
        [itemId]: nextQty,
      };
    });
  }

  async function collect(method: "cash" | "qr_code") {
    if (locked.current || restoring || (!items.length && !attempt.current)) return;
    locked.current = true;
    setPending(true);
    setMessage("");
    attempt.current ??= { id: crypto.randomUUID(), method, items, totalSatang: total };
    const current = attempt.current;
    setRetryTotal(current.totalSatang ?? total);
    window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: true } }));
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(current));

      let paidSatang = 0;
      let rpcResult: { payment_id: string; amount_satang: number } | null = null;
      let rpcError: { code?: string; message?: string } | null = null;

      try {
        const { data, error } = await createClient().rpc("collect_item_payment", {
          p_request_id: current.id,
          p_method: current.method,
          p_items: current.items,
        });
        rpcResult = data;
        rpcError = error;
      } catch (err: unknown) {
        rpcError = { message: err instanceof Error ? err.message : String(err) };
      }

      if (!rpcError && rpcResult) {
        paidSatang = Number(rpcResult.amount_satang);
      } else if (
        rpcError?.message?.includes("DIFFERENT_DINING_SESSION") ||
        (combinedSessionKeys.length > 0 && rpcError)
      ) {
        // Fallback: RPC threw DIFFERENT_DINING_SESSION or failed for combined tables.
        // Execute multi-table payment via Server Action using Supabase service role directly.
        console.warn("[SessionPayment] RPC error on combined payment. Executing fallback via Server Action...", rpcError);
        const actionRes = await collectItemPaymentAction({
          requestId: current.id,
          method: current.method as "cash" | "qr_code",
          items: current.items,
        });

        if (!actionRes.success || !actionRes.data) {
          console.error("Payment collection error (Server Action):", actionRes.error, actionRes.code);
          if (["P0001", "22023", "42501", "INVALID_ITEMS", "ITEM_NOT_FOUND", "ORDER_NOT_SERVED", "ITEM_ALREADY_PAID"].includes(actionRes.code || "")) {
            attempt.current = null;
            sessionStorage.removeItem(storageKey);
            setUncertain(false);
          } else {
            setUncertain(true);
          }
          setMessageType("error");
          setMessage(`รับชำระไม่สำเร็จ: ${actionRes.error || "กรุณาตรวจยอดล่าสุด หากการเชื่อมต่อขัดข้องให้ลองรายการเดิมอีกครั้ง"}`);
          await refresh();
          return;
        }

        paidSatang = Number(actionRes.data.amount_satang);
      } else {
        console.error("Payment collection error (RPC):", rpcError);
        if (["P0001", "22023", "42501"].includes(rpcError?.code || "")) {
          attempt.current = null;
          sessionStorage.removeItem(storageKey);
          setUncertain(false);
        } else {
          setUncertain(true);
        }
        setMessageType("error");
        setMessage(`รับชำระไม่สำเร็จ: ${rpcError?.message || "กรุณาตรวจยอดล่าสุด หากการเชื่อมต่อขัดข้องให้ลองรายการเดิมอีกครั้ง"}`);
        await refresh();
        return;
      }

      attempt.current = null;
      sessionStorage.removeItem(storageKey);
      activeCombinedOrders.forEach(o => {
        sessionStorage.removeItem(`smart-order-payment:${o.session_id ?? o.id}`);
      });
      setUncertain(false);
      setSelected({});
      setCashReceived("");

      setMessageType("success");
      const newRemaining = Math.max(0, outstanding - paidSatang);
      if (newRemaining > 0) {
        setMessage(`ชำระแล้ว ฿${money(paidSatang)} (ยอดคงเหลือที่ต้องชำระอีก ฿${money(newRemaining)})`);
      } else {
        setMessage(`ชำระแล้ว ฿${money(paidSatang)} (ชำระครบถ้วนแล้ว)`);
      }
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "กดลองรายการเดิมเพื่อยืนยันผล ห้ามรับเงินซ้ำ";
      console.error("Payment collection exception:", err);
      setUncertain(Boolean(attempt.current));
      setMessageType("error");
      setMessage(`การเชื่อมต่อขัดข้อง: ${message}`);
      await refresh().catch(() => {});
    } finally {
      locked.current = false;
      setPending(false);
      window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: false } }));
    }
  }

  return (
    <section className="mt-6 rounded-2xl bg-white p-5 sm:p-6 shadow-sm border border-orange-100/60">
      {/* Header: Table title, Order list, Pill button */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900">
              {orders[0].dining_type === "takeaway"
                ? "กลับบ้าน"
                : `โต๊ะ ${table?.table_number ?? "-"}`}
            </h3>
            {combinedSessionKeys.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">
                + รวมกับอีก {combinedSessionKeys.length} โต๊ะ
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <span className="font-medium text-zinc-600">
              ออเดอร์: {activeCombinedOrders.map(o => formatOrderNumber(o.order_number)).join(", ")}
            </span>
            {orders[0].session_id && (
              <span
                className="cursor-help text-zinc-400 hover:text-zinc-600"
                title={`Session ID: ${orders[0].session_id}`}
              >
                ⓘ
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={pending || restoring || uncertain || unpaidLines.length === 0}
          aria-label={isAllSelected ? "ล้างที่เลือก" : "เลือกทั้งหมดที่ค้างในรอบนี้"}
          onClick={handleToggleSelectAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3.5 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        >
          {isAllSelected ? "ล้างที่เลือก" : "✓ เลือกทั้งหมด"}
        </button>
      </div>

      {/* Combined Table Selector Section */}
      {otherSessions.length > 0 && (
        <div className="my-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 sm:p-4">
          <button
            type="button"
            onClick={() => setShowCombineSection(prev => !prev)}
            className="flex w-full items-center justify-between text-left font-semibold text-zinc-800 hover:text-orange-600 transition cursor-pointer"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                +
              </span>
              <span className="text-sm sm:text-base">รวมบิลกับโต๊ะอื่น ({otherSessions.length} โต๊ะที่มียอดค้าง)</span>
              {combinedSessionKeys.length > 0 && (
                <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white font-medium">
                  เลือกแล้ว {combinedSessionKeys.length} โต๊ะ
                </span>
              )}
            </div>
            <span className="text-xs sm:text-sm text-zinc-500">
              {showCombineSection ? "▲ ซ่อน" : "▼ แสดงรายการโต๊ะ"}
            </span>
          </button>

          {showCombineSection && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-zinc-200">
              {otherSessions.map(os => {
                const isChecked = combinedSessionKeys.includes(os.sessionKey);
                return (
                  <label
                    key={os.sessionKey}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border text-sm cursor-pointer transition select-none ${
                      isChecked
                        ? "border-orange-300 bg-orange-50/80 font-medium text-orange-950"
                        : "border-zinc-200 bg-white hover:border-zinc-300 text-zinc-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleCombinedSession(os.sessionKey, os.orders)}
                        className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                      />
                      <span className="font-bold text-zinc-900">{os.tableName}</span>
                    </div>
                    <div className="text-right text-xs">
                      <span className="text-zinc-500">{os.unpaidItemCount} รายการ · </span>
                      <span className="font-semibold text-orange-600">฿{money(os.unpaidTotalSatang)}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Item rows */}
      <ul className="divide-y divide-zinc-100">
        {lines.map(({ item, remaining, tableName }) => {
          const isCompleted = remaining === 0;
          const currentQty = isCompleted ? 0 : Math.min(remaining, selected[item.id] ?? 0);
          const isSelected = currentQty > 0;
          const optionsText = item.order_item_options
            ?.map(opt => `${opt.option_name}${opt.quantity > 1 ? ` ×${opt.quantity}` : ""}`)
            .join(", ");
          const paid = paidQuantity(item);

          return (
            <li
              key={item.id}
              className={`flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors ${
                isCompleted
                  ? "bg-zinc-50/60 rounded-xl px-2 my-1"
                  : isSelected
                  ? "bg-orange-50/20"
                  : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="pt-0.5">
                  <input
                    type="checkbox"
                    checked={isCompleted ? true : isSelected}
                    disabled={isCompleted || pending || restoring || uncertain}
                    onChange={() => handleToggleItem(item.id, remaining)}
                    aria-label={`เลือก ${item.menu_name_snapshot ?? "อาหาร"}`}
                    className={`h-5 w-5 rounded border-zinc-300 ${
                      isCompleted
                        ? "text-emerald-600 focus:ring-emerald-500 cursor-not-allowed opacity-60"
                        : "text-orange-600 focus:ring-orange-500 cursor-pointer disabled:cursor-not-allowed"
                    }`}
                  />
                </div>
                <div>
                  <div className={`flex flex-wrap items-baseline gap-1.5 ${isCompleted ? "opacity-60" : ""}`}>
                    <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                      {tableName}
                    </span>
                    <span className={`font-semibold ${isCompleted ? "text-zinc-500 line-through" : "text-zinc-900"}`}>
                      {item.menu_name_snapshot ?? "อาหาร"}
                    </span>
                    {optionsText && (
                      <span className={`text-xs font-normal ${isCompleted ? "text-zinc-400 line-through" : "text-zinc-500"}`}>
                        ({optionsText})
                      </span>
                    )}
                  </div>
                  <div className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${isCompleted ? "text-zinc-400 opacity-60" : "text-zinc-500"}`}>
                    <span className={`font-medium ${isCompleted ? "line-through text-zinc-500" : "text-zinc-700"}`}>
                      ฿{money(Math.round(Number(item.unit_price) * 100))} / จาน
                    </span>
                    <span>·</span>
                    {isCompleted ? (
                      <span className="font-medium text-emerald-700">ชำระครบแล้ว ({paid}/{item.quantity} จาน)</span>
                    ) : (
                      <>
                        <span>ค้าง {remaining} จาน</span>
                        {paid > 0 && (
                          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 border border-amber-200">
                            จ่ายแล้ว {paid}/{item.quantity} จาน
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right side: Stepper or Completed Badge */}
              <div className="flex items-center justify-end pl-8 sm:pl-0">
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/80">
                    ✓ ชำระครบแล้ว
                  </span>
                ) : (
                  <div className="inline-flex items-center rounded-lg border border-zinc-200 bg-white shadow-xs">
                    <button
                      type="button"
                      disabled={pending || restoring || uncertain || currentQty <= 0}
                      onClick={() => handleStepQuantity(item.id, remaining, -1)}
                      aria-label={`ลดจำนวน ${item.menu_name_snapshot ?? "อาหาร"}`}
                      className="flex h-9 w-9 items-center justify-center rounded-l-lg text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed select-none"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      step={1}
                      disabled={pending || restoring || uncertain}
                      value={currentQty}
                      onChange={event => {
                        const val = Number(event.target.value);
                        setSelected(previous => ({
                          ...previous,
                          [item.id]: Number.isInteger(val) ? Math.max(0, Math.min(remaining, val)) : 0,
                        }));
                      }}
                      className="h-9 w-12 border-x border-zinc-200 text-center font-semibold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-orange-500 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      disabled={pending || restoring || uncertain || currentQty >= remaining}
                      onClick={() => handleStepQuantity(item.id, remaining, 1)}
                      aria-label={`เพิ่มจำนวน ${item.menu_name_snapshot ?? "อาหาร"}`}
                      className="flex h-9 w-9 items-center justify-center rounded-r-lg text-lg font-bold text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer disabled:cursor-not-allowed select-none"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Card Footer: Large Total & Action Buttons */}
      <div className="mt-5 border-t border-zinc-100 pt-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              ยอดชำระครั้งนี้
            </span>
            <div className="mt-0.5 text-3xl sm:text-4xl font-black text-orange-600 tracking-tight">
              ฿{money(displayTotal)}
            </div>
          </div>
          <div className="text-sm text-zinc-600 sm:text-right">
            {uncertain ? (
              <span className="font-medium text-amber-700">
                ค้างตามข้อมูลล่าสุด ฿{money(outstanding)} (รอยืนยันผลรายการเดิม)
              </span>
            ) : (
              <div>
                <span>คงเหลือหลังจ่าย </span>
                <span className="font-bold text-zinc-900">฿{money(remainingBalance)}</span>
                {remainingBalance === 0 && total > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
                    ชำระครบถ้วน
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Cash change calculator */}
        <div className="mt-4 rounded-xl bg-orange-50/50 p-3.5 border border-orange-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="cash-received" className="text-xs sm:text-sm font-semibold text-zinc-700 whitespace-nowrap">
                รับเงินสดมา (บาท):
              </label>
              <input
                id="cash-received"
                type="number"
                min={0}
                placeholder={money(displayTotal)}
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                className="w-28 sm:w-32 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm font-bold text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              <div className="flex items-center gap-1">
                {[100, 500, 1000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setCashReceived(String(val))}
                    className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 transition cursor-pointer"
                  >
                    ฿{val}
                  </button>
                ))}
                {cashReceived && (
                  <button
                    type="button"
                    onClick={() => setCashReceived("")}
                    className="text-xs text-zinc-400 hover:text-zinc-600 px-1 cursor-pointer"
                  >
                    ล้าง
                  </button>
                )}
              </div>
            </div>
            {cashAmount > 0 && (
              <div className="text-left sm:text-right">
                {changeAmount >= 0 ? (
                  <div className="text-sm">
                    <span className="text-zinc-600">เงินทอน: </span>
                    <span className="text-lg font-black text-emerald-600">
                      ฿{changeAmount.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-red-600 font-semibold">
                    ยังขาดอีก ฿{Math.abs(changeAmount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {uncertain ? (
            <button
              type="button"
              disabled={pending || restoring}
              className="w-full sm:w-auto rounded-xl bg-orange-600 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-orange-700 active:scale-98 disabled:opacity-50 cursor-pointer"
              onClick={() => void collect("cash")}
            >
              ลองรายการเดิม / ยืนยันผล
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={pending || restoring || displayTotal === 0 || !items.length}
                className="flex-1 min-w-[140px] rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-98 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
                onClick={() => void collect("cash")}
              >
                รับเงินสดแล้ว
              </button>
              <button
                type="button"
                disabled={pending || restoring || displayTotal === 0 || !items.length}
                className="flex-1 min-w-[140px] rounded-xl bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-sm hover:bg-blue-700 active:scale-98 disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer"
                onClick={() => void collect("qr_code")}
              >
                ตรวจรับ QR แล้ว
              </button>
            </>
          )}
        </div>

        {/* Payment Alert Banner */}
        {message && (
          <div
            role="status"
            className={`mt-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium border shadow-xs ${
              messageType === "success"
                ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                : "bg-red-50 text-red-900 border-red-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`font-bold ${messageType === "success" ? "text-emerald-700" : "text-red-700"}`}>
                {messageType === "success" ? "✓" : "!"}
              </span>
              <span>
                {messageType === "success" && <span className="sr-only">รับ</span>}
                {message}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="ปิดการแจ้งเตือน"
              className={`rounded-lg p-1 text-sm font-bold transition hover:bg-black/5 cursor-pointer ${
                messageType === "success" ? "text-emerald-700" : "text-red-700"
              }`}
            >
              ✕
            </button>
          </div>
        )}

        <PaymentHistory items={activeCombinedOrders.flatMap(order => order.order_items)} />
      </div>
    </section>
  );
}
