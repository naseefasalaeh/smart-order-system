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

const statusLabels: Record<string, string> = {
  pending: "รอยืนยัน",
  confirmed: "ยืนยันแล้ว",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const paymentMethodLabels: Record<string, string> = {
  cash: "เงินสด",
  qr: "QR Code",
  qr_code: "QR Code",
  transfer: "โอนเงิน",
  bank_transfer: "โอนผ่านธนาคาร",
  card: "บัตร",
  credit_card: "บัตรเครดิต",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function getBangkokTodayRange() {
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bangkokNow = new Date(Date.now() + bangkokOffset);

  const start =
    Date.UTC(
      bangkokNow.getUTCFullYear(),
      bangkokNow.getUTCMonth(),
      bangkokNow.getUTCDate()
    ) - bangkokOffset;

  return {
    start: new Date(start).toISOString(),
    end: new Date(start + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { start, end } = getBangkokTodayRange();

  const [
    completedOrdersResult,
    todayOrdersResult,
    paymentsResult,
    recentOrdersResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        created_at,
        order_items (
          id,
          quantity,
          subtotal,
          menus (
            name
          )
        )
      `)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end),

    supabase
      .from("payments")
      .select(`
        id,
        order_id,
        payment_method,
        amount,
        status,
        paid_at,
        created_at
      `)
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total_amount,
        created_at,
        restaurant_tables (
          table_number
        )
      `)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const completedOrders = completedOrdersResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const recentOrders = recentOrdersResult.data ?? [];

  const pageError =
    completedOrdersResult.error ??
    todayOrdersResult.error ??
    paymentsResult.error ??
    recentOrdersResult.error;

  const todayOrderCount = todayOrdersResult.count ?? 0;

  const successfulPaymentStatuses = [
    "paid",
    "completed",
    "success",
    "successful",
  ];

  const successfulPayments = payments.filter((payment) =>
    successfulPaymentStatuses.includes(
      String(payment.status ?? "").toLowerCase()
    )
  );

  // ใช้การชำระเงินสำเร็จเพียงหนึ่งรายการต่อหนึ่งออเดอร์
  // payments ถูกเรียงจากใหม่ไปเก่าอยู่แล้ว จึงเก็บรายการล่าสุดไว้
  const paymentByOrderId = new Map<
    string,
    (typeof successfulPayments)[number]
  >();

  successfulPayments.forEach((payment) => {
    if (payment.order_id && !paymentByOrderId.has(payment.order_id)) {
      paymentByOrderId.set(payment.order_id, payment);
    }
  });

  const paidCompletedOrders = completedOrders.filter((order) =>
    paymentByOrderId.has(order.id)
  );

  const paidCompletedOrderIds = new Set(
    paidCompletedOrders.map((order) => order.id)
  );

  const paidCompletedPayments = Array.from(paymentByOrderId.values()).filter(
    (payment) =>
      payment.order_id && paidCompletedOrderIds.has(payment.order_id)
  );

  const completedOrderCount = paidCompletedOrders.length;

  const menuSales: Record<
    string,
    {
      name: string;
      quantity: number;
      revenue: number;
    }
  > = {};

  paidCompletedOrders.forEach((order) => {
    order.order_items?.forEach((item) => {
      const menu = Array.isArray(item.menus)
        ? item.menus[0]
        : item.menus;

      const menuName = menu?.name ?? "ไม่พบชื่อเมนู";

      if (!menuSales[menuName]) {
        menuSales[menuName] = {
          name: menuName,
          quantity: 0,
          revenue: 0,
        };
      }

      menuSales[menuName].quantity += Number(item.quantity ?? 0);
      menuSales[menuName].revenue += Number(item.subtotal ?? 0);
    });
  });

  const bestSellingMenus = Object.values(menuSales)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);

  const totalSales = paidCompletedPayments.reduce(
    (sum, payment) => sum + Number(payment.amount ?? 0),
    0
  );

  const averageOrderValue =
    completedOrderCount > 0 ? totalSales / completedOrderCount : 0;

  const paymentSummary: Record<
    string,
    {
      method: string;
      count: number;
      amount: number;
    }
  > = {};

  paidCompletedPayments.forEach((payment) => {
    const method = payment.payment_method ?? "other";

    if (!paymentSummary[method]) {
      paymentSummary[method] = {
        method,
        count: 0,
        amount: 0,
      };
    }

    paymentSummary[method].count += 1;
    paymentSummary[method].amount += Number(payment.amount ?? 0);
  });

  const paymentMethods = Object.values(paymentSummary).sort(
    (a, b) => b.amount - a.amount
  );

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
                item.name === "รายงาน"
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
              สรุปผลการดำเนินงาน
            </p>

            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              รายงาน
            </h2>

            <p className="mt-2 text-zinc-600">
              ภาพรวมยอดขาย ออเดอร์ และเมนูขายดีของร้าน
            </p>
          </header>

          {pageError ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดข้อมูลรายงานได้: {pageError.message}
            </div>
          ) : (
            <>
              <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    ยอดขายรวม
                  </p>

                  <p className="mt-3 text-3xl font-bold text-orange-500">
                    ฿{formatCurrency(totalSales)}
                  </p>

                  <p className="mt-2 text-sm text-zinc-400">
                    จากรายการชำระเงินสำเร็จ
                  </p>
                </article>

                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    ออเดอร์ชำระแล้ว
                  </p>

                  <p className="mt-3 text-3xl font-bold text-zinc-900">
                    {completedOrderCount}
                  </p>

                  <p className="mt-2 text-sm text-zinc-400">
                    เสร็จสิ้นและชำระเงินแล้ว
                  </p>
                </article>

                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    ยอดเฉลี่ยต่อออเดอร์
                  </p>

                  <p className="mt-3 text-3xl font-bold text-zinc-900">
                    ฿{formatCurrency(averageOrderValue)}
                  </p>

                  <p className="mt-2 text-sm text-zinc-400">
                    เฉพาะออเดอร์ที่ชำระแล้ว
                  </p>
                </article>

                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <p className="text-sm font-medium text-zinc-500">
                    ออเดอร์วันนี้
                  </p>

                  <p className="mt-3 text-3xl font-bold text-zinc-900">
                    {todayOrderCount}
                  </p>

                  <p className="mt-2 text-sm text-zinc-400">
                    รวมทุกสถานะ
                  </p>
                </article>
              </section>

              <section className="mt-6 grid gap-6 xl:grid-cols-2">
                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-orange-500">
                      อันดับเมนู
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-zinc-900">
                      เมนูขายดี
                    </h3>
                  </div>

                  {bestSellingMenus.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center">
                      <p className="text-zinc-500">
                        ยังไม่มีข้อมูลเมนูที่ขาย
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-3">
                      {bestSellingMenus.map((menu, index) => (
                        <div
                          key={menu.name}
                          className="flex items-center justify-between gap-4 rounded-xl bg-orange-50 p-4"
                        >
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500 font-bold text-white">
                              {index + 1}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-semibold text-zinc-800">
                                {menu.name}
                              </p>

                              <p className="mt-1 text-sm text-zinc-500">
                                ขายแล้ว {menu.quantity} รายการ
                              </p>
                            </div>
                          </div>

                          <p className="shrink-0 font-bold text-orange-600">
                            ฿{formatCurrency(menu.revenue)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="rounded-2xl bg-white p-6 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-orange-500">
                      การชำระเงิน
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-zinc-900">
                      ยอดขายตามช่องทางชำระเงิน
                    </h3>
                  </div>

                  {paymentMethods.length === 0 ? (
                    <div className="mt-6 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center">
                      <p className="font-medium text-zinc-600">
                        ยังไม่มีข้อมูลการชำระเงิน
                      </p>

                      <p className="mt-2 text-sm text-zinc-400">
                        ข้อมูลจะแสดงเมื่อมีรายการชำระเงินสำเร็จ
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 space-y-3">
                      {paymentMethods.map((payment) => (
                        <div
                          key={payment.method}
                          className="flex items-center justify-between gap-4 rounded-xl bg-zinc-50 p-4"
                        >
                          <div>
                            <p className="font-semibold text-zinc-800">
                              {paymentMethodLabels[payment.method] ??
                                payment.method}
                            </p>

                            <p className="mt-1 text-sm text-zinc-500">
                              {payment.count} รายการ
                            </p>
                          </div>

                          <p className="font-bold text-zinc-900">
                            ฿{formatCurrency(payment.amount)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </section>

              <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-orange-500">
                      รายการล่าสุด
                    </p>

                    <h3 className="mt-1 text-xl font-bold text-zinc-900">
                      ออเดอร์ล่าสุด
                    </h3>
                  </div>

                  <Link
                    href="/dashboard/orders"
                    className="rounded-xl bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-200"
                  >
                    ดูออเดอร์ทั้งหมด
                  </Link>
                </div>

                {recentOrders.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center">
                    <p className="text-zinc-500">
                      ยังไม่มีออเดอร์ในระบบ
                    </p>
                  </div>
                ) : (
                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left">
                      <thead>
                        <tr className="border-b border-zinc-200 text-sm text-zinc-500">
                          <th className="pb-3 font-medium">ออเดอร์</th>
                          <th className="pb-3 font-medium">โต๊ะ</th>
                          <th className="pb-3 font-medium">วันที่และเวลา</th>
                          <th className="pb-3 font-medium">สถานะ</th>
                          <th className="pb-3 text-right font-medium">
                            ยอดรวม
                          </th>
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
                              <td className="py-4 font-semibold text-zinc-800">
                                #{order.order_number}
                              </td>

                              <td className="py-4 text-zinc-600">
                                โต๊ะ {table?.table_number ?? "-"}
                              </td>

                              <td className="py-4 text-sm text-zinc-500">
                                {new Date(order.created_at).toLocaleString(
                                  "th-TH",
                                  {
                                    timeZone: "Asia/Bangkok",
                                  }
                                )}
                              </td>

                              <td className="py-4">
                                <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700">
                                  {statusLabels[order.status] ?? order.status}
                                </span>
                              </td>

                              <td className="py-4 text-right font-bold text-zinc-800">
                                ฿{formatCurrency(
                                  Number(order.total_amount ?? 0)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}