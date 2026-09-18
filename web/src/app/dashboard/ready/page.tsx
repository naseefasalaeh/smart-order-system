import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { requireDashboardContext } from "@/lib/dashboard-auth";

export default async function ReadyPage() {
  const { db, role } = await requireDashboardContext(["admin", "staff"]);

  const { data: orders, error } = await db.from("orders").select(`
    id,order_number,dining_type,created_at,updated_at,note,
    restaurant_tables(table_number),
    order_items(id,quantity,note,menu_name_snapshot,menus(name),
      order_item_options(id,option_name,quantity))
  `).eq("status", "ready").order("updated_at", { ascending: true });

  return (
    <main className="min-h-screen bg-orange-50 text-zinc-900 lg:flex">
      <OrderRealtimeRefresh channelName="staff-ready-orders" fallbackIntervalMs={5_000} pollWhenSubscribed />
      <DashboardSidebar role={role} activePath="/dashboard/ready" />
      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="font-semibold text-orange-500">ติดตามอาหารจากครัว</p>
            <h2 className="mt-1 text-3xl font-bold">พร้อมเสิร์ฟ</h2>
            <p className="mt-2 text-zinc-600">ออเดอร์ที่ครัวแจ้งว่าพร้อมแล้ว เรียงตามเวลาที่พร้อมก่อน</p>
          </header>

          {error ? (
            <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่</div>
          ) : !orders?.length ? (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-zinc-600">ยังไม่มีออเดอร์พร้อมเสิร์ฟ</div>
            </section>
          ) : (
            <section aria-label="ออเดอร์พร้อมเสิร์ฟ" className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => {
                const table = Array.isArray(order.restaurant_tables) ? order.restaurant_tables[0] : order.restaurant_tables;
                return (
                  <article key={order.id} className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 pb-4">
                      <div>
                        <p className="text-sm font-semibold text-orange-600">ออเดอร์ #{order.order_number}</p>
                        <h3 className="mt-1 text-xl font-bold">{order.dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${table?.table_number ?? "-"}`}</h3>
                      </div>
                      <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-800">พร้อมเสิร์ฟ</span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-green-800">พร้อมเมื่อ {new Date(order.updated_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
                    <p className="mt-1 text-xs text-zinc-500">สั่งเมื่อ {new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</p>
                    <ul className="mt-4 space-y-4 border-t border-zinc-100 pt-4">
                      {order.order_items?.map((item) => {
                        const menu = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                        return (
                          <li key={item.id} className="min-w-0">
                            <p className="break-words font-semibold">{item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู"} <span className="whitespace-nowrap text-orange-700">× {item.quantity}</span></p>
                            {item.order_item_options?.map((option) => <p key={option.id} className="mt-1 text-sm text-orange-700">{option.option_name} × {option.quantity} ต่อจาน</p>)}
                            {item.note && <p className="mt-1 text-sm text-zinc-600">หมายเหตุ: {item.note}</p>}
                          </li>
                        );
                      })}
                    </ul>
                    {order.note && <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-800">หมายเหตุออเดอร์: {order.note}</p>}
                  </article>
                );
              })}
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
