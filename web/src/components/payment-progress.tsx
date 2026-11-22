import { paidItemQuantity, type PaymentAllocation } from "@/lib/payment-progress";

export default function PaymentProgress({ item }: { item: { quantity: number; unit_price: number; payment_allocations?: PaymentAllocation[] } }) {
  const paid = paidItemQuantity(item);
  const outstanding = Math.round(Number(item.unit_price) * 100) * (item.quantity - paid);
  return <p className="mt-1 text-sm text-zinc-600">ชำระแล้ว {paid}/{item.quantity} จาน · ค้าง ฿{(outstanding / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</p>;
}
