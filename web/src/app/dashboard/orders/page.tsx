import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import UpdateOrderStatusButton from "@/components/update-order-status-button";
import { createClient } from "@/lib/supabase/server";
import { bangkokDayRange, bangkokToday } from "@/lib/bangkok-date";
import { requireDashboardRole } from "@/lib/dashboard-auth";
import { dashboardMenuForRole } from "@/lib/dashboard-navigation";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "พร้อมเสิร์ฟ", href: "/dashboard/ready" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "ตัวเลือกเสริม", href: "/dashboard/addons" },
  { name: "รายงาน", href: "/dashboard/reports" },
];

const statusLabels: Record<string, string> = {
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-zinc-100 text-zinc-700",
  cancelled: "bg-red-100 text-red-700",
};

const currentOrderFilters = [
  { label: "ทั้งหมด", value: "" },
  { label: "รอเริ่มทำ", value: "confirmed" },
  { label: "กำลังทำ", value: "preparing" },
  { label: "พร้อมเสิร์ฟ", value: "ready" },
];

const historyOrderFilters = [
  { label: "ทั้งหมด", value: "history" },
  { label: "เสร็จสิ้น", value: "completed" },
  { label: "ยกเลิก", value: "cancelled" },
];

const currentStatuses = ["confirmed", "preparing", "ready"];
const historyStatuses = ["completed", "cancelled"];
const allowedStatuses = [...currentStatuses, ...historyStatuses, "history"];

type OrdersPageProps = {
  searchParams: Promise<{
    status?: string;
    date?: string;
  }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireDashboardRole(["admin", "staff"]);
  const { status, date } = await searchParams;
  const activeStatus = status && allowedStatuses.includes(status) ? status : "";
  const isHistory =
    activeStatus === "history" || historyStatuses.includes(activeStatus);
  const visibleFilters = isHistory ? historyOrderFilters : currentOrderFilters;
  const selectedDay = bangkokDayRange(date ?? "") ? date! : bangkokToday();
  const dayRange = bangkokDayRange(selectedDay)!;
  const dayLabel = new Date(`${selectedDay}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canAdvanceStatus = profile?.role === "admin";

  let ordersQuery = supabase.from("orders").select(`
    id,
    order_number,
    dining_type,
    status,
    total_amount,
    note,
    created_at,
    restaurant_tables (
      table_number
    ),
    order_items (
      id,
      quantity,
      unit_price,
      subtotal,
      note,
      menu_name_snapshot,
      menus (
        name
      ),
      order_item_options (
        id,
        option_name,
        additional_price,
        quantity
      )
    )
  `);

  if (isHistory) {
    ordersQuery = ordersQuery.gte("updated_at", dayRange.start).lt("updated_at", dayRange.end);
    if (activeStatus === "history") ordersQuery = ordersQuery.in("status", historyStatuses);
    else ordersQuery = ordersQuery.eq("status", activeStatus);
  } else if (activeStatus) {
    ordersQuery = ordersQuery.eq("status", activeStatus);
  } else {
    ordersQuery = ordersQuery.in("status", currentStatuses);
  }

  const { data: orders, error } = await ordersQuery.order("created_at", {
    ascending: false,
  });
  const dayCompletedResult = isHistory
    ? await supabase.from("orders").select("id").eq("status", "completed").gte("updated_at", dayRange.start).lt("updated_at", dayRange.end)
    : { data: [], error: null };
  const completedIds = (dayCompletedResult.data ?? []).map((order) => order.id);
  const paymentsResult = completedIds.length
    ? await supabase.from("payments").select("order_id,amount,status").in("order_id", completedIds).eq("status", "paid")
    : { data: [], error: null };
  const paidByOrder = new Map((paymentsResult.data ?? []).map((payment) => [payment.order_id, Number(payment.amount)]));
  const daySales = [...paidByOrder.values()].reduce((sum, amount) => sum + amount, 0);

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <OrderRealtimeRefresh
        channelName={`staff-orders:${activeStatus || "current"}`}
      />

      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <p className="text-sm font-semibold text-orange-400">SMART ORDER</p>

        <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>

        <nav className="mt-8 space-y-2">
          {dashboardMenuForRole(menuItems, profile?.role).map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                item.name === "ออเดอร์"
                  ? "bg-orange-500 font-semibold text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <LogoutButton />
      </aside>

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
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

          {error || paymentsResult.error || dayCompletedResult.error ? (
            <div className="mt-6 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดประวัติออเดอร์ได้ กรุณาลองใหม่
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
  );
}
