"use client";

import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { dashboardMenuForRole } from "@/lib/dashboard-navigation";
import type { ShopRole } from "@/lib/dashboard-auth";
import { OrderWorkloadProvider, useWorkload } from "@/components/order-workload-context";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "รอชำระเงิน", href: "/dashboard/payments" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "พร้อมเสิร์ฟ", href: "/dashboard/ready" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "ตัวเลือกเสริม", href: "/dashboard/addons" },
  { name: "รายงาน", href: "/dashboard/reports" },
  { name: "จัดการผู้ใช้งาน", href: "/dashboard/users" },
];

export default function DashboardSidebar({ role, fullName, activePath }: { role: ShopRole; fullName: string; activePath: string }) {
  return <OrderWorkloadProvider role={role}><SidebarContent role={role} fullName={fullName} activePath={activePath} /></OrderWorkloadProvider>;
}

function SidebarContent({ role, fullName, activePath }: { role: ShopRole; fullName: string; activePath: string }) {
  const { snapshot, failed } = useWorkload()!;
  const counts = role === "staff" || role === "kitchen_staff" ? snapshot?.counts : undefined;
  const badges: Record<string, number | undefined> = {
    "/dashboard/orders": counts?.total,
    "/dashboard/payments": counts?.served,
    "/dashboard/ready": counts?.ready,
    "/dashboard/kitchen": counts ? counts.confirmed + counts.preparing : undefined,
  };
  return (
    <aside className="flex w-full shrink-0 flex-col bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
      <p className="text-sm font-semibold text-orange-400">SMART ORDER</p>
      <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>
      <nav aria-label="เมนูแดชบอร์ด" className="mt-8 flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
        {dashboardMenuForRole(menuItems, role).map((item) => (
          <Link key={item.href} href={item.href} aria-label={item.name}
            aria-describedby={(badges[item.href] ?? 0) > 0 ? `workload-${encodeURIComponent(item.href)}` : undefined}
            aria-current={item.href === activePath ? "page" : undefined}
            className={`flex min-w-36 shrink-0 items-center justify-between gap-3 whitespace-nowrap rounded-xl px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
              item.href === activePath ? "bg-orange-500 font-semibold text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}><span>{item.name}</span>{(badges[item.href] ?? 0) > 0 && <span id={`workload-${encodeURIComponent(item.href)}`} aria-label={`${badges[item.href]} ${item.href === "/dashboard/ready" ? "จานรอเสิร์ฟ" : "ออเดอร์ค้าง"}`} className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums ${item.href === activePath ? "bg-white/95 text-orange-700" : "bg-orange-400/15 text-orange-200"}`}>{badges[item.href]}{item.href === "/dashboard/ready" ? " จาน" : ""}</span>}</Link>
        ))}
      </nav>
      {failed && <p role="status" className="mt-3 text-xs text-amber-200">อัปเดตจำนวนงานไม่สำเร็จ กำลังลองใหม่</p>}
      <div className="mt-auto pt-6 [&>button]:mt-3">
        <div aria-label="ผู้ใช้งานปัจจุบัน" className="flex min-w-0 items-start gap-3 border-t border-zinc-700 pt-5">
          <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-orange-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-6 w-6">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
            <p className="font-semibold text-zinc-100">{fullName}</p>
            <p className="mt-1 text-zinc-400">{role}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
