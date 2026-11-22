export type KitchenAlertOrder = {
  id: string;
  status: string;
  order_number?: number | string;
};

/**
 * Collects newly arrived kitchen orders (confirmed/preparing) compared to seen orders.
 *
 * @param orders Current orders list
 * @param seen Set of order IDs already acknowledged
 * @param baseline When true (initial page load / snapshot), registers all existing orders into seen without triggering alerts
 * @returns Array of newly added order IDs
 */
export function collectNewKitchenOrders(
  orders: KitchenAlertOrder[],
  seen: Set<string>,
  baseline: boolean
): string[] {
  const added: string[] = [];
  for (const order of orders) {
    // Only orders in active kitchen statuses: confirmed (wait to start) or preparing (in kitchen)
    if (!["confirmed", "preparing"].includes(order.status)) continue;
    const key = order.id;
    if (!seen.has(key)) {
      if (!baseline) {
        added.push(key);
      }
      seen.add(key);
    }
  }
  return added;
}
