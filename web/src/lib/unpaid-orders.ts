import type { SupabaseClient } from "@supabase/supabase-js";

// All operational views use the same per-order payment rule. A failed attempt
// remains payable; an existing non-failed payment blocks another collection.
export async function filterUnpaidOrders<T extends { id: string; status: string }>(db: SupabaseClient, input: T[]) {
  const orders = [...new Map(input.map(order => [order.id, order])).values()];
  const served = orders.filter(order => order.status === "served");
  if (!served.length) return { orders, error: false };
  const payments = await db.from("payments").select("order_id,status")
    .in("order_id", served.map(order => order.id)).neq("status", "failed");
  if (payments.error) return { orders: [] as T[], error: true };
  const paid = new Set((payments.data ?? []).filter(payment => payment.status !== "failed").map(payment => payment.order_id));
  return { orders: orders.filter(order => order.status !== "served" || !paid.has(order.id)), error: false };
}
