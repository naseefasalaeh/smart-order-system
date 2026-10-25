"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";
import type { ShopRole } from "@/lib/dashboard-auth";
import { useOrderWorkload } from "./use-order-workload";
import OrderRealtimeRefresh from "./order-realtime-refresh";

const WorkloadContext = createContext<ReturnType<typeof useOrderWorkload> | null>(null);
export const useWorkload = () => useContext(WorkloadContext);

export function OrderWorkloadProvider({ role, children }: { role: ShopRole; children: ReactNode }) {
  const parent = useWorkload();
  return parent ? children : <WorkloadProvider role={role}>{children}</WorkloadProvider>;
}

function WorkloadProvider({ role, children }: { role: ShopRole; children: ReactNode }) {
  const workload = useOrderWorkload(role);
  return <WorkloadContext.Provider value={workload}>
    {(role === "staff" || role === "kitchen_staff") && <OrderRealtimeRefresh channelName="sidebar-workload" onRefresh={workload.refresh} fallbackIntervalMs={5_000} pollWhenSubscribed />}
    {workload.notice && <div role="status" aria-live="polite" aria-atomic="true" className="fixed right-4 top-4 z-50 max-w-[calc(100vw-2rem)] rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-900 shadow-lg sm:max-w-md">
      <Link href="/dashboard/ready" onClick={workload.dismissNotice} className="block rounded focus-visible:outline-2 focus-visible:outline-green-700">{workload.notice}<span className="mt-1 block text-xs font-medium underline">ดูออเดอร์พร้อมเสิร์ฟ</span></Link>
    </div>}
    {children}
  </WorkloadContext.Provider>;
}
