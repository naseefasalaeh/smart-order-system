import { requireDashboardContext } from "@/lib/dashboard-auth";
import { loadOrders } from "@/lib/order-views";
import OrdersView from "./view";
export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; date?: string }> }) {
  const { db, user, role } = await requireDashboardContext(["admin", "staff"]);
  const { status, date } = await searchParams;
  const initial = await loadOrders(db, status, date);
  return <OrdersView initial={initial} userId={user.id} role={role} status={status} date={date} />;
}
