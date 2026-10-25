"use client";
import PlateProgress from "@/components/plate-progress";
import { useState } from "react";
import UpdateOrderStatusButton from "@/components/update-order-status-button";
import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { OrderViewRefresh, OrderViewRetry, useLiveOrderView } from "@/components/live-order-view";
import type { ShopRole } from "@/lib/dashboard-auth";
import { loadPendingPayments } from "@/lib/order-views";
const allowed: ShopRole[] = ["staff"];
export default function OrdersView({ initial, userId, fullName, role }: { initial: Awaited<ReturnType<typeof loadPendingPayments>>; userId: string; fullName: string; role: ShopRole;  }) {
  const load = loadPendingPayments;
  const { data, refresh, refreshAfterMutation, error: liveError } = useLiveOrderView(initial, userId, role, allowed, load);
  const { orders, error } = data;
  const [paidIds, setPaidIds] = useState<Set<string>>(() => new Set());
  const visibleOrders = orders?.filter(order => !paidIds.has(order.id));
  return (
    <OrderViewRefresh.Provider value={refreshAfterMutation}>
    <main className="min-h-screen bg-orange-50 text-zinc-900 lg:flex">
      <OrderRealtimeRefresh onRefresh={refresh} channelName="staff-pending-payments" fallbackIntervalMs={5_000} pollWhenSubscribed />
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/payments" />
      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {liveError && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{liveError}<OrderViewRetry refresh={refresh} /></div>}
          <header>
            <p className="font-semibold text-orange-500">รับชำระเงิน</p>
            <h2 className="mt-1 text-3xl font-bold">รอชำระเงิน</h2>
            <p className="mt-2 text-zinc-600">บิลที่เสิร์ฟแล้วและยังไม่ได้ชำระเงิน รับชำระแยกตามออเดอร์ เรียงตามเวลาที่เสิร์ฟก่อน</p>
          </header>

          {error ? (
            <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่<OrderViewRetry refresh={refresh} /></div>
          ) : !visibleOrders?.length ? (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-zinc-600">ไม่มีรายการรอชำระเงิน</div>
            </section>
          ) : (
            <section aria-label="รายการรอชำระเงิน" className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleOrders.map((order) => {
                const table = Array.isArray(order.restaurant_tables) ? order.restaurant_tables[0] : order.restaurant_tables;
                return (
                  <article key={order.id} className="min-w-0 overflow-hidden rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
                      <div>
                        <p className="text-sm font-semibold text-orange-600">บิลออเดอร์ #{order.order_number}</p>
                        <h3 className="mt-1 text-xl font-bold">{order.dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${table?.table_number ?? "-"}`}</h3>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">เสิร์ฟแล้ว รอชำระเงิน</span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-zinc-600">เสิร์ฟเมื่อ {new Date(order.served_at ?? order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
                    <p className="mt-1 text-xs text-zinc-500">สั่งเมื่อ {new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
                    <ul className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
                      {order.order_items?.map((item) => {
                        const menu = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                        return (
                          <li key={item.id} className="min-w-0">
                            <p className="break-words font-semibold">{item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู"} <span className="whitespace-nowrap text-orange-700">× {item.quantity}</span></p>
                            {item.order_item_options?.map((option) => <p key={option.id} className="mt-1 text-sm text-orange-700">{option.option_name} × {option.quantity} ต่อจาน</p>)}
                            <PlateProgress item={item} status="served" />
                            {item.note && <p className="mt-1 text-sm text-zinc-600">หมายเหตุ: {item.note}</p>}
                          </li>
                        );
                      })}
                    </ul>
                    {order.note && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">หมายเหตุออเดอร์: {order.note}</p>}
                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4">
                      <p className="font-semibold text-zinc-600">ยอดที่ต้องชำระ</p>
                      <p className="text-xl font-bold text-orange-600">฿{Number(order.total_amount).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    <div className="mt-4"><UpdateOrderStatusButton
                      orderId={order.id} currentStatus="served" diningType={order.dining_type}
                      totalAmount={Number(order.total_amount)} canAdvanceStatus={false} canCancelOrder={false}
                      canServeAndPay={role === "staff"}
                      onPaid={() => setPaidIds(ids => new Set(ids).add(order.id))}
                    /></div>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </section>
    </main>
    </OrderViewRefresh.Provider>
  );
}
