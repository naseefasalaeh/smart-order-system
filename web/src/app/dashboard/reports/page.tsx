import Link from "next/link";
import DashboardSidebar from "@/components/dashboard-sidebar";
import ReportsCharts from "@/components/reports-charts";
import { bangkokCurrentMonth, bangkokMonthRange } from "@/lib/bangkok-date";
import { requireDashboardContext } from "@/lib/dashboard-auth";

const statusLabels: Record<string, string> = {
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  served: "เสิร์ฟแล้ว รอชำระเงิน",
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

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { db: supabase, role, fullName } = await requireDashboardContext(["admin"]);
  const { month: requestedMonth } = await searchParams;
  const month = bangkokMonthRange(requestedMonth ?? "") ? requestedMonth! : bangkokCurrentMonth();
  const { start, end } = bangkokMonthRange(month)!;
  const monthLabel = new Date(`${month}-15T12:00:00+07:00`).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", month: "long", year: "numeric" });
  const [
    completedOrdersResult,
    monthOrdersResult,
    cancelledOrdersResult,
    diningOrdersResult,
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
          menu_name_snapshot,
          menus (
            name
          ),
          order_item_options(option_name,additional_price,quantity)
        )
      `)
      .eq("status", "completed")
      .gte("updated_at", start)
      .lt("updated_at", end)
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end),

    supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "cancelled").gte("updated_at", start).lt("updated_at", end),
    supabase.from("orders").select("dining_type").gte("created_at", start).lt("created_at", end),

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
      .gte("paid_at", start)
      .lt("paid_at", end)
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
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const completedOrders = completedOrdersResult.data ?? [];
  const payments = paymentsResult.data ?? [];
  const recentOrders = recentOrdersResult.data ?? [];

  const pageError =
    completedOrdersResult.error ??
    monthOrdersResult.error ??
    cancelledOrdersResult.error ??
    diningOrdersResult.error ??
    paymentsResult.error ??
    recentOrdersResult.error;

  const monthOrderCount = monthOrdersResult.count ?? 0;
  const dineInCount = (diningOrdersResult.data ?? []).filter((order) => order.dining_type === "dine_in").length;
  const takeawayCount = (diningOrdersResult.data ?? []).filter((order) => order.dining_type === "takeaway").length;

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
  const addonSales = new Map<string, { name: string; quantity: number; revenue: number }>();

  paidCompletedOrders.forEach((order) => {
    order.order_items?.forEach((item) => {
      const menu = Array.isArray(item.menus)
        ? item.menus[0]
        : item.menus;

      const menuName = item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู";

      if (!menuSales[menuName]) {
        menuSales[menuName] = {
          name: menuName,
          quantity: 0,
          revenue: 0,
        };
      }

      menuSales[menuName].quantity += Number(item.quantity ?? 0);
      menuSales[menuName].revenue += Number(item.subtotal ?? 0);
      item.order_item_options?.forEach((option) => {
        const existing = addonSales.get(option.option_name) ?? { name: option.option_name, quantity: 0, revenue: 0 };
        const quantity = Number(option.quantity) * Number(item.quantity);
        existing.quantity += quantity;
        existing.revenue += quantity * Number(option.additional_price);
        addonSales.set(option.option_name, existing);
      });
    });
  });

  const bestSellingMenus = Object.values(menuSales)
    .sort((a, b) => b.quantity - a.quantity);

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

  const [yearNumber, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(yearNumber, monthNumber, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, index) => ({
    date: `${month}-${String(index + 1).padStart(2, "0")}`,
    label: String(index + 1), sales: 0, orders: 0,
  }));
  const dailyByDate = new Map(daily.map((day) => [day.date, day]));
  paidCompletedPayments.forEach((payment) => {
    const day = dailyByDate.get(bangkokDateKey(payment.paid_at ?? payment.created_at));
    if (day) { day.sales += Number(payment.amount ?? 0); day.orders += 1; }
  });
  const cash = paymentMethods.filter((item) => item.method === "cash");
  const qr = paymentMethods.filter((item) => item.method === "qr" || item.method === "qr_code");
  const other = paymentMethods.filter((item) => !["cash", "qr", "qr_code"].includes(item.method));
  const summarize = (items: typeof paymentMethods) => ({
    count: items.reduce((sum, item) => sum + item.count, 0),
    amount: items.reduce((sum, item) => sum + item.amount, 0),
  });
  const paymentChart = [
    { label: "เงินสด", ...summarize(cash), color: "#f97316" },
    { label: "QR Code", ...summarize(qr), color: "#18181b" },
    ...(other.length ? [{ label: "ช่องทางอื่น", ...summarize(other), color: "#a1a1aa" }] : []),
  ];
  const diningChart = [
    { label: "ทานที่ร้าน", count: dineInCount, color: "#f97316" },
    { label: "กลับบ้าน", count: takeawayCount, color: "#18181b" },
  ];

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/reports" />

      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="font-semibold text-orange-500">
              สรุปผลการดำเนินงาน
            </p>

            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              รายงาน
            </h2>

            <p className="mt-2 text-zinc-600">
              รายงานเดือน{monthLabel} · {new Date(start).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })} ถึง {new Date(Date.parse(end) - 1).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" })}
            </p>
          </header>

          <form action="/dashboard/reports" className="mt-5 flex flex-wrap items-end gap-3 rounded-xl bg-white p-4 shadow-sm">
            <label className="font-medium text-zinc-700">เลือกเดือนและปี <input type="month" name="month" defaultValue={month} className="ml-2 rounded-lg border border-zinc-300 px-3 py-2" /></label>
            <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">ดูรายงาน</button>
            <Link href="/dashboard/reports" className="rounded-lg border border-zinc-300 px-4 py-2">กลับเดือนปัจจุบัน</Link>
          </form>

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
                    ออเดอร์เดือนนี้
                  </p>

                  <p className="mt-3 text-3xl font-bold text-zinc-900">
                    {monthOrderCount}
                  </p>

                  <p className="mt-2 text-sm text-zinc-400">
                    รวมทุกสถานะ
                  </p>
                </article>
              </section>
              <ReportsCharts days={daily} menus={bestSellingMenus.map((menu) => ({ name: menu.name, quantity: menu.quantity }))}
                payments={paymentChart} dining={diningChart} />
              <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
                <h3 className="text-xl font-bold">Add-on ที่ขายในเดือนนี้</h3>
                <p className="mt-1 text-sm text-zinc-500">ชื่อและราคาอิง snapshot ณ เวลาสั่ง แม้ตัวเลือกถูกลบแล้ว</p>
                {[...addonSales.values()].length ? <ul className="mt-4 space-y-2">{[...addonSales.values()].sort((a,b) => b.quantity-a.quantity).map((addon) => <li key={addon.name} className="flex justify-between rounded-lg bg-zinc-50 p-3"><span>{addon.name} · {addon.quantity} รายการ</span><span>฿{formatCurrency(addon.revenue)}</span></li>)}</ul> : <p className="mt-4 text-zinc-500">ไม่มี Add-on ที่ขาย</p>}
              </section>

              <section className="mt-4 rounded-2xl bg-white p-5 text-zinc-700 shadow-sm">
                <p>ทานที่ร้าน {dineInCount} ออเดอร์ · กลับบ้าน {takeawayCount} ออเดอร์ · ยกเลิก {cancelledOrdersResult.count ?? 0} ออเดอร์</p>
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

function bangkokDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
