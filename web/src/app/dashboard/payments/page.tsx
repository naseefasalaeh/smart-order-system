import { requireDashboardContext } from "@/lib/dashboard-auth";
import { loadPendingPayments } from "@/lib/order-views";
import PaymentsView from "../orders/payments-view";

export default async function PaymentsPage() {
  const { db, user, role, fullName } = await requireDashboardContext(["staff"]);
  const initial = await loadPendingPayments(db);
  return <PaymentsView initial={initial} userId={user.id} role={role} fullName={fullName} />;
}
