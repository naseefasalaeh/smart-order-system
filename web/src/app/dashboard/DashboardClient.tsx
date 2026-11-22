"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatOrderCode } from "@/lib/order-number";
import { orderDisplayStatus } from "@/lib/plate-progress";

export type OrderItemOption = {
  id: number;
  option_name: string;
  quantity: number;
};

export type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number | string;
  subtotal: number | string;
  note: string | null;
  menu_name_snapshot: string | null;
  completed_plates?: number[];
  served_plates?: number[];
  menus?: { name: string; price?: number } | { name: string; price?: number }[] | null;
  order_item_options: OrderItemOption[];
};

export type DashboardOrder = {
  id: string;
  order_number: number;
  status: string;
  total_amount: number | string;
  note: string | null;
  dining_type: string;
  created_at: string;
  updated_at?: string;
  restaurant_tables?: { table_number: string } | { table_number: string }[] | null;
  order_items: OrderItem[];
  payment_method?: string | null;
  paid_at?: string | null;
};

export type LowStockIngredient = {
  id: number;
  name: string;
  stock_quantity: number;
  minimum_stock: number;
  unit: string;
};

export type PaymentSummary = {
  cashTotal: number;
  cashCount: number;
  qrTotal: number;
  qrCount: number;
  totalSales: number;
};

type FilterTab = "all" | "completed" | "cancelled" | "in_progress";

const money = (val: number | string) =>
  Number(val || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const statusLabels: Record<string, string> = {
  confirmed: "รอเริ่มทำ",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  served: "รอชำระเงิน",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

const getStatusBadge = (order: DashboardOrder) => {
  const display = orderDisplayStatus(order);
  if (order.status === "completed") {
    return {
      label: "เสร็จสิ้น",
      className: "bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-semibold",
    };
  }
  if (order.status === "cancelled") {
    return {
      label: "ยกเลิก",
      className: "bg-red-50 text-red-700 border border-red-200/80 font-semibold",
    };
  }
  if (display === "partially_served") {
    return {
      label: "เสิร์ฟแล้วบางส่วน",
      className: "bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold",
    };
  }
  if (order.status === "preparing") {
    return {
      label: "กำลังทำ",
      className: "bg-orange-50 text-orange-700 border border-orange-200/80 font-semibold",
    };
  }
  if (order.status === "ready") {
    return {
      label: "พร้อมเสิร์ฟ",
      className: "bg-green-50 text-green-700 border border-green-200/80 font-semibold",
    };
  }
  if (order.status === "served") {
    return {
      label: "เสิร์ฟแล้ว รอชำระเงิน",
      className: "bg-amber-50 text-amber-800 border border-amber-200/80 font-semibold",
    };
  }
  return {
    label: statusLabels[order.status] ?? order.status,
    className: "bg-blue-50 text-blue-700 border border-blue-200/80 font-semibold",
  };
};

export default function DashboardClient({
  orders,
  availableMenusCount,
  lowStockIngredients,
  paymentSummary,
  todaySales,
}: {
  orders: DashboardOrder[];
  availableMenusCount: number;
  lowStockIngredients: LowStockIngredient[];
  paymentSummary: PaymentSummary;
  todaySales: number;
}) {
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<DashboardOrder | null>(null);

  // Status breakdown calculations
  const totalOrdersCount = orders.length;
  const completedOrdersCount = orders.filter((o) => o.status === "completed").length;
  const cancelledOrdersCount = orders.filter((o) => o.status === "cancelled").length;
  const inProgressOrdersCount = orders.filter(
    (o) => o.status !== "completed" && o.status !== "cancelled"
  ).length;

  const lowStockCount = lowStockIngredients.length;

  // Filter click handler from KPI card
  function handleFilterFromCard(status: FilterTab) {
    setFilterTab(status);
    const tableElem = document.getElementById("today-orders-section");
    if (tableElem) {
      tableElem.scrollIntoView({ behavior: "smooth" });
    }
  }

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // 1. Filter by Tab
      if (filterTab === "completed" && order.status !== "completed") return false;
      if (filterTab === "cancelled" && order.status !== "cancelled") return false;
      if (
        filterTab === "in_progress" &&
        (order.status === "completed" || order.status === "cancelled")
      ) {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const orderNumberStr = String(order.order_number);
        const orderCode = formatOrderCode(order.order_number, order.created_at).toLowerCase();
        const tableObj = Array.isArray(order.restaurant_tables)
          ? order.restaurant_tables[0]
          : order.restaurant_tables;
        const tableNum = String(tableObj?.table_number ?? "").toLowerCase();
        const diningType = order.dining_type === "takeaway" ? "กลับบ้าน" : `โต๊ะ ${tableNum}`;

        const matchesOrder =
          orderNumberStr.includes(q) ||
          orderCode.includes(q) ||
          tableNum.includes(q) ||
          diningType.toLowerCase().includes(q);

        const matchesMenu = order.order_items.some((item) => {
          const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
          const name = (item.menu_name_snapshot ?? menuObj?.name ?? "").toLowerCase();
          return name.includes(q);
        });

        return matchesOrder || matchesMenu;
      }

      return true;
    });
  }, [orders, filterTab, searchQuery]);

  // Top 5 Best Selling Items of Today (excluding cancelled orders)
  const topSellingItems = useMemo(() => {
    const itemMap = new Map<string, { quantity: number; revenue: number }>();

    for (const order of orders) {
      if (order.status === "cancelled") continue;
      for (const item of order.order_items) {
        const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
        const name = item.menu_name_snapshot ?? menuObj?.name ?? "อาหาร";
        const qty = item.quantity;
        const rev = Number(item.subtotal ?? Number(item.unit_price) * qty);

        const current = itemMap.get(name) ?? { quantity: 0, revenue: 0 };
        itemMap.set(name, {
          quantity: current.quantity + qty,
          revenue: current.revenue + rev,
        });
      }
    }

    return Array.from(itemMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 5);
  }, [orders]);

  const maxTopQty = Math.max(...topSellingItems.map((i) => i.quantity), 1);

  // Payment percentage calculation
  const totalPaidSum = paymentSummary.cashTotal + paymentSummary.qrTotal;
  const cashPct = totalPaidSum > 0 ? Math.round((paymentSummary.cashTotal / totalPaidSum) * 100) : 0;
  const qrPct = totalPaidSum > 0 ? 100 - cashPct : 0;

  return (
    <>
      {/* 1. KPI Cards: 4 Cards (grid-cols-1 sm:grid-cols-2 lg:grid-cols-4) */}
      <div className="mt-8 grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: ออเดอร์วันนี้ */}
        <article className="rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60 transition hover:shadow-sm">
          <p className="text-sm font-medium text-zinc-500">ออเดอร์วันนี้</p>
          <div className="mt-2.5">
            <p className="break-words text-3xl font-extrabold text-zinc-900">
              {totalOrdersCount} <span className="text-lg font-normal text-zinc-500">รายการ</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => handleFilterFromCard("completed")}
                className="font-semibold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer"
                title="คลิกเพื่อกรองออเดอร์ที่สำเร็จ"
              >
                สำเร็จ {completedOrdersCount}
              </button>
              <span className="text-zinc-300">·</span>
              <button
                type="button"
                onClick={() => handleFilterFromCard("cancelled")}
                className="font-semibold text-red-600 hover:text-red-700 hover:underline cursor-pointer"
                title="คลิกเพื่อกรองออเดอร์ที่ยกเลิก"
              >
                ยกเลิก {cancelledOrdersCount}
              </button>
              {inProgressOrdersCount > 0 && (
                <>
                  <span className="text-zinc-300">·</span>
                  <button
                    type="button"
                    onClick={() => handleFilterFromCard("in_progress")}
                    className="font-semibold text-orange-600 hover:text-orange-700 hover:underline cursor-pointer"
                    title="คลิกเพื่อกรองออเดอร์ที่กำลังดำเนินการ"
                  >
                    กำลังทำ {inProgressOrdersCount}
                  </button>
                </>
              )}
            </div>
          </div>
        </article>

        {/* Card 2: ยอดขายวันนี้ */}
        <article className="rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60 transition hover:shadow-sm">
          <p className="text-sm font-medium text-zinc-500">ยอดขายวันนี้</p>
          <div className="mt-2.5">
            <p className="break-words text-3xl font-extrabold text-zinc-900">
              ฿{money(todaySales)}
            </p>
            <p className="mt-2 text-xs font-medium text-zinc-500">
              เฉพาะบิลที่สำเร็จ {completedOrdersCount} ออเดอร์
            </p>
          </div>
        </article>

        {/* Card 3: เมนูที่เปิดขาย */}
        <article className="rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60 transition hover:shadow-sm">
          <p className="text-sm font-medium text-zinc-500">เมนูที่เปิดขาย</p>
          <div className="mt-2.5">
            <p className="break-words text-3xl font-extrabold text-zinc-900">
              {availableMenusCount} <span className="text-lg font-normal text-zinc-500">เมนู</span>
            </p>
            <Link
              href="/dashboard/menus"
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline"
            >
              ไปหน้าจัดการเมนู →
            </Link>
          </div>
        </article>

        {/* Card 4: วัตถุดิบใกล้หมด (แจ้งเตือนขอบและข้อความสีแดงอ่อนหาก > 0) */}
        <article
          className={`rounded-2xl p-6 shadow-xs transition hover:shadow-sm ${
            lowStockCount > 0
              ? "bg-red-50/40 border border-red-200"
              : "bg-white border border-orange-100/60"
          }`}
        >
          <p className={`text-sm font-medium ${lowStockCount > 0 ? "text-red-700" : "text-zinc-500"}`}>
            วัตถุดิบใกล้หมด
          </p>
          <div className="mt-2.5">
            <p className={`break-words text-3xl font-extrabold ${lowStockCount > 0 ? "text-red-600" : "text-zinc-900"}`}>
              {lowStockCount} <span className="text-lg font-normal text-zinc-500">รายการ</span>
            </p>
            {lowStockCount > 0 ? (
              <Link
                href="/dashboard/ingredients"
                className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700 hover:underline"
              >
                ⚠️ ตรวจสอบสต็อกวัตถุดิบ →
              </Link>
            ) : (
              <p className="mt-2 text-xs text-zinc-400">สต็อกวัตถุดิบเพียงพอ</p>
            )}
          </div>
        </article>
      </div>

      {/* 2. Main Section: 1 Column Full-width (Vertical stack with space-y-6) */}
      <div className="mt-8 space-y-6">
        {/* ส่วนที่ 1 (บนสุด): การ์ด "ออเดอร์วันนี้ทั้งหมด" เต็มความกว้าง w-full */}
        <section
          id="today-orders-section"
          className="w-full rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60"
        >
          {/* Header & Reports Link */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-xl font-bold text-zinc-900">ออเดอร์วันนี้ทั้งหมด</h3>
              <p className="mt-1 text-sm text-zinc-500">
                รายการคำสั่งซื้อประจำวันทั้งหมด ({filteredOrders.length} จาก {totalOrdersCount} รายการ)
              </p>
            </div>
            <Link
              href="/dashboard/reports"
              className="text-sm font-semibold text-orange-600 hover:text-orange-700 hover:underline"
            >
              ดูรายงานละเอียด →
            </Link>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4">
            {/* Filter Tabs */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFilterTab("all")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "all"
                    ? "bg-orange-500 text-white shadow-xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                ทั้งหมด ({totalOrdersCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("completed")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "completed"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                เสร็จสิ้น ({completedOrdersCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab("cancelled")}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filterTab === "cancelled"
                    ? "bg-red-600 text-white shadow-xs"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                ยกเลิก ({cancelledOrdersCount})
              </button>
              {inProgressOrdersCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab("in_progress")}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer ${
                    filterTab === "in_progress"
                      ? "bg-orange-600 text-white shadow-xs"
                      : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                  }`}
                >
                  กำลังทำ ({inProgressOrdersCount})
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาเลขออเดอร์, โต๊ะ, เมนู..."
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-2 pl-9 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500"
              />
              <span className="absolute left-3 top-2.5 text-zinc-400 text-xs">🔍</span>
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Table (Full Width) */}
          {filteredOrders.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-zinc-200 py-12 text-center">
              <p className="font-semibold text-zinc-600">ไม่พบรายการออเดอร์</p>
              <p className="mt-1 text-xs text-zinc-400">
                {searchQuery
                  ? "ไม่พบออเดอร์ที่ตรงกับคำค้นหา ลองตรวจสอบคำค้นหาอีกครั้ง"
                  : "ยังไม่มีออเดอร์ในสถานะที่เลือกสำหรับวันนี้"}
              </p>
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs text-zinc-500 uppercase tracking-wider">
                    <th className="px-3.5 py-3.5 font-semibold">ออเดอร์</th>
                    <th className="px-3.5 py-3.5 font-semibold">โต๊ะ / ประเภท</th>
                    <th className="px-3.5 py-3.5 font-semibold">เวลาที่สั่ง</th>
                    <th className="px-3.5 py-3.5 font-semibold">รายการอาหาร</th>
                    <th className="px-3.5 py-3.5 font-semibold">ช่องทางชำระ</th>
                    <th className="px-3.5 py-3.5 font-semibold">ยอดรวม</th>
                    <th className="px-3.5 py-3.5 font-semibold">สถานะ</th>
                    <th className="px-2 py-3.5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-sm">
                  {filteredOrders.map((order) => {
                    const tableObj = Array.isArray(order.restaurant_tables)
                      ? order.restaurant_tables[0]
                      : order.restaurant_tables;
                    const badge = getStatusBadge(order);

                    const itemsList = order.order_items.map((item) => {
                      const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                      const name = item.menu_name_snapshot ?? menuObj?.name ?? "อาหาร";
                      const opt = item.order_item_options?.map((o) => o.option_name).join(", ");
                      return `${name}${opt ? ` (${opt})` : ""} ×${item.quantity}`;
                    });

                    const itemsSummary = itemsList.slice(0, 3).join(", ");
                    const moreItems = itemsList.length > 3 ? ` +${itemsList.length - 3}` : "";

                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="transition hover:bg-orange-50/40 cursor-pointer group"
                      >
                        <td className="px-3.5 py-4 font-bold text-zinc-900 group-hover:text-orange-600 whitespace-nowrap">
                          {formatOrderCode(order.order_number, order.created_at)}
                        </td>
                        <td className="px-3.5 py-4 font-medium text-zinc-700 whitespace-nowrap">
                          {order.dining_type === "takeaway" ? (
                            <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700">
                              กลับบ้าน
                            </span>
                          ) : (
                            `โต๊ะ ${tableObj?.table_number ?? "-"}`
                          )}
                        </td>
                        <td className="px-3.5 py-4 text-xs text-zinc-500 whitespace-nowrap">
                          {new Date(order.created_at).toLocaleTimeString("th-TH", {
                            timeZone: "Asia/Bangkok",
                            hour: "2-digit",
                            minute: "2-digit",
                          })} น.
                        </td>
                        <td className="px-3.5 py-4 text-xs text-zinc-700 max-w-[320px] truncate" title={itemsList.join(", ")}>
                          {itemsSummary}
                          {moreItems && <span className="text-zinc-400 font-medium">{moreItems}</span>}
                        </td>
                        <td className="px-3.5 py-4 text-xs text-zinc-600 whitespace-nowrap">
                          {order.payment_method === "cash"
                            ? "💵 เงินสด"
                            : order.payment_method === "qr_code" || order.payment_method === "qr"
                            ? "📱 QR Code"
                            : order.status === "completed"
                            ? "ชำระแล้ว"
                            : "-"}
                        </td>
                        <td className="px-3.5 py-4 font-bold text-zinc-900 whitespace-nowrap">
                          ฿{money(order.total_amount)}
                        </td>
                        <td className="px-3.5 py-4 whitespace-nowrap">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-2 py-4 text-right text-xs text-zinc-400 group-hover:text-orange-500 font-bold">
                          →
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ส่วนที่ 2 (ตรงกลาง): การ์ด "เมนูขายดีวันนี้ (Top 5)" เต็มความกว้าง w-full */}
        <section id="top-sellers-section" className="w-full rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <h3 className="text-xl font-bold text-zinc-900">เมนูขายดีวันนี้ (Top 5)</h3>
              <p className="mt-0.5 text-xs text-zinc-500">5 อันดับเมนูยอดนิยมประจำวัน คำนวณจากยอดสั่งซื้อสำเร็จทั้งหมด</p>
            </div>
            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full border border-orange-200/60">
              Top 5 ประจำวัน
            </span>
          </div>

          {topSellingItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400">
              ยังไม่มีข้อมูลเมนูที่ขายได้ในวันนี้
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {topSellingItems.map((item, index) => {
                const rank = index + 1;
                const percent = Math.round((item.quantity / maxTopQty) * 100);

                const rankBadgeClass =
                  rank === 1
                    ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300 font-black"
                    : rank === 2
                    ? "bg-zinc-200 text-zinc-800 ring-1 ring-zinc-300 font-bold"
                    : rank === 3
                    ? "bg-orange-100 text-orange-800 ring-1 ring-orange-300 font-bold"
                    : "bg-zinc-100 text-zinc-600 font-medium";

                return (
                  <div
                    key={item.name}
                    className="flex flex-col justify-between rounded-xl bg-zinc-50/70 p-4 border border-zinc-100 hover:border-orange-200 hover:bg-orange-50/20 transition"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${rankBadgeClass}`}
                        >
                          {rank}
                        </span>
                        <span className="text-xs font-bold text-zinc-700 bg-white px-2 py-0.5 rounded-md border border-zinc-200/60">
                          {item.quantity} จาน
                        </span>
                      </div>
                      <p className="mt-2.5 text-sm font-bold text-zinc-900 truncate" title={item.name}>
                        {item.name}
                      </p>
                      <p className="text-xs font-medium text-zinc-500 mt-0.5">
                        ฿{money(item.revenue)}
                      </p>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3.5">
                      <div className="h-2 w-full rounded-full bg-zinc-200/80 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-500 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ส่วนที่ 3 (ล่างสุด): การ์ด "ช่องทางชำระเงิน" และสถานะสต็อก เต็มความกว้าง w-full */}
        <section id="payment-channels-section" className="w-full rounded-2xl bg-white p-6 shadow-xs border border-orange-100/60">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div>
              <h3 className="text-xl font-bold text-zinc-900">ช่องทางชำระเงิน</h3>
              <p className="mt-0.5 text-xs text-zinc-500">สัดส่วนเงินสดและสแกน QR วันนี้ พร้อมสถานะสต็อกวัตถุดิบ</p>
            </div>
            <span className="text-xs font-bold text-zinc-700 bg-zinc-100 px-3 py-1 rounded-full border border-zinc-200/60">
              รวม {paymentSummary.cashCount + paymentSummary.qrCount} บิล (฿{money(todaySales)})
            </span>
          </div>

          {/* Payment Method Cards: 2 Columns (grid-cols-1 md:grid-cols-2) */}
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ฝั่งเงินสด (Cash) */}
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">💵</span>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900">เงินสด (Cash)</h4>
                    <p className="text-xs text-zinc-500">{paymentSummary.cashCount} บิลสำเร็จ</p>
                  </div>
                </div>
                <span className="inline-block rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 border border-emerald-200">
                  {cashPct}%
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-black text-emerald-700">฿{money(paymentSummary.cashTotal)}</span>
                <span className="text-xs text-zinc-500">{cashPct}% ของยอดขายวันนี้</span>
              </div>

              <div className="mt-2.5 h-2.5 w-full rounded-full bg-emerald-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${cashPct}%` }}
                />
              </div>
            </div>

            {/* ฝั่งสแกน QR Code (PromptPay) */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/30 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📱</span>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-900">สแกน QR Code (PromptPay)</h4>
                    <p className="text-xs text-zinc-500">{paymentSummary.qrCount} บิลสำเร็จ</p>
                  </div>
                </div>
                <span className="inline-block rounded-md bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800 border border-blue-200">
                  {qrPct}%
                </span>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-black text-blue-700">฿{money(paymentSummary.qrTotal)}</span>
                <span className="text-xs text-zinc-500">{qrPct}% ของยอดขายวันนี้</span>
              </div>

              <div className="mt-2.5 h-2.5 w-full rounded-full bg-blue-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${qrPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* กล่องแจ้งเตือนสต็อกวัตถุดิบ (ด้านล่างของการ์ด) */}
          {lowStockCount > 0 ? (
            <div className="mt-5 rounded-xl border border-red-200 bg-red-50/60 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-red-200/60 pb-3">
                <p className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                  <span className="text-base">⚠️</span> แจ้งเตือนวัตถุดิบใกล้หมด ({lowStockCount} รายการ)
                </p>
                <Link
                  href="/dashboard/ingredients"
                  className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:text-red-900 hover:underline"
                >
                  ไปหน้าสต็อกวัตถุดิบเพื่อเติมสต็อก →
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-red-700">
                {lowStockIngredients.map((ing) => (
                  <div key={ing.id} className="flex justify-between items-center bg-white/70 px-3 py-1.5 rounded-lg border border-red-100">
                    <span className="truncate max-w-[160px] font-medium">• {ing.name}</span>
                    <span className="font-bold text-red-800">
                      เหลือ {ing.stock_quantity} / {ing.minimum_stock} {ing.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-xs text-emerald-800 flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium">
                <span className="text-base">✓</span> สต็อกวัตถุดิบทุกรายการเพียงพอสำหรับการขาย
              </span>
              <Link
                href="/dashboard/ingredients"
                className="font-bold text-emerald-700 hover:underline"
              >
                ดูสต็อกวัตถุดิบทั้งหมด →
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* 4. Slide-over Drawer for Order Detail */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 overflow-hidden"
          aria-labelledby="slide-over-title"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity cursor-pointer"
            onClick={() => setSelectedOrder(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md sm:max-w-lg bg-white shadow-2xl flex flex-col">
              {/* Drawer Header */}
              <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-orange-50/30">
                <div>
                  <div className="flex items-center gap-2">
                    <h2
                      id="slide-over-title"
                      className="text-2xl font-extrabold text-zinc-900"
                    >
                      {formatOrderCode(selectedOrder.order_number, selectedOrder.created_at)}
                    </h2>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${
                        getStatusBadge(selectedOrder).className
                      }`}
                    >
                      {getStatusBadge(selectedOrder).label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-zinc-600">
                    {selectedOrder.dining_type === "takeaway"
                      ? "กลับบ้าน"
                      : `โต๊ะ ${
                          Array.isArray(selectedOrder.restaurant_tables)
                            ? selectedOrder.restaurant_tables[0]?.table_number
                            : selectedOrder.restaurant_tables?.table_number ?? "-"
                        }`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className="rounded-xl p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                  aria-label="ปิดรายละเอียด"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 p-4 text-xs text-zinc-600">
                  <div>
                    <span className="text-zinc-400 block">เวลาที่สั่ง</span>
                    <span className="font-semibold text-zinc-800">
                      {new Date(selectedOrder.created_at).toLocaleString("th-TH", {
                        timeZone: "Asia/Bangkok",
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">ช่องทางการชำระเงิน</span>
                    <span className="font-semibold text-zinc-800">
                      {selectedOrder.payment_method === "cash"
                        ? "💵 เงินสด"
                        : selectedOrder.payment_method === "qr_code" || selectedOrder.payment_method === "qr"
                        ? "📱 QR Code"
                        : selectedOrder.payment_method
                        ? selectedOrder.payment_method
                        : selectedOrder.status === "completed"
                        ? "ชำระแล้ว"
                        : "ยังไม่ชำระ"}
                    </span>
                  </div>
                </div>

                {/* Cancellation Alert Box (if cancelled) */}
                {selectedOrder.status === "cancelled" && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚠️</span>
                      <h4 className="font-bold text-sm text-red-800">ออเดอร์นี้ถูกยกเลิกแล้ว</h4>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-red-700">
                      <p>
                        <span className="font-semibold">เหตุผลการยกเลิก:</span>{" "}
                        {selectedOrder.note || "ลูกค้ายกเลิกคำสั่งซื้อก่อนร้านเริ่มทำอาหาร"}
                      </p>
                      <p>
                        <span className="font-semibold">ผู้ดำเนินการ:</span> ลูกค้าหน้าร้าน / ระบบร้านค้า
                      </p>
                    </div>
                  </div>
                )}

                {/* Items list */}
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-3">
                    รายการอาหาร ({selectedOrder.order_items.length} รายการ)
                  </h4>
                  <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 overflow-hidden">
                    {selectedOrder.order_items.map((item) => {
                      const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                      const name = item.menu_name_snapshot ?? menuObj?.name ?? "อาหาร";
                      const options = item.order_item_options
                        ?.map((o) => `${o.option_name}${o.quantity > 1 ? ` ×${o.quantity}` : ""}`)
                        .join(", ");
                      const subtotal = Number(item.subtotal ?? Number(item.unit_price) * item.quantity);

                      return (
                        <li key={item.id} className="p-3.5 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-zinc-900 text-sm">{name}</p>
                              {options && (
                                <p className="text-xs text-zinc-500 mt-0.5">({options})</p>
                              )}
                              <p className="text-xs text-zinc-500 mt-1">
                                ฿{money(item.unit_price)} × {item.quantity} จาน
                              </p>
                              {item.note && (
                                <p className="text-xs text-amber-700 mt-1 bg-amber-50 rounded px-2 py-0.5 inline-block">
                                  หมายเหตุ: {item.note}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-zinc-900 text-sm whitespace-nowrap">
                              ฿{money(subtotal)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Drawer Footer: Net Total */}
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-zinc-600">ยอดรวมสุทธิ</span>
                  <div className="text-2xl font-black text-orange-600">
                    ฿{money(selectedOrder.total_amount)}
                  </div>
                </div>
                {selectedOrder.paid_at && (
                  <p className="mt-1 text-right text-xs text-zinc-400">
                    ชำระเมื่อ{" "}
                    {new Date(selectedOrder.paid_at).toLocaleTimeString("th-TH", {
                      timeZone: "Asia/Bangkok",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    น.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
