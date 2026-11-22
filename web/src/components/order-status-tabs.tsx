"use client";

import Link from "next/link";
import { useWorkload } from "./order-workload-context";

const current = [
  ["", "ทั้งหมด"], ["confirmed", "รอเริ่มทำ"], ["preparing", "กำลังทำ"],
  ["partially_served", "เสิร์ฟแล้วบางส่วน"], ["ready", "พร้อมเสิร์ฟ"], ["served", "เสิร์ฟแล้ว รอชำระเงิน"],
];
const history = [["history", "ทั้งหมด"], ["completed", "เสร็จสิ้น"], ["cancelled", "ยกเลิก"]];

export default function OrderStatusTabs({ activeStatus, isHistory = false, selectedDay = "" }: {
  activeStatus: string; isHistory?: boolean; selectedDay?: string;
}) {
  const counts = useWorkload()?.snapshot?.counts;
  const totals: Record<string, number | undefined> = {
    "": counts?.total, confirmed: counts?.confirmed, preparing: counts?.preparing,
    ready: counts?.readyOrders, partially_served: counts?.partially_served, served: counts?.served,
  };
  return <>
    <nav aria-label="ประเภทออเดอร์" className="mt-8 flex flex-wrap gap-3 border-b border-orange-200 pb-4">
      {[["/dashboard/orders", "ออเดอร์ปัจจุบัน", !isHistory], ["/dashboard/orders?status=history", "ประวัติออเดอร์", isHistory]].map(([href, label, active]) =>
        <Link key={String(href)} href={String(href)} aria-current={active ? "page" : undefined}
          className={`rounded-xl px-4 py-2 font-semibold transition ${active ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 shadow-sm hover:bg-orange-100"}`}>{label}</Link>)}
    </nav>
    <nav aria-label="กรองสถานะออเดอร์" className="mt-4 flex flex-wrap gap-3">
      {(isHistory ? history : current).map(([value, label]) => <Link key={value}
        aria-label={label}
        href={value ? `/dashboard/orders?status=${value}${isHistory ? `&date=${selectedDay}` : ""}` : "/dashboard/orders"}
        aria-current={activeStatus === value ? "page" : undefined}
        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-medium transition ${activeStatus === value ? "bg-orange-500 text-white" : "bg-white text-zinc-600 shadow-sm hover:bg-orange-100"}`}>{label}
        {!isHistory && totals[value] !== undefined && <span aria-label={`${totals[value]} ออเดอร์`} className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs tabular-nums ${activeStatus === value ? "bg-white/95 text-orange-700" : "bg-orange-50 text-orange-700"}`}>{totals[value]}</span>}
      </Link>)}
    </nav>
  </>;
}
