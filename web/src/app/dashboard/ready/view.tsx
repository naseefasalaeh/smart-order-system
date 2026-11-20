"use client";
import { useCallback, useState } from "react";
import ReadyPlateAlerts from "@/components/ready-plate-alerts";
import ServePlateButton from "@/components/serve-plate-button";
import PlateProgress from "@/components/plate-progress";
import { pendingPlates, orderDisplayStatus } from "@/lib/plate-progress";
import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { OrderViewRefresh, OrderViewRetry, useLiveOrderView } from "@/components/live-order-view";
import type { ShopRole } from "@/lib/dashboard-auth";
import { loadReadyOrders } from "@/lib/order-views";
import { formatOrderNumber } from "@/lib/order-number";

const allowed: ShopRole[] = ["staff"];

export default function OrdersView({
  initial,
  userId,
  fullName,
  role,
}: {
  initial: Awaited<ReturnType<typeof loadReadyOrders>>;
  userId: string;
  fullName: string;
  role: ShopRole;
}) {
  const load = loadReadyOrders;
  const { data, refresh, refreshAfterMutation, error: liveError } = useLiveOrderView(
    initial,
    userId,
    role,
    allowed,
    load
  );
  const { orders, error } = data;
  const visibleOrders = orders;
  const [newPlates, setNewPlates] = useState<Set<string>>(() => new Set());
  const markNew = useCallback(
    (keys: string[]) => setNewPlates((previous) => new Set([...previous, ...keys])),
    []
  );

  const totalReadyPlates = visibleOrders
    ? visibleOrders.reduce(
        (sum, o) =>
          sum + o.order_items.reduce((s, item) => s + pendingPlates(item).length, 0),
        0
      )
    : 0;

  return (
    <OrderViewRefresh.Provider value={refreshAfterMutation}>
      <main className="min-h-screen bg-orange-50 text-zinc-900 lg:flex">
        <OrderRealtimeRefresh
          onRefresh={refresh}
          channelName="staff-ready-orders"
          fallbackIntervalMs={5_000}
          pollWhenSubscribed
        />
        <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/ready" />
        <section className="min-w-0 flex-1 p-6 sm:p-8">
          <div className="mx-auto max-w-7xl">
            {liveError && (
              <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">
                {liveError}
                <OrderViewRetry refresh={refresh} />
              </div>
            )}
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-orange-600">ติดตามอาหารจากครัว</p>
                <h2 className="mt-1 text-3xl font-black tracking-tight text-zinc-900">พร้อมเสิร์ฟ</h2>
                <p className="mt-1.5 text-sm text-zinc-600">
                  จานที่ครัวทำเสร็จแล้ว ยืนยันเสิร์ฟทีละจานได้ทันที โดยไม่ต้องรอครบทั้งออเดอร์
                </p>
              </div>
              {visibleOrders && visibleOrders.length > 0 && totalReadyPlates > 0 && (
                <span className="inline-flex items-center gap-2 rounded-xl bg-orange-100/90 px-3.5 py-2 text-sm font-bold text-orange-800 self-start sm:self-auto shadow-xs border border-orange-200/60">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-600"></span>
                  </span>
                  <span>รอเสิร์ฟ {totalReadyPlates} จาน</span>
                </span>
              )}
            </header>

            {/* Sound Notification Alert Panel */}
            <ReadyPlateAlerts
              orders={orders ?? []}
              valid={!error}
              onNew={markNew}
              userId={userId}
            />

            {error ? (
              <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm border border-red-200">
                <p className="font-semibold">โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่</p>
                <OrderViewRetry refresh={refresh} />
              </div>
            ) : !visibleOrders?.length ? (
              /* Enhanced Empty State */
              <section
                aria-label="สถานะไม่มีออเดอร์พร้อมเสิร์ฟ"
                className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-8 sm:p-12 text-center shadow-sm"
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-500 mb-4 shadow-xs border border-orange-100/80">
                  {/* Serving Cloche / Plate Icon */}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-8 w-8"
                    aria-hidden="true"
                  >
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    <path d="M2 8c0-2.2 1.8-4 4-4" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-zinc-900">ยังไม่มีออเดอร์ที่พร้อมเสิร์ฟ</h3>
                <p className="mt-1.5 text-sm text-zinc-500 max-w-sm mx-auto">
                  เมื่อมีออเดอร์ที่พร้อมเสิร์ฟ รายการจะแสดงที่นี่
                </p>
              </section>
            ) : (
              <section aria-label="ออเดอร์พร้อมเสิร์ฟ" className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {visibleOrders.map((order) => {
                  const table = Array.isArray(order.restaurant_tables)
                    ? order.restaurant_tables[0]
                    : order.restaurant_tables;
                  return (
                    <article key={order.id} className="min-w-0 rounded-2xl bg-white p-6 shadow-sm border border-zinc-200/70">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
                        <div>
                          <p className="text-sm font-semibold text-orange-600">
                            ออเดอร์ {formatOrderNumber(order.order_number)}
                          </p>
                          <h3 className="mt-1 text-xl font-bold">
                            {order.dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${table?.table_number ?? "-"}`}
                          </h3>
                        </div>
                        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">
                          {orderDisplayStatus(order) === "partially_served"
                            ? "เสิร์ฟแล้วบางส่วน"
                            : "พร้อมเสิร์ฟ"}
                        </span>
                      </div>
                      <p className="mt-4 text-sm font-medium text-green-800">
                        ทำเสร็จรอเสิร์ฟ{" "}
                        {order.order_items.reduce((sum, item) => sum + pendingPlates(item).length, 0)} จาน
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        สั่งเมื่อ{" "}
                        {new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                      </p>
                      <ul className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
                        {order.order_items?.map((item) => {
                          const menu = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                          const isNew = pendingPlates(item).some((plate) =>
                            newPlates.has(`${order.id}:${item.id}:${plate}`)
                          );
                          return (
                            <li
                              key={item.id}
                              className={`min-w-0 ${
                                isNew ? "rounded-xl bg-amber-50 p-3 ring-2 ring-amber-400" : ""
                              }`}
                            >
                              {isNew && (
                                <p className="text-sm font-semibold text-amber-800">พร้อมเสิร์ฟใหม่</p>
                              )}
                              <p className="break-words font-semibold">
                                {item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู"}{" "}
                                <span className="whitespace-nowrap text-orange-700">× {item.quantity}</span>
                              </p>
                              {item.order_item_options?.map((option) => (
                                <p key={option.id} className="mt-1 text-sm text-orange-700">
                                  {option.option_name} × {option.quantity} ต่อจาน
                                </p>
                              ))}
                              <PlateProgress item={item} status={order.status} />
                              <div className="mt-3 flex flex-wrap gap-2">
                                {pendingPlates(item).map((plate) => (
                                  <ServePlateButton
                                    key={plate}
                                    itemId={item.id}
                                    plate={plate}
                                    takeaway={order.dining_type === "takeaway"}
                                  />
                                ))}
                              </div>
                              {item.note && (
                                <p className="mt-1 text-sm text-zinc-600">หมายเหตุ: {item.note}</p>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      {order.note && (
                        <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">
                          หมายเหตุออเดอร์: {order.note}
                        </p>
                      )}
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
