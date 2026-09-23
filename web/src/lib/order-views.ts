import type { SupabaseClient } from "@supabase/supabase-js";
import { bangkokDayRange, bangkokToday } from "@/lib/bangkok-date";

export async function loadKitchenOrders(supabase: SupabaseClient) {
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      dining_type,
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
        menu_name_snapshot,
        menus (
          name
        ),
        order_item_options (
          id,
          option_name,
          quantity
        )
      )
    `)
    .in("status", ["confirmed", "preparing", "ready"])
    .order("created_at", { ascending: true });

  return { orders, error: Boolean(error) };
}

export async function loadReadyOrders(supabase: SupabaseClient) {
  const { data: orders, error } = await supabase.from("orders").select(`
    id,order_number,dining_type,created_at,updated_at,note,total_amount,
    restaurant_tables(table_number),
    order_items(id,quantity,note,menu_name_snapshot,menus(name),
      order_item_options(id,option_name,quantity))
  `).eq("status", "ready").order("updated_at", { ascending: true });

  return { orders, error: Boolean(error) };
}

const currentOrderFilters = [
  { label: "ทั้งหมด", value: "" },
  { label: "รอเริ่มทำ", value: "confirmed" },
  { label: "กำลังทำ", value: "preparing" },
  { label: "พร้อมเสิร์ฟ", value: "ready" },
  { label: "เสิร์ฟแล้ว รอชำระเงิน", value: "served" },
];

const historyOrderFilters = [
  { label: "ทั้งหมด", value: "history" },
  { label: "เสร็จสิ้น", value: "completed" },
  { label: "ยกเลิก", value: "cancelled" },
];

const currentStatuses = ["confirmed", "preparing", "ready", "served"];
const historyStatuses = ["completed", "cancelled"];
const allowedStatuses = [...currentStatuses, ...historyStatuses, "history"];

export async function loadOrders(supabase: SupabaseClient, status?: string, date?: string) {
  const activeStatus = status && allowedStatuses.includes(status) ? status : "";
  const isHistory =
    activeStatus === "history" || historyStatuses.includes(activeStatus);
  const visibleFilters = isHistory ? historyOrderFilters : currentOrderFilters;
  const selectedDay = bangkokDayRange(date ?? "") ? date! : bangkokToday();
  const dayRange = bangkokDayRange(selectedDay)!;
  const dayLabel = new Date(`${selectedDay}T12:00:00+07:00`).toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });


  let ordersQuery = supabase.from("orders").select(`
    id,
    order_number,
    dining_type,
    status,
    total_amount,
    served_at,
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

  const [{ data: orders, error }, dayCompletedResult] = await Promise.all([ordersQuery.order("created_at", {
    ascending: false,
  }), isHistory
    ? supabase.from("orders").select("id").eq("status", "completed").gte("updated_at", dayRange.start).lt("updated_at", dayRange.end)
    : Promise.resolve({ data: [], error: null })]);
  const completedIds = (dayCompletedResult.data ?? []).map((order) => order.id);
  const paymentsResult = completedIds.length
    ? await supabase.from("payments").select("order_id,amount,status").in("order_id", completedIds).eq("status", "paid")
    : { data: [], error: null };
  const paidByOrder = new Map((paymentsResult.data ?? []).map((payment) => [payment.order_id, Number(payment.amount)]));
  const daySales = [...paidByOrder.values()].reduce((sum, amount) => sum + amount, 0);

  return { orders, activeStatus, isHistory, visibleFilters, selectedDay, dayLabel, daySales, error: Boolean(error || paymentsResult.error || dayCompletedResult.error) };
}

