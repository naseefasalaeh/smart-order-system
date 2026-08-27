import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
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

const paidStatuses = ["paid", "completed", "success", "successful"];

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // จุดเริ่มต้นและสิ้นสุดของวันนี้ในประเทศไทย แล้วแปลงเป็น UTC สำหรับค้นฐานข้อมูล
  const now = new Date();
  const thailandDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const startOfToday = new Date(`${thailandDate}T00:00:00+07:00`);
  const startOfTomorrow = new Date(
    startOfToday.getTime() + 24 * 60 * 60 * 1000,
  );

  const [
    todayOrdersResult,
    preparingOrdersResult,
    availableMenusResult,
    ingredientsResult,
    todayPaymentsResult,
    recentOrdersResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfToday.toISOString())
      .lt("created_at", startOfTomorrow.toISOString()),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "preparing"),
    supabase
      .from("menus")
      .select("*", { count: "exact", head: true })
      .eq("is_available", true),
    supabase.from("ingredients").select("id, stock_quantity, minimum_stock"),
    supabase
      .from("payments")
      .select("order_id, amount, paid_at")
      .in("status", paidStatuses)
      .gte("paid_at", startOfToday.toISOString())
      .lt("paid_at", startOfTomorrow.toISOString())
      .order("paid_at", { ascending: false }),
    supabase
      .from("orders")
      .select(
        `
        id,
        order_number,
        status,
        total_amount,
        created_at,
        restaurant_tables (
          table_number
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const queryErrors = [
    todayOrdersResult.error,
    preparingOrdersResult.error,
    availableMenusResult.error,
    ingredientsResult.error,
    todayPaymentsResult.error,
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    console.error(
      "ไม่สามารถโหลดข้อมูล Dashboard บางส่วน:",
      queryErrors.map((error) => error?.message).join(" | "),
    );
  }

  const lowStockIngredientCount =
    ingredientsResult.data?.filter(
      (ingredient) =>
        Number(ingredient.stock_quantity) <= Number(ingredient.minimum_stock),
    ).length ?? 0;

  // กันข้อมูลชำระซ้ำ โดยใช้รายการล่าสุดเพียงหนึ่งรายการต่อออเดอร์
  const uniqueTodayPayments = new Map<string, number>();
  for (const payment of todayPaymentsResult.data ?? []) {
    if (payment.order_id && !uniqueTodayPayments.has(payment.order_id)) {
      uniqueTodayPayments.set(payment.order_id, Number(payment.amount ?? 0));
    }
  }

  const todaySales = Array.from(uniqueTodayPayments.values()).reduce(
    (sum, amount) => sum + amount,
    0,
  );

  const summaryCards = [
    {
      title: "ออเดอร์วันนี้",
      value: String(todayOrdersResult.count ?? 0),
      description: "รายการ",
    },
    {
      title: "กำลังทำอาหาร",
      value: String(preparingOrdersResult.count ?? 0),
      description: "รายการ",
    },
    {
      title: "เมนูที่เปิดขาย",
      value: String(availableMenusResult.count ?? 0),
      description: "เมนู",
    },
    {
      title: "วัตถุดิบใกล้หมด",
      value: String(lowStockIngredientCount),
      description: "รายการ",
    },
    {
      title: "ยอดขายวันนี้",
      value: `฿${todaySales.toLocaleString("th-TH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      description: `${uniqueTodayPayments.size} ออเดอร์`,
    },
  ];

  const recentOrders = recentOrdersResult.data ?? [];

  return (
    <main className="min-h-screen bg-zinc-100 lg:flex">
      <aside className="bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-72">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-orange-400">
            SMART ORDER
          </p>
          <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>
        </div>

        <nav className="mt-8 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                item.name === "ภาพรวม"
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
            <p className="font-semibold text-orange-500">ภาพรวมร้านอาหาร</p>
            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              Dashboard พนักงาน
            </h2>
            <p className="mt-2 text-zinc-600">
              ตรวจสอบออเดอร์ คิวครัว เมนู และวัตถุดิบภายในร้าน
            </p>
          </header>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((card) => (
              <article
                key={card.title}
                className="rounded-2xl bg-white p-6 shadow-sm"
              >
                <p className="text-sm font-medium text-zinc-500">
                  {card.title}
                </p>
                <div className="mt-3">
                  <p className="break-words text-3xl font-bold text-zinc-900">
                    {card.value}
                  </p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {card.description}
                  </p>
                </div>
              </article>
            ))}
          </div>

          <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-xl font-bold text-zinc-900">
                  ออเดอร์ล่าสุด
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  รายการอาหารที่ลูกค้าสั่งเข้ามาล่าสุด
                </p>
              </div>
              <Link
                href="/dashboard/orders"
                className="font-semibold text-orange-500 hover:text-orange-600"
              >
                ดูออเดอร์ทั้งหมด
              </Link>
            </div>

            {recentOrdersResult.error ? (
              <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-600">
                ไม่สามารถโหลดออเดอร์ล่าสุดได้:{" "}
                {recentOrdersResult.error.message}
              </p>
            ) : recentOrders.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center">
                <p className="font-semibold text-zinc-600">ยังไม่มีออเดอร์</p>
                <p className="mt-1 text-sm text-zinc-400">
                  เมื่อมีลูกค้าสั่งอาหาร รายการจะแสดงบริเวณนี้
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 text-sm text-zinc-500">
                      <th className="px-3 py-3 font-semibold">ออเดอร์</th>
                      <th className="px-3 py-3 font-semibold">โต๊ะ</th>
                      <th className="px-3 py-3 font-semibold">วันที่และเวลา</th>
                      <th className="px-3 py-3 font-semibold">ยอดรวม</th>
                      <th className="px-3 py-3 font-semibold">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => {
                      const table = Array.isArray(order.restaurant_tables)
                        ? order.restaurant_tables[0]
                        : order.restaurant_tables;

                      return (
                        <tr
                          key={order.id}
                          className="border-b border-zinc-100 last:border-0"
                        >
                          <td className="px-3 py-4 font-semibold text-zinc-900">
                            #{order.order_number}
                          </td>
                          <td className="px-3 py-4 text-zinc-700">
                            โต๊ะ {table?.table_number ?? "-"}
                          </td>
                          <td className="px-3 py-4 text-sm text-zinc-500">
                            {new Date(order.created_at).toLocaleString(
                              "th-TH",
                              {
                                timeZone: "Asia/Bangkok",
                                dateStyle: "short",
                                timeStyle: "short",
                              },
                            )}
                          </td>
                          <td className="px-3 py-4 font-semibold text-zinc-900">
                            ฿
                            {Number(order.total_amount ?? 0).toLocaleString(
                              "th-TH",
                              {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              },
                            )}
                          </td>
                          <td className="px-3 py-4">
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                                statusColors[order.status] ??
                                "bg-zinc-100 text-zinc-700"
                              }`}
                            >
                              {statusLabels[order.status] ?? order.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}