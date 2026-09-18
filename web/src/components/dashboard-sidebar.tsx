import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { dashboardMenuForRole } from "@/lib/dashboard-navigation";
import type { ShopRole } from "@/lib/dashboard-auth";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "พร้อมเสิร์ฟ", href: "/dashboard/ready" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "ตัวเลือกเสริม", href: "/dashboard/addons" },
  { name: "รายงาน", href: "/dashboard/reports" },
];

export default function DashboardSidebar({ role, activePath }: { role: ShopRole; activePath: string }) {
  return (
    <aside className="w-full shrink-0 bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
      <p className="text-sm font-semibold text-orange-400">SMART ORDER</p>
      <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>
      <nav aria-label="เมนูแดชบอร์ด" className="mt-8 flex gap-2 overflow-x-auto pb-2 lg:block lg:space-y-2 lg:overflow-visible lg:pb-0">
        {dashboardMenuForRole(menuItems, role).map((item) => (
          <Link key={item.href} href={item.href} aria-current={item.href === activePath ? "page" : undefined}
            className={`block shrink-0 whitespace-nowrap rounded-xl px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${
              item.href === activePath ? "bg-orange-500 font-semibold text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
            }`}>{item.name}</Link>
        ))}
      </nav>
      <LogoutButton />
    </aside>
  );
}
