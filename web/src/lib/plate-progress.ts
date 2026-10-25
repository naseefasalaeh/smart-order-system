export type PlateProgress = {
  quantity: number;
  completed_plates?: number[] | null;
  served_plates?: number[] | null;
};

export function pendingPlates(item: PlateProgress): number[] {
  const served = new Set(item.served_plates ?? []);
  const completed = [...new Set(item.completed_plates ?? [])];
  return completed
    .filter(plate => plate >= 1 && plate <= item.quantity && !served.has(plate))
    .sort((first, second) => first - second);
}

export function orderDisplayStatus(order: { status: string; order_items?: PlateProgress[] | null; }): string {
  const canBePartiallyServed = ["preparing", "ready"].includes(order.status);
  const hasServedPlates = order.order_items?.some(item => (item.served_plates?.length ?? 0) > 0);
  if (canBePartiallyServed && hasServedPlates) return "partially_served";
  return order.status;
}
