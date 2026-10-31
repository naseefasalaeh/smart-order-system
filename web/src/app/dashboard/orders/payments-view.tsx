"use client";
import Link from "next/link";
import SessionPayment from "@/components/session-payment";
import DashboardSidebar from "@/components/dashboard-sidebar";
import OrderRealtimeRefresh from "@/components/order-realtime-refresh";
import { OrderViewRefresh, OrderViewRetry, useLiveOrderView } from "@/components/live-order-view";
import type { ShopRole } from "@/lib/dashboard-auth";
import { loadPendingPayments } from "@/lib/order-views";
const allowed: ShopRole[] = ["staff"];
export default function OrdersView({ initial, userId, fullName, role }: { initial: Awaited<ReturnType<typeof loadPendingPayments>>; userId: string; fullName: string; role: ShopRole;  }) {
  const load = loadPendingPayments;
  const { data, refresh, refreshAfterMutation, error: liveError } = useLiveOrderView(initial, userId, role, allowed, load);
  const { orders, error } = data;
  const sessions = new Map<string, typeof orders>();
  for (const order of orders) {
    const key = order.session_id ?? order.id;
    sessions.set(key, [...(sessions.get(key) ?? []), order]);
  }
  return (
    <OrderViewRefresh.Provider value={refreshAfterMutation}>
    <main className="min-h-screen bg-orange-50 text-zinc-900 lg:flex">
      <OrderRealtimeRefresh onRefresh={refresh} channelName="staff-pending-payments" fallbackIntervalMs={5_000} pollWhenSubscribed />
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/payments" />
      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          {liveError && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-red-700">{liveError}<OrderViewRetry refresh={refresh} /></div>}
          <header>
            <p className="font-semibold text-orange-500">รับชำระเงิน</p>
            <h2 className="mt-1 text-3xl font-bold">รอชำระเงิน</h2>
            <p className="mt-2 text-zinc-600">เลือกจ่ายทั้งหมดหรือบางจาน รวมได้เฉพาะรอบการใช้โต๊ะเดียวกัน</p>
          </header>
          <Link href="/dashboard/members" className="mt-3 inline-block text-sm text-orange-700 underline">ช่วยลูกค้าผูกอุปกรณ์สมาชิกเดิม</Link>
          {!error && [...sessions].map(([id, sessionOrders]) => <SessionPayment key={id} orders={sessionOrders} refresh={refreshAfterMutation} />)}

          {error ? (
            <div role="alert" className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่<OrderViewRetry refresh={refresh} /></div>
          ) : !orders.length ? (
            <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-14 text-center text-zinc-600">ไม่มีรายการรอชำระเงิน</div>
            </section>
          ) : null}

        </div>
      </section>
    </main>
    </OrderViewRefresh.Provider>
  );
}
