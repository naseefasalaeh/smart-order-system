import type { PaymentAllocation } from "@/lib/payment-progress";

export default function PaymentHistory({ items }: { items: { payment_allocations?: PaymentAllocation[] }[] }) {
  const receipts = new Map<string, { method: string; at: string | null; satang: number }>();
  for (const item of items) for (const allocation of item.payment_allocations ?? []) {
    const payment = Array.isArray(allocation.payments) ? allocation.payments[0] : allocation.payments;
    if (!payment?.id || payment.status !== "paid") continue;
    const receipt = receipts.get(payment.id) ?? { method: payment.payment_method === "cash" ? "เงินสด" : "QR", at: payment.paid_at ?? null, satang: 0 };
    receipt.satang += Number(allocation.amount_satang);
    receipts.set(payment.id, receipt);
  }
  if (!receipts.size) return null;
  return <details className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm"><summary className="cursor-pointer font-semibold">ประวัติรับชำระ {receipts.size} ครั้ง</summary>
    <ul className="mt-2 space-y-2">{[...receipts].map(([id, receipt]) => <li key={id} className="break-all">เลขที่ {id} · {receipt.method} · ส่วนของออเดอร์นี้ ฿{(receipt.satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}{receipt.at && <> · {new Date(receipt.at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</>}</li>)}</ul>
  </details>;
}
