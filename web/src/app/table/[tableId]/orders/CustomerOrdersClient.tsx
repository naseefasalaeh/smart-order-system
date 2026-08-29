"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type OrderOption = {
  id: number;
  option_name: string;
  additional_price: number;
  quantity: number;
};

type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  note: string | null;
  menus: { name: string } | null;
  order_item_options: OrderOption[];
};

type Order = {
  id: number;
  order_number: string | null;
  status: string;
  total_amount: number;
  note: string | null;
  created_at: string;
  order_items: OrderItem[];
};

const statusLabels: Record<string, string> = {
  confirmed: "รับออเดอร์แล้ว",
  preparing: "กำลังทำ",
  ready: "พร้อมเสิร์ฟ",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 2 }).format(value);
}

export default function CustomerOrdersClient({ tableNumber }: { tableNumber: number }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOrders = useCallback(async () => {
    const sessionToken = window.localStorage.getItem(
      `smart-order-session-${tableNumber}`,
    );

    if (!sessionToken) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/customer-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber, sessionToken }),
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.details || result.error || "โหลดออเดอร์ไม่สำเร็จ");
      }

      if (result.session?.status === "closed") {
        window.localStorage.removeItem(
          `smart-order-session-${tableNumber}`,
        );
      }

      setOrders(result.orders ?? []);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "โหลดออเดอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [tableNumber]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => void loadOrders(), 0);
    const timer = window.setInterval(() => void loadOrders(), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadOrders]);

  const total = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "cancelled")
        .reduce((sum, order) => sum + Number(order.total_amount), 0),
    [orders],
  );

  return (
    <main className="min-h-screen bg-zinc-100 px-5 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-orange-500">SMART ORDER</p>
            <h1 className="mt-1 text-3xl font-bold">ออเดอร์ของโต๊ะ {tableNumber}</h1>
            <p className="mt-2 text-sm text-zinc-500">สถานะจะอัปเดตอัตโนมัติ</p>
          </div>
          <Link
            href={`/table/${tableNumber}`}
            className="rounded-xl bg-orange-500 px-4 py-3 font-semibold text-white"
          >
            สั่งเพิ่ม
          </Link>
        </div>

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center">กำลังโหลดออเดอร์...</div>
        ) : error ? (
          <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">{error}</div>
        ) : orders.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center text-zinc-500">
            ยังไม่มีออเดอร์ในรอบโต๊ะนี้
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {orders.map((order) => (
              <article key={order.id} className="rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-bold">ออเดอร์ {order.order_number ?? order.id}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {new Date(order.created_at).toLocaleString("th-TH")}
                    </p>
                  </div>
                  <span className="rounded-full bg-orange-50 px-3 py-1 text-sm font-semibold text-orange-600">
                    {statusLabels[order.status] ?? order.status}
                  </span>
                </div>

                <div className="mt-5 divide-y divide-zinc-100">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="py-4 first:pt-0">
                      <div className="flex justify-between gap-4">
                        <p className="font-semibold">
                          {item.menus?.name ?? "เมนู"} × {item.quantity}
                        </p>
                        <p className="font-semibold">{formatPrice(item.subtotal)} บาท</p>
                      </div>
                      {item.order_item_options.map((option) => (
                        <p key={option.id} className="mt-1 text-sm text-orange-600">
                          {option.option_name} × {option.quantity} ต่อจาน
                        </p>
                      ))}
                      {item.note && <p className="mt-1 text-sm text-zinc-500">{item.note}</p>}
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex justify-between border-t border-zinc-200 pt-4 text-lg font-bold">
                  <span>รวมออเดอร์</span>
                  <span className="text-orange-500">{formatPrice(order.total_amount)} บาท</span>
                </div>
              </article>
            ))}

            <div className="rounded-2xl bg-zinc-900 p-6 text-white">
              <div className="flex items-center justify-between gap-4">
                <span className="font-semibold">ยอดรวมรอบโต๊ะ</span>
                <span className="text-2xl font-bold text-orange-400">{formatPrice(total)} บาท</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
