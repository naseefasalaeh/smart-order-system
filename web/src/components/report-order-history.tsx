"use client";

import { useMemo, useState } from "react";
import { formatOrderCode, formatOrderNumber } from "@/lib/order-number";

export type HistoryOrderItemOption = {
  option_name: string;
  additional_price?: number;
  quantity?: number;
};

export type HistoryOrderItem = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  subtotal: number;
  note?: string | null;
  menu_name_snapshot?: string | null;
  menus?: { name: string } | { name: string }[] | null;
  order_item_options?: HistoryOrderItemOption[];
};

export type HistoryOrder = {
  id: string;
  order_number: number;
  total_amount: number;
  dining_type: "dine_in" | "takeaway" | string;
  status: string;
  note?: string | null;
  created_at: string;
  updated_at?: string;
  restaurant_tables?: { table_number: string } | { table_number: string }[] | null;
  payment_method?: string | null;
  paid_at?: string | null;
  order_items: HistoryOrderItem[];
};

function money(amount: number | null | undefined): string {
  if (amount == null) return "0";
  return amount.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatOrderDateTime(dateStr: string) {
  const d = new Date(dateStr);
  return (
    d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }) + " น."
  );
}

function getTableDisplay(order: HistoryOrder): { text: string; isTakeaway: boolean } {
  if (order.dining_type === "takeaway") {
    return { text: "กลับบ้าน", isTakeaway: true };
  }
  const tableObj = Array.isArray(order.restaurant_tables)
    ? order.restaurant_tables[0]
    : order.restaurant_tables;
  return {
    text: tableObj?.table_number ? `โต๊ะ ${tableObj.table_number}` : "ไม่ระบุโต๊ะ",
    isTakeaway: false,
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return {
        label: "เสร็จสิ้น",
        className: "bg-emerald-100 text-emerald-800 border border-emerald-200/60 font-semibold",
      };
    case "cancelled":
      return {
        label: "ยกเลิก",
        className: "bg-rose-100 text-rose-800 border border-rose-200/60 font-semibold",
      };
    default:
      return {
        label: "กำลังทำ",
        className: "bg-amber-100 text-amber-800 border border-amber-200/60 font-semibold",
      };
  }
}

export default function ReportOrderHistory({
  orders,
}: {
  orders: HistoryOrder[];
}) {
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [selectedOrder, setSelectedOrder] = useState<HistoryOrder | null>(null);

  // Status counts
  const totalCount = orders.length;
  const completedCount = useMemo(() => orders.filter((o) => o.status === "completed").length, [orders]);
  const cancelledCount = useMemo(() => orders.filter((o) => o.status === "cancelled").length, [orders]);

  // Filtering
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((order) => {
      // 1. Status Filter
      if (statusFilter !== "all" && order.status !== statusFilter) {
        return false;
      }

      // 2. Search Query
      if (!q) return true;

      const orderNumberStr = String(order.order_number).toLowerCase();
      const orderNumWithHash = `#${orderNumberStr}`;
      const orderCode = formatOrderCode(order.order_number, order.created_at).toLowerCase();
      const tableInfo = getTableDisplay(order);
      const tableText = tableInfo.text.toLowerCase();

      const matchesOrderNumber =
        orderNumberStr.includes(q) ||
        orderNumWithHash.includes(q) ||
        orderCode.includes(q);

      const matchesTable =
        tableText.includes(q) ||
        (tableInfo.isTakeaway && (q.includes("กลับ") || q.includes("takeaway")));

      const matchesMenuItems = (order.order_items ?? []).some((item) => {
        const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
        const name = (item.menu_name_snapshot ?? menuObj?.name ?? "").toLowerCase();
        return name.includes(q);
      });

      return matchesOrderNumber || matchesTable || matchesMenuItems;
    });
  }, [orders, search, statusFilter]);

  // Reset pagination when filter or search changes
  const handleFilterChange = (newStatus: "all" | "completed" | "cancelled") => {
    setStatusFilter(newStatus);
    setCurrentPage(1);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
  };

  // Pagination calculation
  const totalItems = filteredOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedOrders = filteredOrders.slice(startIndex, endIndex);

  return (
    <>
      <section
        id="report-order-history-section"
        className="no-print mt-8 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print:hidden"
      >
        {/* Header */}
        <div className="flex flex-col gap-4 border-b border-zinc-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🧾</span>
              <h3 className="text-xl font-bold text-zinc-900">
                ประวัติคำสั่งซื้อในช่วงเวลาที่เลือก
              </h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              รายการคำสั่งซื้อทั้งหมด ({totalCount} รายการ) · คลิกที่แถวเพื่อเปิดดูรายละเอียดบิลย้อนหลัง
            </p>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleFilterChange("all")}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                statusFilter === "all"
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "border border-zinc-200 bg-zinc-50/70 text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              <span>ทั้งหมด</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  statusFilter === "all"
                    ? "bg-zinc-800 text-zinc-200"
                    : "bg-zinc-200/80 text-zinc-700"
                }`}
              >
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("completed")}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                statusFilter === "completed"
                  ? "bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200"
                  : "border border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100/70"
              }`}
            >
              <span>✓ เสร็จสิ้น</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  statusFilter === "completed"
                    ? "bg-emerald-700 text-white"
                    : "bg-emerald-200 text-emerald-800"
                }`}
              >
                {completedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleFilterChange("cancelled")}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                statusFilter === "cancelled"
                  ? "bg-rose-600 text-white shadow-xs ring-2 ring-rose-200"
                  : "border border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100/70"
              }`}
            >
              <span>✕ ยกเลิก</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  statusFilter === "cancelled"
                    ? "bg-rose-700 text-white"
                    : "bg-rose-200 text-rose-800"
                }`}
              >
                {cancelledCount}
              </span>
            </button>
          </div>
        </div>

        {/* Search & Controls */}
        <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="search"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="ค้นหาเลขออเดอร์, โต๊ะ หรือชื่อเมนู..."
              className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-xs outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <span>แสดงหน้าละ:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-orange-500"
            >
              <option value={10}>10 รายการ</option>
              <option value={15}>15 รายการ</option>
              <option value={25}>25 รายการ</option>
              <option value={50}>50 รายการ</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {filteredOrders.length === 0 ? (
          <div className="px-6 py-14 text-center text-zinc-500">
            <span className="text-3xl">🔍</span>
            <p className="mt-2 text-sm font-semibold">ไม่พบบิลคำสั่งซื้อที่ตรงกับเงื่อนไข</p>
            <p className="mt-1 text-xs text-zinc-400">
              ลองเปลี่ยนสถานะหรือคำค้นหา หรือเลือกช่วงเวลาอื่นด้านบน
            </p>
            {(search || statusFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                }}
                className="mt-3 text-xs font-semibold text-orange-600 hover:underline"
              >
                ล้างตัวกรองทั้งหมด
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-left">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70 text-xs font-semibold text-zinc-500">
                  <th className="px-4 py-3.5">เลขออเดอร์</th>
                  <th className="px-4 py-3.5">วันที่และเวลา</th>
                  <th className="px-4 py-3.5">โต๊ะ / ประเภท</th>
                  <th className="px-4 py-3.5">รายการอาหารโดยย่อ</th>
                  <th className="px-4 py-3.5">ช่องทางชำระเงิน</th>
                  <th className="px-4 py-3.5 text-right">ยอดรวม</th>
                  <th className="px-4 py-3.5 text-center">สถานะ</th>
                  <th className="px-3 py-3.5 text-center w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs">
                {paginatedOrders.map((order) => {
                  const tableDisplay = getTableDisplay(order);
                  const statusBadge = getStatusBadge(order.status);
                  const items = order.order_items ?? [];

                  // Short food summary (up to 2 items + count)
                  const itemSummaries = items.slice(0, 2).map((it) => {
                    const menuObj = Array.isArray(it.menus) ? it.menus[0] : it.menus;
                    const name = it.menu_name_snapshot ?? menuObj?.name ?? "อาหาร";
                    return `${name}${it.quantity > 1 ? ` (×${it.quantity})` : ""}`;
                  });
                  const extraCount = items.length - 2;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => setSelectedOrder(order)}
                      className="group cursor-pointer transition hover:bg-orange-50/50"
                    >
                      {/* 1. เลขออเดอร์ */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className="font-bold text-zinc-900 group-hover:text-orange-600 transition">
                          {formatOrderNumber(order.order_number)}
                        </span>
                        <p className="text-[10px] text-zinc-400 font-mono">
                          {formatOrderCode(order.order_number, order.created_at)}
                        </p>
                      </td>

                      {/* 2. วันที่และเวลา */}
                      <td className="px-4 py-4 text-zinc-600 whitespace-nowrap">
                        {formatOrderDateTime(order.created_at)}
                      </td>

                      {/* 3. โต๊ะ / ประเภท */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {tableDisplay.isTakeaway ? (
                          <span className="inline-flex items-center rounded-md bg-purple-50 px-2 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200/60">
                            กลับบ้าน
                          </span>
                        ) : (
                          <span className="font-semibold text-zinc-700">
                            {tableDisplay.text}
                          </span>
                        )}
                      </td>

                      {/* 4. รายการอาหารโดยย่อ */}
                      <td className="px-4 py-4 max-w-xs">
                        {items.length === 0 ? (
                          <span className="text-zinc-400">-</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-zinc-700 truncate">
                              {itemSummaries.join(", ")}
                            </span>
                            {extraCount > 0 && (
                              <span className="inline-block rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 whitespace-nowrap">
                                +อีก {extraCount}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* 5. ช่องทางชำระเงิน */}
                      <td className="px-4 py-4 whitespace-nowrap text-zinc-600 font-medium">
                        {order.status === "cancelled" ? (
                          <span className="text-zinc-400">-</span>
                        ) : order.payment_method === "เงินสด" || order.payment_method === "cash" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                            <span>💵</span>
                            <span>เงินสด</span>
                          </span>
                        ) : order.payment_method === "QR Code" || order.payment_method === "qr" || order.payment_method === "qr_code" ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-semibold">
                            <span>📱</span>
                            <span>QR Code</span>
                          </span>
                        ) : order.payment_method ? (
                          <span>{order.payment_method}</span>
                        ) : order.status === "completed" ? (
                          <span className="text-emerald-700">ชำระแล้ว</span>
                        ) : (
                          <span className="text-zinc-400">ยังไม่ชำระ</span>
                        )}
                      </td>

                      {/* 6. ยอดรวม */}
                      <td className="px-4 py-4 text-right whitespace-nowrap font-mono font-bold text-sm text-zinc-900">
                        ฿{money(order.total_amount)}
                      </td>

                      {/* 7. สถานะ */}
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* 8. ลูกศรรายละเอียด */}
                      <td className="px-3 py-4 text-center text-zinc-300 group-hover:text-orange-500 group-hover:translate-x-0.5 transition">
                        →
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredOrders.length > 0 && (
          <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <div>
              แสดง{" "}
              <span className="font-semibold text-zinc-800">
                {startIndex + 1} - {endIndex}
              </span>{" "}
              จากทั้งหมด{" "}
              <span className="font-semibold text-zinc-800">{totalItems}</span> รายการ
              {totalPages > 1 && (
                <span className="ml-1 text-zinc-400">
                  (หน้า {validCurrentPage} / {totalPages})
                </span>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                {/* Previous Button */}
                <button
                  type="button"
                  disabled={validCurrentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none"
                >
                  ‹ ก่อนหน้า
                </button>

                {/* Number Buttons */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    // Show first, last, and pages close to current
                    return (
                      p === 1 ||
                      p === totalPages ||
                      Math.abs(p - validCurrentPage) <= 1
                    );
                  })
                  .map((p, idx, arr) => {
                    const prev = arr[idx - 1];
                    const showEllipsis = prev && p - prev > 1;

                    return (
                      <span key={p} className="flex items-center">
                        {showEllipsis && <span className="px-1 text-zinc-400">…</span>}
                        <button
                          type="button"
                          onClick={() => setCurrentPage(p)}
                          className={`min-w-[32px] h-8 rounded-lg text-xs font-bold transition ${
                            p === validCurrentPage
                              ? "bg-orange-500 text-white shadow-xs"
                              : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                          }`}
                        >
                          {p}
                        </button>
                      </span>
                    );
                  })}

                {/* Next Button */}
                <button
                  type="button"
                  disabled={validCurrentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 disabled:pointer-events-none"
                >
                  ถัดไป ›
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ====================================================
          Slide-over Drawer: รายละเอียดบิลคำสั่งซื้อย้อนหลัง
          ==================================================== */}
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
              <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-orange-50/40">
                <div>
                  <div className="flex items-center gap-2">
                    <h2
                      id="slide-over-title"
                      className="text-2xl font-black text-zinc-900"
                    >
                      {formatOrderCode(selectedOrder.order_number, selectedOrder.created_at)}
                    </h2>
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs ${
                        getStatusBadge(selectedOrder.status).className
                      }`}
                    >
                      {getStatusBadge(selectedOrder.status).label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-zinc-600">
                    {getTableDisplay(selectedOrder).text}
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
                <div className="grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 p-4 text-xs text-zinc-600 border border-zinc-100">
                  <div>
                    <span className="text-zinc-400 block mb-0.5">วันที่และเวลาที่สั่ง</span>
                    <span className="font-semibold text-zinc-800">
                      {formatOrderDateTime(selectedOrder.created_at)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block mb-0.5">ช่องทางการชำระเงิน</span>
                    <span className="font-semibold text-zinc-800">
                      {selectedOrder.status === "cancelled" ? (
                        <span className="text-zinc-400">ยกเลิกแล้ว</span>
                      ) : selectedOrder.payment_method === "เงินสด" || selectedOrder.payment_method === "cash" ? (
                        "💵 เงินสด"
                      ) : selectedOrder.payment_method === "QR Code" || selectedOrder.payment_method === "qr" || selectedOrder.payment_method === "qr_code" ? (
                        "📱 QR Code"
                      ) : selectedOrder.payment_method ? (
                        selectedOrder.payment_method
                      ) : selectedOrder.status === "completed" ? (
                        "ชำระแล้ว"
                      ) : (
                        "ยังไม่ชำระ"
                      )}
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
                        <span className="font-semibold">ผู้ดำเนินการ:</span> ลูกค้าหน้าร้าน / เจ้าหน้าที่ร้านค้า
                      </p>
                    </div>
                  </div>
                )}

                {/* Order Items List */}
                <div>
                  <h4 className="text-sm font-bold text-zinc-900 mb-3">
                    รายการอาหาร ({selectedOrder.order_items.length} รายการ)
                  </h4>
                  <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100 overflow-hidden">
                    {selectedOrder.order_items.map((item) => {
                      const menuObj = Array.isArray(item.menus) ? item.menus[0] : item.menus;
                      const name = item.menu_name_snapshot ?? menuObj?.name ?? "อาหาร";
                      const options = item.order_item_options
                        ?.map((o) => `${o.option_name}${o.quantity && o.quantity > 1 ? ` ×${o.quantity}` : ""}`)
                        .join(", ");
                      const unitPrice =
                        item.unit_price ??
                        (item.quantity > 0 ? Number(item.subtotal) / item.quantity : 0);
                      const subtotal = Number(item.subtotal ?? unitPrice * item.quantity);

                      return (
                        <li key={item.id} className="p-3.5 bg-white">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-zinc-900 text-sm">{name}</p>
                              {options && (
                                <p className="text-xs text-zinc-500 mt-0.5">({options})</p>
                              )}
                              <p className="text-xs text-zinc-500 mt-1">
                                ฿{money(unitPrice)} × {item.quantity} จาน
                              </p>
                              {item.note && (
                                <p className="text-xs text-amber-700 mt-1 bg-amber-50 rounded px-2 py-0.5 inline-block">
                                  หมายเหตุ: {item.note}
                                </p>
                              )}
                            </div>
                            <span className="font-bold text-zinc-900 text-sm whitespace-nowrap font-mono">
                              ฿{money(subtotal)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-6 border-t border-zinc-100 bg-zinc-50/50">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-zinc-600">ยอดรวมสุทธิ</span>
                  <div className="text-2xl font-black text-orange-600 font-mono">
                    ฿{money(selectedOrder.total_amount)}
                  </div>
                </div>
                {selectedOrder.paid_at && (
                  <p className="mt-1 text-right text-xs text-zinc-400">
                    ชำระเงินเมื่อ{" "}
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
