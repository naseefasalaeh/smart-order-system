"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { formatOrderNumber } from "@/lib/order-number";
import {
  formatThaiPhone,
  memberAgeLabels,
  memberGenderLabels,
  validateMemberPassword,
  generateRandomMemberPassword,
  MEMBER_PASSWORD_HINT,
  type MemberAge,
  type MemberGender,
} from "@/lib/member-input";

export type MemberDetailData = {
  id: string;
  member_code: string;
  phone: string;
  gender: string;
  age_range: string;
  promotion_consent: boolean;
  admin_note?: string | null;
  created_at: string;
  order_count: number;
  total_spent: number;
  device_count: number;
  last_order_at: string | null;
};

export type OrderItemOption = {
  option_name: string;
  additional_price: number;
  quantity: number;
};

export type OrderItem = {
  id: number;
  quantity: number;
  unit_price: number;
  subtotal: number;
  menu_name: string;
  options: OrderItemOption[];
};

export type MemberOrder = {
  id: string;
  order_number?: number;
  table_id: number;
  table_number?: string | number;
  dining_type: string;
  status: string;
  note: string | null;
  total_amount: number;
  created_at: string;
  updated_at: string;
  payment_method?: string | null;
  items: OrderItem[];
};

const statusMap: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: "รอยืนยัน", bg: "bg-amber-100", text: "text-amber-800" },
  confirmed: { label: "รับออเดอร์แล้ว", bg: "bg-blue-100", text: "text-blue-800" },
  cooking: { label: "กำลังปรุง", bg: "bg-orange-100", text: "text-orange-800" },
  preparing: { label: "กำลังปรุง", bg: "bg-orange-100", text: "text-orange-800" },
  ready: { label: "พร้อมเสิร์ฟ", bg: "bg-purple-100", text: "text-purple-800" },
  served: { label: "เสิร์ฟแล้ว", bg: "bg-emerald-100", text: "text-emerald-800" },
  paid: { label: "ชำระเงินแล้ว", bg: "bg-green-100", text: "text-green-800" },
  completed: { label: "สำเร็จ", bg: "bg-green-100", text: "text-green-800" },
  cancelled: { label: "ยกเลิกแล้ว", bg: "bg-red-100", text: "text-red-800" },
};

function formatThaiDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  member: MemberDetailData;
  orders: MemberOrder[];
  onResetPassword: (form: FormData) => Promise<void>;
  onUpdateMember: (form: FormData) => Promise<void>;
};

export default function MemberDetailClient({
  member,
  orders,
  onResetPassword,
  onUpdateMember,
}: Props) {
  // 1. Calculations: Strictly filter completed vs cancelled orders
  const completedOrders = useMemo(() => orders.filter((o) => o.status === "completed"), [orders]);
  const cancelledOrders = useMemo(() => orders.filter((o) => o.status === "cancelled"), [orders]);

  // Use completed stats from orders list, falling back to member detail if orders empty
  const displayOrderCount = useMemo(() => {
    if (completedOrders.length > 0 || cancelledOrders.length > 0) {
      return completedOrders.length;
    }
    return Number(member.order_count || 0);
  }, [completedOrders.length, cancelledOrders.length, member.order_count]);

  const displayTotalSpent = useMemo(() => {
    if (completedOrders.length > 0 || cancelledOrders.length > 0) {
      return completedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    }
    return Number(member.total_spent || 0);
  }, [completedOrders, cancelledOrders.length, member.total_spent]);

  const displayAvgSpend = useMemo(() => {
    return displayOrderCount > 0 ? Math.round(displayTotalSpent / displayOrderCount) : 0;
  }, [displayOrderCount, displayTotalSpent]);

  // 2. Favorite Menus: Top 3 most ordered dishes from completed orders
  const topFavoriteMenus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ord of completedOrders) {
      for (const it of ord.items || []) {
        const name = it.menu_name?.trim();
        if (name) {
          counts[name] = (counts[name] || 0) + Number(it.quantity || 1);
        }
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  }, [completedOrders]);

  // 3. Status filter tabs in Order History
  const [statusFilter, setStatusFilter] = useState<"all" | "completed" | "cancelled">("all");

  const visibleOrders = useMemo(() => {
    if (statusFilter === "completed") return completedOrders;
    if (statusFilter === "cancelled") return cancelledOrders;
    return orders;
  }, [statusFilter, completedOrders, cancelledOrders, orders]);

  // 4. Modal state for editing member basic info
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isEditingPending, startEditTransition] = useTransition();
  const [editError, setEditError] = useState<string | null>(null);

  // 5. Admin Note state & feedback
  // 6. Reset password state & feedback
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetSuccessFeedback, setResetSuccessFeedback] = useState(false);
  const [isResetPending, startResetTransition] = useTransition();

  async function handleResetPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResetPasswordError(null);
    setResetSuccessFeedback(false);

    const validation = validateMemberPassword(resetPasswordVal);
    if (!validation.valid) {
      setResetPasswordError(validation.error || "รหัสผ่านไม่ถูกต้อง");
      return;
    }

    const formData = new FormData();
    formData.append("new_password", resetPasswordVal);

    startResetTransition(async () => {
      try {
        await onResetPassword(formData);
        setResetSuccessFeedback(true);
        setResetPasswordVal("");
        setTimeout(() => setResetSuccessFeedback(false), 4000);
      } catch (err) {
        setResetPasswordError(err instanceof Error ? err.message : "รีเซ็ตรหัสผ่านไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  async function handleUpdateMemberSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEditError(null);
    const form = e.currentTarget;
    const formData = new FormData(form);

    startEditTransition(async () => {
      try {
        await onUpdateMember(formData);
        setIsEditModalOpen(false);
      } catch (err) {
        setEditError(err instanceof Error ? err.message : "แก้ไขข้อมูลไม่สำเร็จ กรุณาลองใหม่");
      }
    });
  }

  return (
    <>
      {/* Breadcrumb & Action Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
            <Link href="/dashboard/members" className="hover:text-orange-600">
              จัดการสมาชิก
            </Link>
            <span>/</span>
            <span className="text-zinc-900">{member.member_code}</span>
          </nav>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-3xl font-black text-zinc-900">{member.member_code}</h1>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
              สมาชิก Smart Order
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Edit Member Button */}
          <button
            type="button"
            onClick={() => {
              setEditError(null);
              setIsEditModalOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-orange-700"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
              <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
            </svg>
            <span>แก้ไขข้อมูลสมาชิก</span>
          </button>

          <Link
            href="/dashboard/members"
            className="flex items-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-xs transition hover:bg-zinc-50"
          >
            <span>&larr; กลับหน้ารายชื่อสมาชิก</span>
          </Link>
        </div>
      </div>

      {/* 1. Top 3 KPI Summary Cards (Full Width, 3 Equal Columns) */}
      <div className="grid gap-5 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500">จำนวนครั้งที่สั่งอาหาร</span>
          <p className="mt-2 text-3xl font-black text-zinc-900">{displayOrderCount} ครั้ง</p>
          <p className="mt-1 text-xs text-zinc-400">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ</p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500">ยอดซื้อสะสมทั้งหมด</span>
          <p className="mt-2 text-3xl font-black text-emerald-600">
            ฿{displayTotalSpent.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-zinc-400">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ</p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <span className="text-xs font-semibold text-zinc-500">ยอดสั่งซื้อเฉลี่ย / ครั้ง</span>
          <p className="mt-2 text-3xl font-black text-orange-600">฿{displayAvgSpend.toLocaleString()}</p>
          <p className="mt-1 text-xs text-zinc-400">Average Order Value (AOV)</p>
        </div>
      </div>

      {/* 2. Middle Row: 2 Equal Columns with Matched Height */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Left Column: ข้อมูลส่วนตัวสมาชิก */}
        <div className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-xs">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-900">ข้อมูลส่วนตัวสมาชิก</h2>
            </div>

            <div className="mt-4 space-y-3 divide-y divide-zinc-100 text-sm">
              <div className="flex items-center justify-between pt-2">
                <span className="text-zinc-500">รหัสสมาชิก</span>
                <span className="font-mono font-bold text-orange-600">{member.member_code}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">เบอร์โทรศัพท์</span>
                <span className="font-mono font-semibold text-zinc-900">{formatThaiPhone(member.phone)}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">เพศ</span>
                <span className="font-semibold text-zinc-800">
                  {memberGenderLabels[member.gender as MemberGender] || member.gender || "ไม่ระบุ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">ช่วงอายุ</span>
                <span className="font-semibold text-zinc-800">
                  {memberAgeLabels[member.age_range as MemberAge] || member.age_range || "ไม่ระบุ"}
                </span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">วันที่สมัครสมาชิก</span>
                <span className="text-zinc-700">{formatThaiDateTime(member.created_at)}</span>
              </div>

              <div className="flex items-center justify-between pt-3">
                <span className="text-zinc-500">การรับโปรโมชัน</span>
                <span className={`font-semibold ${member.promotion_consent ? "text-emerald-700" : "text-zinc-500"}`}>
                  {member.promotion_consent ? "ยินยอมรับข่าวสาร" : "ไม่รับ"}
                </span>
              </div>

              {member.last_order_at && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-zinc-500">สั่งอาหารล่าสุดเมื่อ</span>
                  <span className="text-zinc-700">{formatThaiDateTime(member.last_order_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Reset Password Section at bottom of left card */}
          <div className="mt-6 border-t border-zinc-100 pt-4">
            <details className="group rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold text-amber-800">
                <span>🔑 รีเซ็ตรหัสผ่านให้สมาชิก (เมื่อลืมรหัส)</span>
                <span className="transition group-open:rotate-180">▾</span>
              </summary>
              <form onSubmit={handleResetPasswordSubmit} className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    name="new_password"
                    type="text"
                    minLength={6}
                    maxLength={6}
                    pattern="[A-Za-z0-9]{6}"
                    required
                    value={resetPasswordVal}
                    onChange={(e) => {
                      setResetPasswordVal(e.target.value.replace(/[^A-Za-z0-9]/g, ""));
                      setResetPasswordError(null);
                    }}
                    placeholder="เช่น A1b2C3 (6 ตัวอักษร)"
                    className="min-h-9 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 font-mono text-xs font-medium outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setResetPasswordVal(generateRandomMemberPassword());
                      setResetPasswordError(null);
                    }}
                    className="rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50"
                    title="สุ่มรหัสผ่าน 6 ตัวอักษร"
                  >
                    🎲 สุ่มรหัส
                  </button>
                  <button
                    type="submit"
                    disabled={isResetPending}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-50"
                  >
                    {isResetPending ? "กำลังบันทึก..." : "บันทึกรหัสใหม่"}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-500">{MEMBER_PASSWORD_HINT}</p>
                {resetPasswordError && (
                  <p className="text-xs text-red-600">{resetPasswordError}</p>
                )}
                {resetSuccessFeedback && (
                  <p className="text-xs font-semibold text-emerald-600">✓ บันทึกรหัสผ่านใหม่สำเร็จแล้ว สามารถแจ้งให้สมาชิกใช้งานได้ทันที</p>
                )}
              </form>
            </details>
          </div>
        </div>

        {/* Right Column: สรุปพฤติกรรมลูกค้า & เมนูโปรด */}
        <div className="flex flex-col justify-between rounded-2xl border border-orange-200/90 bg-white p-6 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📊</span>
              <h3 className="font-bold text-zinc-900">สรุปพฤติกรรมลูกค้า &amp; เมนูโปรด</h3>
            </div>

            <p className="mt-3 text-sm text-zinc-600 leading-relaxed">
              สมาชิก <span className="font-mono font-semibold text-zinc-900">{member.member_code}</span> เข้าใช้งานผ่านเบอร์{" "}
              <span className="font-mono font-semibold text-zinc-900">{formatThaiPhone(member.phone)}</span>{" "}
              มียอดสั่งซื้อสะสม <span className="font-bold text-emerald-700">฿{displayTotalSpent.toLocaleString()}</span> จาก{" "}
              <span className="font-bold text-zinc-900">{displayOrderCount} ออเดอร์</span>{" "}
              <span className="text-xs text-zinc-500">(เฉพาะออเดอร์ที่ชำระเงินสำเร็จ)</span>
              {member.last_order_at ? ` · สั่งอาหารล่าสุดเมื่อ ${formatThaiDateTime(member.last_order_at)}` : ""}
            </p>

            {/* Favorite dishes section with rank badges */}
            <div className="mt-5 border-t border-orange-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-900">
                  ⭐ 3 อันดับเมนูโปรดที่สั่งบ่อยที่สุด
                </span>
                <span className="text-[11px] font-medium text-zinc-400">คำนวณจากบิลสำเร็จ</span>
              </div>

              {topFavoriteMenus.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {topFavoriteMenus.map((fav, index) => {
                    const rankStyles = [
                      {
                        badge: "bg-amber-500 text-white shadow-xs",
                        card: "border-amber-200 bg-amber-50/40",
                        medal: "🥇",
                      },
                      {
                        badge: "bg-zinc-500 text-white shadow-xs",
                        card: "border-zinc-200 bg-zinc-50/60",
                        medal: "🥈",
                      },
                      {
                        badge: "bg-orange-600 text-white shadow-xs",
                        card: "border-orange-200 bg-orange-50/40",
                        medal: "🥉",
                      },
                    ];
                    const style = rankStyles[index] || {
                      badge: "bg-zinc-400 text-white",
                      card: "border-zinc-200 bg-white",
                      medal: `#${index + 1}`,
                    };

                    return (
                      <div
                        key={fav.name}
                        className={`flex items-center justify-between rounded-xl border p-3 transition shadow-2xs ${style.card}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-xs font-black ${style.badge}`}>
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">{fav.name}</p>
                            <p className="text-[11px] text-zinc-500">อันดับที่ {index + 1} {style.medal}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 text-xs font-black text-orange-700 shadow-2xs border border-orange-200/60">
                            {fav.count} จาน
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-zinc-200 p-6 text-center text-xs text-zinc-400">
                  ยังไม่มีข้อมูลเมนูอาหารที่สั่งสำเร็จ
                </div>
              )}
            </div>
          </div>

          <p className="mt-6 border-t border-orange-100/80 pt-3 text-[11px] text-zinc-400">
            💡 ข้อมูลนี้ช่วยให้พนักงานสามารถแนะนำเมนูที่ลูกค้าชื่นชอบ หรือจัดโปรโมชันเฉพาะบุคคลได้ดียิ่งขึ้น
          </p>
        </div>
      </div>

      {/* Full Order History Section */}
      <section aria-label="ประวัติการสั่งอาหารทั้งหมด" className="mt-10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-900">ประวัติการสั่งอาหารทั้งหมด</h2>
            <p className="text-xs text-zinc-500">รายการคำสั่งซื้อทั้งหมดที่ผูกกับรหัสสมาชิกนี้</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-100 border border-zinc-200 px-3.5 py-1 text-xs font-semibold text-zinc-700">
              ทั้งหมด {orders.length} ออเดอร์{" "}
              <span className="text-emerald-700 font-bold">(สำเร็จ {completedOrders.length}</span>
              {" · "}
              <span className="text-red-600 font-bold">ยกเลิก {cancelledOrders.length})</span>
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 rounded-xl bg-zinc-100 p-1 text-xs font-semibold w-fit">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-lg px-3.5 py-1.5 transition ${
              statusFilter === "all"
                ? "bg-white text-zinc-900 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            ทั้งหมด ({orders.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
              statusFilter === "completed"
                ? "bg-white text-emerald-700 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            สำเร็จ ({completedOrders.length})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("cancelled")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 transition ${
              statusFilter === "cancelled"
                ? "bg-white text-red-700 shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            ยกเลิก ({cancelledOrders.length})
          </button>
        </div>

        {/* Orders List */}
        {visibleOrders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center text-zinc-500">
            {statusFilter === "all"
              ? "สมาชิกท่านนี้ยังไม่มีประวัติการสั่งอาหารในระบบ"
              : statusFilter === "completed"
              ? "ไม่มีรายการคำสั่งซื้อที่สำเร็จ"
              : "ไม่มีรายการคำสั่งซื้อที่ถูกยกเลิก"}
          </div>
        ) : (
          <div className="space-y-4">
            {visibleOrders.map((ord) => {
              const st = statusMap[ord.status] || {
                label: ord.status,
                bg: "bg-zinc-100",
                text: "text-zinc-800",
              };
              return (
                <div
                  key={ord.id}
                  className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-orange-300"
                >
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="font-mono text-sm font-bold text-orange-600">
                        {formatOrderNumber(ord.order_number)}
                      </span>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                      <span className="rounded-md bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                        โต๊ะ {ord.table_number || ord.table_id}
                      </span>
                      <span className="text-xs text-zinc-500">
                        รูปแบบ: {ord.dining_type === "takeaway" ? "สั่งกลับบ้าน" : "ทานที่ร้าน"}
                      </span>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs text-zinc-400">{formatThaiDateTime(ord.created_at)}</span>
                      <span className="font-mono text-lg font-black text-zinc-900">
                        ฿{Number(ord.total_amount).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Order items detail */}
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-zinc-500">รายการอาหารในออเดอร์:</p>
                    <div className="mt-2 divide-y divide-zinc-100">
                      {ord.items?.map((item) => (
                        <div key={item.id} className="flex items-start justify-between py-2 text-sm">
                          <div>
                            <p className="font-semibold text-zinc-800">
                              {item.menu_name}{" "}
                              <span className="font-normal text-zinc-500">× {item.quantity}</span>
                            </p>
                            {item.options?.length > 0 && (
                              <p className="text-xs text-zinc-400">
                                {item.options
                                  .map(
                                    (opt) =>
                                      `${opt.option_name}${
                                        opt.additional_price > 0 ? ` (+฿${opt.additional_price})` : ""
                                      }`
                                  )
                                  .join(", ")}
                              </p>
                            )}
                          </div>
                          <span className="font-mono font-bold text-zinc-900">
                            ฿{Number(item.subtotal).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>

                    {ord.note && (
                      <p className="mt-2 text-xs text-zinc-500">
                        <span className="font-semibold">หมายเหตุ:</span> {ord.note}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal: Edit Member Info */}
      {isEditModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-in">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">✏️</span>
                <h3 className="text-lg font-bold text-zinc-900">แก้ไขข้อมูลสมาชิก</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateMemberSubmit} className="mt-4 space-y-4">
              <input type="hidden" name="member_id" value={member.id} />

              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-700">
                  รหัสสมาชิก
                </label>
                <input
                  type="text"
                  disabled
                  value={member.member_code}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2 font-mono text-sm text-zinc-500"
                />
              </div>

              <div>
                <label htmlFor="edit_phone" className="mb-1 block text-xs font-semibold text-zinc-700">
                  เบอร์โทรศัพท์ <span className="text-red-500">*</span>
                </label>
                <input
                  id="edit_phone"
                  name="phone"
                  type="tel"
                  required
                  defaultValue={member.phone}
                  placeholder="เช่น 0812345678"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                />
              </div>

              <div>
                <label htmlFor="edit_gender" className="mb-1 block text-xs font-semibold text-zinc-700">
                  เพศ
                </label>
                <select
                  id="edit_gender"
                  name="gender"
                  defaultValue={member.gender || "unspecified"}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                >
                  <option value="unspecified">ไม่ระบุ</option>
                  <option value="female">หญิง</option>
                  <option value="male">ชาย</option>
                  <option value="other">อื่น ๆ</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit_age" className="mb-1 block text-xs font-semibold text-zinc-700">
                  ช่วงอายุ
                </label>
                <select
                  id="edit_age"
                  name="age"
                  defaultValue={member.age_range || "unspecified"}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                >
                  <option value="unspecified">ไม่ระบุ</option>
                  <option value="under18">ต่ำกว่า 18 ปี</option>
                  <option value="18-24">18 - 24 ปี</option>
                  <option value="25-34">25 - 34 ปี</option>
                  <option value="35-44">35 - 44 ปี</option>
                  <option value="45-54">45 - 54 ปี</option>
                  <option value="55plus">55 ปีขึ้นไป</option>
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  name="promotions"
                  defaultChecked={member.promotion_consent}
                  className="h-4 w-4 rounded accent-orange-600"
                />
                <span className="text-xs text-zinc-700">ยินยอมรับข่าวสารและสิทธิพิเศษจากทางร้าน</span>
              </label>

              {editError && (
                <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                  {editError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isEditingPending}
                  className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-orange-700 disabled:opacity-50"
                >
                  {isEditingPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
