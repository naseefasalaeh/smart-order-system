import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import UpdateOrderStatusButton from "@/components/update-order-status-button";
import { createClient } from "@/lib/supabase/server";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "รายงาน", href: "/dashboard/reports" },
];

const statusLabels: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
  completed: "bg-zinc-100 text-zinc-700",
  cancelled: "bg-red-100 text-red-700",
};

const currentOrderFilters = [
  { label: "ทั้งหมด", value: "" },
  { label: "รอยืนยัน", value: "pending" },
  { label: "ยืนยันแล้ว", value: "confirmed" },
  { label: "กำลังทำ", value: "preparing" },
  { label: "พร้อมเสิร์ฟ", value: "ready" },
];

const historyOrderFilters = [
  { label: "ทั้งหมด", value: "history" },
  { label: "เสร็จสิ้น", value: "completed" },
  { label: "ยกเลิก", value: "cancelled" },
];

const currentStatuses = ["pending", "confirmed", "preparing", "ready"];
const historyStatuses = ["completed", "cancelled"];
const allowedStatuses = [...currentStatuses, ...historyStatuses, "history"];

type OrdersPageProps = {
  searchParams: Promise<{
    status?: string;
  }>;
};

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { status } = await searchParams;
  const activeStatus = status && allowedStatuses.includes(status) ? status : "";
  const isHistory =
    activeStatus === "history" || historyStatuses.includes(activeStatus);
  const visibleFilters = isHistory ? historyOrderFilters : currentOrderFilters;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  let ordersQuery = supabase.from("orders").select(`
    id,
    order_number,
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
      menus (
        name
      )
    )
  `);

  if (activeStatus === "history") {
    ordersQuery = ordersQuery.in("status", historyStatuses);
  } else if (activeStatus) {
    ordersQuery = ordersQuery.eq("status", activeStatus);
  } else {
    ordersQuery = ordersQuery.in("status", currentStatuses);
  }

  const { data: orders, error } = await ordersQuery.order("created_at", {
    ascending: false,
  });

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <p className="text-sm font-semibold text-orange-400">SMART ORDER</p>

        <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>

        <nav className="mt-8 space-y-2">
          {menuItems.map((item) => (
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
                : "ตรวจสอบ ยืนยัน และติดตามสถานะออเดอร์ของลูกค้า"}
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
                      ? `/dashboard/orders?status=${item.value}`
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

          {error ? (
            <div className="mt-6 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดออเดอร์ได้: {error.message}
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
                          โต๊ะ {table?.table_number ?? "-"}
                        </h3>

                        <p className="mt-1 text-sm text-zinc-400">
                          {new Date(order.created_at).toLocaleString("th-TH")}
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
                                    {menu?.name ?? "ไม่พบชื่อเมนู"} ×{" "}
                                    {item.quantity}
                                  </p>

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

                      <UpdateOrderStatusButton
                        orderId={order.id}
                        currentStatus={order.status}
                        totalAmount={Number(order.total_amount ?? 0)}
                      />
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