export type PlateProgress = { quantity: number; completed_plates?: number[] | null; served_plates?: number[] | null };

export function pendingPlates(item: PlateProgress): number[] {
  const served = new Set(item.served_plates ?? []);
  return [...new Set(item.completed_plates ?? [])].filter(plate => plate >= 1 && plate <= item.quantity && !served.has(plate)).sort((a,b) => a-b);
}

export function orderDisplayStatus(order: { status: string; order_items?: PlateProgress[] | null }): string {
  if (["preparing", "ready"].includes(order.status) && order.order_items?.some(item => (item.served_plates?.length ?? 0) > 0)) return "partially_served";
  return order.status;
}
