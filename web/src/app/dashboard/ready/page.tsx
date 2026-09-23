import { requireDashboardContext } from "@/lib/dashboard-auth";
import { loadReadyOrders } from "@/lib/order-views";
import OrdersView from "./view";
export default async function Page() {
  const { db, user, role } = await requireDashboardContext(["admin", "staff"]);
  const initial = await loadReadyOrders(db);
  return <OrdersView initial={initial} userId={user.id} role={role} />;
}
