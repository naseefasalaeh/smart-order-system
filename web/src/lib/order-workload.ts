import { pendingPlates, orderDisplayStatus } from "@/lib/plate-progress";
import { filterUnpaidOrders } from "@/lib/unpaid-orders";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadOrderWorkload(db: SupabaseClient, role: "staff" | "kitchen_staff" = "staff") {
  const result = await db.from("orders").select("id,status,order_number,dining_type,restaurant_tables(table_number),order_items(id,quantity,menu_name_snapshot,completed_plates,served_plates,menus(name))")
    .in("status", role === "kitchen_staff" ? ["confirmed", "preparing"] : ["confirmed", "preparing", "ready", "served"]);
  if (result.error) throw result.error;
  const resultPending = await filterUnpaidOrders(db, result.data ?? []);
  if (resultPending.error) throw new Error("PAYMENT_READ_FAILED");
  const pending = resultPending.orders;
  const count = (status: string) => pending.filter(order => order.status === status).length;
  return {
    counts: {
      confirmed: count("confirmed"), preparing: count("preparing"),
      ready: pending.reduce((total, order) => total + (order.order_items ?? [])
        .reduce((sum, item) => sum + pendingPlates(item).length, 0), 0),
      readyOrders: pending.filter(order => order.order_items?.some(item => pendingPlates(item).length > 0)).length,
      partially_served: pending.filter(order => orderDisplayStatus(order) === "partially_served").length,
      served: count("served"), total: pending.length,
    },
    ready: pending.flatMap(order => {
      const table = Array.isArray(order.restaurant_tables) ? order.restaurant_tables[0] : order.restaurant_tables;
      return (order.order_items ?? []).flatMap(item => {
        const menu = Array.isArray(item.menus) ? item.menus[0] : item.menus;
        const place = order.dining_type === "takeaway" ? `ออเดอร์กลับบ้าน #${order.order_number}` : `โต๊ะ ${table?.table_number ?? "-"}`;
        const label = `${place} · ${item.menu_name_snapshot ?? menu?.name ?? "อาหาร"}`;
        return pendingPlates(item).map(plate => ({ id: `${item.id}:${plate}`, group: String(item.id), label }));
      });
    }),
  };
}
