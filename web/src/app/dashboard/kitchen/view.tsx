"use client";
import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { OrderViewRefresh, OrderViewRetry, useLiveOrderView } from "@/components/live-order-view";
import type { ShopRole } from "@/lib/dashboard-auth";
import UpdateOrderStatusButton from "@/components/update-order-status-button";
import { loadKitchenOrders } from "@/lib/order-views";
const statusLabels: Record<string, string> = {
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
};

const allowed: ShopRole[] = ["admin", "kitchen_staff"];
export default function OrdersView({ initial, userId, role }: { initial: Awaited<ReturnType<typeof loadKitchenOrders>>; userId: string; role: ShopRole;  }) {
  const load = loadKitchenOrders;
  const { data, refresh, refreshAfterMutation, error: liveError } = useLiveOrderView(initial, userId, role, allowed, load);
  const { orders, error } = data;
  return (
    <OrderViewRefresh.Provider value={refreshAfterMutation}>
    <main className="min-h-screen bg-orange-50 lg:flex">
      <OrderRealtimeRefresh onRefresh={refresh} channelName="staff-kitchen" />

      <DashboardSidebar role={role} activePath="/dashboard/kitchen" />

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {liveError && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{liveError}<OrderViewRetry refresh={refresh} /></div>}
          <header>
            <p className="font-semibold text-orange-500">
              จัดการลำดับการทำอาหาร
            </p>

            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              คิวครัว
            </h2>

            <p className="mt-2 text-zinc-600">
              ตรวจสอบรายการอาหาร เริ่มทำ และแจ้งเมื่ออาหารพร้อมเสิร์ฟ
            </p>
          </header>

          {error ? (
            <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดคิวครัวได้ชั่วคราว กรุณาลองใหม่
              <OrderViewRetry refresh={refresh} />
            </div>
          ) : !orders || orders.length === 0 ? (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center">
                <p className="font-medium text-zinc-600">
                  ยังไม่มีออเดอร์ในคิวครัว
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  ออเดอร์จะแสดงเมื่อลูกค้าสั่งสำเร็จ
                </p>
              </div>
            </section>
          ) : (
            <div className="mt-8 grid gap-5 xl:grid-cols-2">
              {orders.map((order) => {
                const table = Array.isArray(order.restaurant_tables)
                  ? order.restaurant_tables[0]
                  : order.restaurant_tables;

                return (
                  <article
                    key={order.id}
                    className="rounded-2xl bg-white p-6 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm text-zinc-500">
                          ออเดอร์ #{order.order_number}
                        </p>

                        <h3 className="mt-1 text-2xl font-bold text-zinc-900">
                          {order.dining_type === "takeaway" ? "กลับบ้าน (Takeaway)" : `ทานที่ร้าน · โต๊ะ ${table?.table_number ?? "-"}`}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-400">
                          {new Date(order.created_at).toLocaleString("th-TH", {
                            timeZone: "Asia/Bangkok",
                          })}
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

                    <div className="mt-6 space-y-4 border-t border-zinc-100 pt-5">
                      {order.order_items?.map((item) => {
                        const menu = Array.isArray(item.menus)
                          ? item.menus[0]
                          : item.menus;

                        return (
                          <div key={item.id}>
                            <p className="font-semibold text-zinc-800">
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
                        );
                      })}
                    </div>

                    {order.note && (
                      <div className="mt-5 rounded-xl bg-orange-50 p-4 text-sm text-orange-700">
                        หมายเหตุออเดอร์: {order.note}
                      </div>
                    )}

                    {order.status !== "ready" ? (
                      <UpdateOrderStatusButton
                        orderId={order.id}
                        currentStatus={order.status}
                        totalAmount={Number(order.total_amount ?? 0)}
                        canCancelOrder={role === "admin"}
                      />
                    ) : (
                      <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-700">
                        อาหารพร้อมเสิร์ฟ รอพนักงานยืนยันการเสิร์ฟที่หน้าพร้อมเสิร์ฟ
                      </div>
                    )}
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
