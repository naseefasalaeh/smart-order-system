type Receipt = { status: string; id?: string; payment_method?: string; paid_at?: string | null };
export type PaymentAllocation = {
  quantity: number;
  amount_satang: number;
  payments: Receipt | Receipt[] | null;
};
export function paidItemQuantity(item: { payment_allocations?: PaymentAllocation[] }) {
  return (item.payment_allocations ?? []).reduce((sum, allocation) => {
    const payment = Array.isArray(allocation.payments) ? allocation.payments[0] : allocation.payments;
    return sum + (payment?.status === "paid" ? allocation.quantity : 0);
  }, 0);
}
