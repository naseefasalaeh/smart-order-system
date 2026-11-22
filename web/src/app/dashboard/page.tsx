import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import DashboardClient, {
  type DashboardOrder,
  type LowStockIngredient,
  type PaymentSummary,
} from "./DashboardClient";

const paidStatuses = ["paid", "completed", "success", "successful"];

export default async function DashboardPage() {
  const { db: supabase, role, fullName } = await requireDashboardContext(["admin"]);

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
    availableMenusResult,
    ingredientsResult,
    todayPaymentsResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total_amount,
        note,
        dining_type,
        created_at,
        updated_at,
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
          completed_plates,
          served_plates,
          menus ( name ),
          order_item_options ( id, option_name, quantity )
        )
      `)
      .gte("created_at", startOfToday.toISOString())
      .lt("created_at", startOfTomorrow.toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("menus")
      .select("*", { count: "exact", head: true })
      .eq("is_available", true),
    supabase.from("ingredients").select("id, name, stock_quantity, minimum_stock, unit"),
    supabase
      .from("payments")
      .select("order_id, amount, payment_method, paid_at, status")
      .in("status", paidStatuses)
      .gte("paid_at", startOfToday.toISOString())
      .lt("paid_at", startOfTomorrow.toISOString())
      .order("paid_at", { ascending: false }),
  ]);

  const queryErrors = [
    todayOrdersResult.error,
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

  // กรองวัตถุดิบที่ใกล้หมด (สต็อก <= ขั้นต่ำ)
  const lowStockIngredients: LowStockIngredient[] = (ingredientsResult.data ?? [])
    .filter(
      (ingredient) =>
        Number(ingredient.stock_quantity) <= Number(ingredient.minimum_stock),
    )
    .map((ingredient) => ({
      id: ingredient.id,
      name: ingredient.name,
      stock_quantity: Number(ingredient.stock_quantity),
      minimum_stock: Number(ingredient.minimum_stock),
      unit: ingredient.unit ?? "หน่วย",
    }));

  // กันข้อมูลชำระซ้ำ โดยใช้รายการล่าสุดเพียงหนึ่งรายการต่อออเดอร์
  const uniqueTodayPayments = new Map<string, { amount: number; method: string; paid_at: string }>();
  for (const payment of todayPaymentsResult.data ?? []) {
    if (payment.order_id && !uniqueTodayPayments.has(payment.order_id)) {
      uniqueTodayPayments.set(payment.order_id, {
        amount: Number(payment.amount ?? 0),
        method: payment.payment_method ?? "cash",
        paid_at: payment.paid_at,
      });
    }
  }

  // คำนวณสรุปช่องทางการชำระเงิน (เงินสด vs QR Code)
  let cashTotal = 0;
  let cashCount = 0;
  let qrTotal = 0;
  let qrCount = 0;

  for (const payment of uniqueTodayPayments.values()) {
    if (payment.method === "cash") {
      cashTotal += payment.amount;
      cashCount += 1;
    } else {
      qrTotal += payment.amount;
      qrCount += 1;
    }
  }

  const rawOrders = todayOrdersResult.data ?? [];
  const completedOrders = rawOrders.filter((o) => o.status === "completed");
  const completedSum = completedOrders.reduce((sum, o) => sum + Number(o.total_amount ?? 0), 0);
  const paymentSum = cashTotal + qrTotal;
  const todaySales = Math.max(paymentSum, completedSum);

  const paymentSummary: PaymentSummary = {
    cashTotal,
    cashCount,
    qrTotal,
    qrCount,
    totalSales: todaySales,
  };

  // Map payment details into orders
  const orders: DashboardOrder[] = rawOrders.map((order) => {
    const payment = uniqueTodayPayments.get(order.id);
    return {
      ...order,
      payment_method: payment?.method ?? (order.status === "completed" ? "เงินสด" : null),
      paid_at: payment?.paid_at ?? null,
      order_items: (order.order_items ?? []).map((item) => ({
        ...item,
        order_item_options: item.order_item_options ?? [],
      })),
    };
  });

  return (
    <main className="min-h-screen bg-orange-50 text-zinc-900 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard" />

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="font-semibold text-orange-500">ภาพรวมร้านอาหาร</p>
            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              Dashboard ร้านอาหาร
            </h2>
            <p className="mt-2 text-zinc-600">
              ตรวจสอบออเดอร์ คิวครัว เมนู และวัตถุดิบภายในร้าน
            </p>
          </header>

          <DashboardClient
            orders={orders}
            availableMenusCount={availableMenusResult.count ?? 0}
            lowStockIngredients={lowStockIngredients}
            paymentSummary={paymentSummary}
            todaySales={todaySales}
          />
        </div>
      </section>
    </main>
  );
}
