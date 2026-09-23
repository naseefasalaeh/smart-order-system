import { requireDashboardContext } from "@/lib/dashboard-auth";
import { loadKitchenOrders } from "@/lib/order-views";
import OrdersView from "./view";
export default async function Page() {
  const { db, user, role } = await requireDashboardContext(["admin", "kitchen_staff"]);
  const initial = await loadKitchenOrders(db);
  return <OrdersView initial={initial} userId={user.id} role={role} />;
}
