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
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
};

const statusColors: Record<string, string> = {
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready: "bg-green-100 text-green-700",
};

export default async function KitchenPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      note,
      total_amount,
      created_at,
      restaurant_tables (
        table_number
      ),
      order_items (
        id,
        quantity,
        note,
        menus (
          name
        )
      )
    `)
    .in("status", ["confirmed", "preparing", "ready"])
    .order("created_at", { ascending: true });

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <p className="text-sm font-semibold text-orange-400">
          SMART ORDER
        </p>

        <h1 className="mt-1 text-2xl font-bold">
          ระบบจัดการร้าน
        </h1>

        <nav className="mt-8 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                item.name === "คิวครัว"
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
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดคิวครัวได้: {error.message}
            </div>
          ) : !orders || orders.length === 0 ? (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center">
                <p className="font-medium text-zinc-600">
                  ยังไม่มีออเดอร์ในคิวครัว
                </p>

                <p className="mt-1 text-sm text-zinc-400">
                  ออเดอร์จะแสดงเมื่อพนักงานยืนยันแล้ว
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
                          โต๊ะ {table?.table_number ?? "-"}
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
                              {menu?.name ?? "ไม่พบชื่อเมนู"} ×{" "}
                              {item.quantity}
                            </p>

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
                      />
                    ) : (
                      <div className="mt-5 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-700">
                        อาหารพร้อมเสิร์ฟ กรุณารับชำระเงินและปิดออเดอร์ที่หน้าออเดอร์
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
  );
}