"use client";
import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { OrderViewRefresh, OrderViewRetry, useLiveOrderView } from "@/components/live-order-view";
import type { ShopRole } from "@/lib/dashboard-auth";
import UpdateOrderStatusButton from "@/components/update-order-status-button";
import Link from "next/link";
import { useCallback } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOrders } from "@/lib/order-views";
const statusLabels: Record<string, string> = {
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  served: "เสิร์ฟแล้ว รอชำระเงิน",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  served: "bg-amber-100 text-amber-800",
  completed: "bg-zinc-100 text-zinc-700",
  cancelled: "bg-red-100 text-red-700",
};

const allowed: ShopRole[] = ["admin", "staff"];
export default function OrdersView({ initial, userId, role, status, date }: { initial: Awaited<ReturnType<typeof loadOrders>>; userId: string; role: ShopRole; status?: string; date?: string; }) {
  const load = useCallback((db: SupabaseClient) => loadOrders(db, status, date), [status, date]);
  const { data, refresh, refreshAfterMutation, error: liveError } = useLiveOrderView(initial, userId, role, allowed, load);
  const { orders, activeStatus, isHistory, visibleFilters, selectedDay, dayLabel, daySales, error } = data;
  const canAdvanceStatus = role === "admin";
  return (
    <OrderViewRefresh.Provider value={refreshAfterMutation}>
    <main className="min-h-screen bg-orange-50 lg:flex">
      <OrderRealtimeRefresh onRefresh={refresh}
        channelName={`staff-orders:${activeStatus || "current"}`}
        fallbackIntervalMs={5_000} pollWhenSubscribed
      />

      <DashboardSidebar role={role} activePath="/dashboard/orders" />

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {liveError && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{liveError}<OrderViewRetry refresh={refresh} /></div>}
          <header>
            <p className="font-semibold text-orange-500">
              จัดการรายการสั่งอาหาร
            </p>

            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              {isHistory ? "ประวัติออเดอร์" : "ออเดอร์ปัจจุบัน"}
            </h2>

            <p className="mt-2 text-zinc-600">
              {isHistory
                ? "ดูรายการที่ชำระเงินเสร็จแล้วและรายการที่ถูกยกเลิก"
                : "ตรวจสอบและติดตามสถานะออเดอร์ของลูกค้า"}
            </p>
          </header>

          <div className="mt-8 flex flex-wrap gap-3 border-b border-orange-200 pb-4">
            <Link
              href="/dashboard/orders"
              className={`rounded-xl px-4 py-2 font-semibold transition ${
                !isHistory
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 shadow-sm hover:bg-orange-100"
              }`}
            >
              ออเดอร์ปัจจุบัน
            </Link>

            <Link
              href="/dashboard/orders?status=history"
              className={`rounded-xl px-4 py-2 font-semibold transition ${
                isHistory
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 shadow-sm hover:bg-orange-100"
              }`}
            >
              ประวัติออเดอร์
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {visibleFilters.map((item) => {
              const isActive = activeStatus === item.value;

              return (
                <Link
                  key={item.label}
                  href={
                    item.value
                       ? `/dashboard/orders?status=${item.value}${isHistory ? `&date=${selectedDay}` : ""}`
                      : "/dashboard/orders"
                  }
                  className={`rounded-xl px-4 py-2 font-medium transition ${
                    isActive
                      ? "bg-orange-500 text-white"
                      : "bg-white text-zinc-600 shadow-sm hover:bg-orange-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {isHistory && (
            <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm">
              <form className="flex flex-wrap items-end gap-3" action="/dashboard/orders">
                <input type="hidden" name="status" value={activeStatus} />
                <label className="font-medium text-zinc-700">เลือกวันที่
                  <input type="date" name="date" defaultValue={selectedDay} className="ml-3 rounded-lg border border-zinc-300 px-3 py-2" />
                </label>
                <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">ดูประวัติ</button>
              </form>
              <p className="mt-3 font-semibold text-zinc-800">{dayLabel}: {orders?.length ?? 0} ออเดอร์ · ยอดขายที่ชำระแล้ว {daySales.toLocaleString("th-TH")} บาท</p>
            </div>
          )}

          {error ? (
            <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดประวัติออเดอร์ได้ กรุณาลองใหม่
              <OrderViewRetry refresh={refresh} />
            </div>
          ) : !orders || orders.length === 0 ? (
            <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center">
                <p className="font-medium text-zinc-600">
                  {activeStatus && activeStatus !== "history"
                    ? `ไม่มีออเดอร์สถานะ ${
                        statusLabels[activeStatus] ?? activeStatus
                      }`
                    : isHistory
                      ? "ยังไม่มีประวัติออเดอร์"
                      : "ยังไม่มีออเดอร์ที่กำลังดำเนินการ"}
                </p>
              </div>
            </section>
          ) : (
            <div className="mt-6 space-y-5">
              {orders.map((order) => {
                const table = Array.isArray(order.restaurant_tables)
                  ? order.restaurant_tables[0]
                  : order.restaurant_tables;

                return (
                  <article
                    key={order.id}
                    className="overflow-hidden rounded-2xl bg-white shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-100 p-6">
                      <div>
                        <p className="text-sm text-zinc-500">
                          ออเดอร์ #{order.order_number}
                        </p>

                        <h3 className="mt-1 text-xl font-bold text-zinc-900">
                          {order.dining_type === "takeaway" ? "กลับบ้าน (Takeaway)" : `ทานที่ร้าน · โต๊ะ ${table?.table_number ?? "-"}`}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-400">
                          {new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-sm font-semibold ${
                          statusColors[order.status] ??
                          "bg-zinc-100 text-zinc-700"
                        }`}
                      >
                        {statusLabels[order.status] ?? order.status}
                      </span>
                    </div>

                    <div className="p-6">
                      {order.status === "served" && <p className="mb-4 text-sm text-amber-800">
                        {order.dining_type === "takeaway" ? "ส่งมอบอาหารเมื่อ" : "เสิร์ฟเมื่อ"} {order.served_at ? new Date(order.served_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "ไม่พบเวลาที่บันทึก"}
                      </p>}
                      {order.order_items && order.order_items.length > 0 ? (
                        <div className="space-y-3">
                          {order.order_items.map((item) => {
                            const menu = Array.isArray(item.menus)
                              ? item.menus[0]
                              : item.menus;

                            return (
                              <div
                                key={item.id}
                                className="flex items-start justify-between gap-4"
                              >
                                <div>
                                  <p className="font-medium text-zinc-800">
                                    {item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู"} ×{" "}
                                    {item.quantity}
                                  </p>

                                  {item.order_item_options?.map((option) => (
                                    <p key={option.id} className="mt-1 text-sm text-orange-600">
                                      {option.option_name} × {option.quantity} ต่อจาน
                                    </p>
                                  ))}

                                  {item.note && (
                                    <p className="mt-1 text-sm text-orange-600">
                                      หมายเหตุ: {item.note}
                                    </p>
                                  )}
                                </div>

                                <p className="shrink-0 font-medium text-zinc-700">
                                  {Number(item.subtotal).toLocaleString(
                                    "th-TH",
                                  )}{" "}
                                  บาท
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500">
                          ไม่พบรายการอาหารในออเดอร์นี้
                        </p>
                      )}

                      {order.note && (
                        <div className="mt-5 rounded-xl bg-orange-50 p-4 text-sm text-orange-700">
                          หมายเหตุออเดอร์: {order.note}
                        </div>
                      )}

                      <div className="mt-5 flex items-center justify-between gap-4 border-t border-zinc-100 pt-5">
                        <p className="font-semibold text-zinc-700">
                          ยอดรวมทั้งหมด
                        </p>

                        <p className="text-xl font-bold text-orange-500">
                          {Number(order.total_amount).toLocaleString("th-TH")}{" "}
                          บาท
                        </p>
                      </div>

                      {!isHistory && <UpdateOrderStatusButton
                        orderId={order.id}
                        currentStatus={order.status}
                        totalAmount={Number(order.total_amount ?? 0)}
                        canAdvanceStatus={canAdvanceStatus}
                        canServeAndPay={role === "admin" || role === "staff"}
                        diningType={order.dining_type}
                      />}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
    </OrderViewRefresh.Provider>
  );
}
