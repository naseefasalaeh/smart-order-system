import { pendingPlates, type PlateProgress } from "./plate-progress";

type ReadyOrder = { id: string; order_items: (PlateProgress & { id: number })[] };

// Retain acknowledgements for the lifetime of the open screen, including plates
// that disappear after serving or briefly disappear during reconnects.
export function collectNewReadyPlates(orders: ReadyOrder[], seen: Set<string>, baseline: boolean) {
  const added: string[] = [];
  for (const order of orders) for (const item of order.order_items) {
    for (const plate of pendingPlates(item)) {
      const key = `${order.id}:${item.id}:${plate}`;
      if (!seen.has(key) && !baseline) added.push(key);
      seen.add(key);
    }
  }
  return added;
}
