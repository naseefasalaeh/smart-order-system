"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { loadPendingPayments } from "@/lib/order-views";
import { paidItemQuantity as paidQuantity } from "@/lib/payment-progress";
import PaymentHistory from "@/components/payment-history";

type Order = Awaited<ReturnType<typeof loadPendingPayments>>["orders"][number];
const money = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SessionPayment({ orders, refresh }: { orders: Order[]; refresh: () => Promise<void> }) {
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const locked = useRef(false);
  const attempt = useRef<{ id: string; method: string; items: { item_id: number; quantity: number }[]; totalSatang?: number } | null>(null);
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
          if (typeof request.id === "string" && ["cash", "qr_code"].includes(request.method) && Array.isArray(request.items)) {
            attempt.current = request;
            setRetryTotal(Number(request.totalSatang) || 0);
            setUncertain(true);
          }
        }
      } catch { /* New requests check storage before sending. */ }
      setRestoring(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey]);
  const table = Array.isArray(orders[0].restaurant_tables) ? orders[0].restaurant_tables[0] : orders[0].restaurant_tables;
  const lines = orders.flatMap(order => order.order_items.map(item => ({ order, item, remaining: item.quantity - paidQuantity(item) })));
  const outstanding = lines.reduce((sum, line) => sum + Math.round(Number(line.item.unit_price) * 100) * line.remaining, 0);
  const items = lines.flatMap(({ item, remaining }) => {
    const quantity = Math.min(remaining, selected[item.id] ?? 0);
    return quantity > 0 ? [{ item_id: item.id, quantity }] : [];
  });
  const total = items.reduce((sum, line) => sum + Math.round(Number(lines.find(x => x.item.id === line.item_id)!.item.unit_price) * 100) * line.quantity, 0);
  const displayTotal = uncertain ? retryTotal : total;

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
      // Retain the same id across a reload following an ambiguous response.
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      const { data, error } = await createClient().rpc("collect_item_payment", {
        p_request_id: current.id, p_method: current.method, p_items: current.items,
      });
      if (error) {
        // SQL business errors are definitive rollbacks. Network errors retain
        // exactly the same request and selection until its receipt is known.
        if (["P0001", "22023", "42501"].includes(error.code)) { attempt.current = null; sessionStorage.removeItem(storageKey); setUncertain(false); }
        else setUncertain(true);
        setMessage("รับชำระไม่สำเร็จ กรุณาตรวจยอดล่าสุด หากการเชื่อมต่อขัดข้องให้ลองรายการเดิมอีกครั้ง");
        await refresh();
        return;
      }
      attempt.current = null;
      sessionStorage.removeItem(storageKey);
      setUncertain(false);
      setSelected({});
      setMessage(`รับชำระแล้ว ฿${money(Number(data.amount_satang))} เลขที่ ${data.payment_id}`);
      await refresh();
    } catch {
      setUncertain(Boolean(attempt.current));
      setMessage("การเชื่อมต่อขัดข้อง กดลองรายการเดิมเพื่อยืนยันผล ห้ามรับเงินซ้ำ");
      await refresh().catch(() => {});
    }
    finally {
      locked.current = false;
      setPending(false);
      window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: false } }));
    }
  }

  return <section className="mt-5 rounded-2xl bg-white p-6 shadow-sm">
    <p className="font-bold text-orange-700">{orders[0].dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${table?.table_number ?? "-"}`} · รอบ {orders[0].session_id?.slice(0, 8) ?? "ออเดอร์เดี่ยว"}</p>
    <h3 className="text-lg font-bold">{orders[0].session_id ? "ชำระในรอบการใช้โต๊ะเดียวกัน" : "ชำระออเดอร์นี้"} · ออเดอร์ {orders.map(o => `#${o.order_number}`).join(", ")}</h3>
    <p className="mt-1 text-sm text-zinc-600">รับชำระรายการที่เสิร์ฟครบแล้ว ราคาต่อจานรวมตัวเลือกและของเพิ่มจากตอนสั่ง</p>
    <button type="button" disabled={pending || restoring || uncertain} className="mt-3 underline" onClick={() => setSelected(Object.fromEntries(lines.map(line => [line.item.id, line.remaining])))}>เลือกทั้งหมดที่ค้างในรอบนี้</button>
    <ul className="mt-3 space-y-3">{lines.map(({ order, item, remaining }) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
      <div><p className="font-semibold">#{order.order_number} {item.menu_name_snapshot ?? "อาหาร"}</p>
        <p className="text-sm text-zinc-600">จ่ายแล้ว {paidQuantity(item)} / {item.quantity} · ค้าง {remaining} · ฿{money(Math.round(Number(item.unit_price) * 100))} ต่อจาน</p>
        {item.order_item_options.map(option => <p key={option.id} className="text-xs text-orange-700">{option.option_name} × {option.quantity} ต่อจาน</p>)}
      </div>
      <label className="text-sm">จำนวนที่จะจ่าย <input type="number" min={0} max={remaining} step={1} disabled={pending || restoring || uncertain} value={Math.min(remaining, selected[item.id] ?? 0)} className="ml-2 w-20 rounded border p-2" onChange={event => {
        const value = Number(event.target.value);
        setSelected(previous => ({ ...previous, [item.id]: Number.isInteger(value) ? Math.max(0, Math.min(remaining, value)) : 0 }));
      }} /></label>
    </li>)}</ul>
    <p className="mt-4 font-bold">ยอดครั้งนี้ ฿{money(displayTotal)} · {uncertain ? `ค้างตามข้อมูลล่าสุด ฿${money(outstanding)} (รอยืนยันผลรายการเดิม)` : `คงเหลือหลังจ่าย ฿${money(outstanding - total)}`}</p>
    <div className="mt-3 flex flex-wrap gap-3">
      {uncertain ? <button type="button" disabled={pending || restoring} className="rounded-lg bg-orange-600 px-4 py-2 text-white" onClick={() => void collect("cash")}>ลองรายการเดิม / ยืนยันผล</button> : <>
        <button type="button" disabled={pending || restoring || !items.length} className="rounded-lg bg-green-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void collect("cash")}>รับเงินสดแล้ว</button>
        <button type="button" disabled={pending || restoring || !items.length} className="rounded-lg bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void collect("qr_code")}>ตรวจรับ QR แล้ว</button>
      </>}
    </div>
    <p role="status" className="mt-3 text-sm">{message}</p>
    <PaymentHistory items={orders.flatMap(order => order.order_items)} />
  </section>;
}
