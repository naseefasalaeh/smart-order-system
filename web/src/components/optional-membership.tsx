"use client";

import { useEffect, useRef, useState } from "react";
import { formatOrderNumber } from "@/lib/order-number";
import {
  formatThaiPhone,
  memberAgeLabels,
  memberAges,
  memberGenderLabels,
  memberGenders,
  type MemberAge,
  type MemberGender,
} from "@/lib/member-input";

type MemberData = {
  id: string;
  memberCode: string;
  phone: string;
  gender: MemberGender;
  age: MemberAge;
  promotions: boolean;
  createdAt: string;
};

type OrderSummary = {
  id: string;
  order_number?: number | string | null;
  table_id: number;
  total_amount: number;
  status: string;
  dining_type: string;
  created_at: string;
  item_count: number;
};

type OrderDetailItem = {
  menu_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  options: Array<{ name: string; choice: string; price: number }>;
};

type OrderDetail = {
  id: string;
  order_number?: number | string | null;
  table_id: number;
  total_amount: number;
  status: string;
  dining_type: string;
  order_note: string | null;
  payment_method: string | null;
  created_at: string;
  items: OrderDetailItem[];
};

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
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

function formatThaiDateTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export default function OptionalMembership() {
  const [state, setState] = useState<"guest" | "pending" | "member">("guest");
  const [member, setMember] = useState<MemberData | null>(null);
  const [activeTab, setActiveTab] = useState<"register" | "login">("register");

  // Profile Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [editGender, setEditGender] = useState<MemberGender>("unspecified");
  const [editAge, setEditAge] = useState<MemberAge>("unspecified");
  const [editPromotions, setEditPromotions] = useState(false);

  // Order History State
  const [showHistory, setShowHistory] = useState(false);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [duplicatePhone, setDuplicatePhone] = useState<string | null>(null);

  async function refresh() {
    try {
      const response = await fetch("/api/membership", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setState(data.state);
      if (data.member) {
        setMember(data.member);
        setEditGender(data.member.gender || "unspecified");
        setEditAge(data.member.age || "unspecified");
        setEditPromotions(Boolean(data.member.promotions));
      } else {
        setMember(null);
      }
    } catch {
      /* Membership is optional; ordering remains available. */
    }
  }

  // Auto poll status if in pending state so when admin approves, user screen turns active automatically!
  useEffect(() => {
    if (state !== "pending") return;
    const interval = setInterval(() => {
      void refresh();
    }, 4000);
    return () => clearInterval(interval);
  }, [state]);

  async function fetchOrders() {
    setLoadingOrders(true);
    setSelectedOrder(null);
    try {
      const res = await fetch("/api/membership/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch {
      // Ignore background fetch error
    } finally {
      setLoadingOrders(false);
    }
  }

  async function viewOrderDetail(orderId: string) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/membership/orders/${orderId}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSelectedOrder(data.order);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleRegister(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    const formPhone = String(form.get("phone") ?? "");
    try {
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enroll",
          phone: formPhone,
          password: form.get("password"),
          gender: form.get("gender"),
          age: form.get("age"),
          accept: form.get("accept") === "on",
          promotions: form.get("promotions") === "on",
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setDuplicatePhone(null);
        setMessage(result.message || "ส่งคำขอสมัครสมาชิกแล้ว");
        setMessageType("success");
        await refresh();
      } else {
        if (result.isDuplicate || response.status === 409) {
          setDuplicatePhone(formPhone);
        } else {
          setDuplicatePhone(null);
        }
        setMessage(result.error || "สมัครสมาชิกไม่สำเร็จ");
        setMessageType("error");
      }
    } catch {
      setDuplicatePhone(null);
      setMessage("เชื่อมต่อระบบไม่สำเร็จ การสั่งอาหารยังใช้ได้ตามปกติ");
      setMessageType("error");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "login",
          phone: form.get("phone"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(result.message || "เข้าสู่ระบบสำเร็จ");
        setMessageType("success");
        await refresh();
      } else {
        setMessage(result.error || "เข้าสู่ระบบไม่สำเร็จ");
        setMessageType("error");
      }
    } catch {
      setMessage("เชื่อมต่อระบบไม่สำเร็จ การสั่งอาหารยังใช้ได้ตามปกติ");
      setMessageType("error");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  async function handleUpdateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/api/membership", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: editGender,
          age: editAge,
          promotions: editPromotions,
        }),
      });
      const result = await response.json();
      if (response.ok) {
        setMessage(result.message || "บันทึกข้อมูลเรียบร้อยแล้ว");
        setMessageType("success");
        setIsEditing(false);
        if (result.member) {
          setMember(result.member);
        } else {
          await refresh();
        }
      } else {
        setMessage(result.error || "บันทึกข้อมูลไม่สำเร็จ");
        setMessageType("error");
      }
    } catch {
      setMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
      setMessageType("error");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  async function handleLogout() {
    if (locked.current) return;
    if (!window.confirm("คุณต้องการออกจากระบบสมาชิกใช่หรือไม่?")) return;
    locked.current = true;
    setPending(true);
    setMessage("");

    try {
      const response = await fetch("/api/membership", { method: "DELETE" });
      const result = await response.json();
      setMessage(result.message || "ออกจากระบบเรียบร้อยแล้ว");
      setMessageType("info");
      setState("guest");
      setMember(null);
      setShowHistory(false);
      setSelectedOrder(null);
    } catch {
      setMessage("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่");
      setMessageType("error");
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <details
      ref={detailsRef}
      onToggle={(event) => {
        if (event.currentTarget.open) void refresh();
      }}
      className="group mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gradient-to-r from-orange-50 to-white p-5 marker:hidden sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-4">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700 shadow-inner"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8">
              <path
                d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1v6m3-3h-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div>
            <span className="flex items-center gap-2 font-bold text-zinc-900">
              {state === "member" && member ? (
                <>
                  <span>บัตรสมาชิก Smart Order</span>
                  <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-semibold text-white">
                    {member.memberCode}
                  </span>
                </>
              ) : state === "pending" ? (
                <span className="text-amber-800">คำขอสมาชิกรอแอดมินยืนยัน</span>
              ) : (
                <span>ระบบสมาชิก Smart Order</span>
              )}
            </span>
            <span className="mt-0.5 block text-sm text-zinc-600">
              {state === "member"
                ? "เป็นสมาชิกแล้ว · สั่งอาหารสะสมประวัติอัตโนมัติ"
                : state === "pending"
                ? "พนักงานจะกดยืนยันให้ในระบบ คุณสามารถสั่งอาหารต่อได้เลย"
                : "สมัครฟรี! เพื่อดูประวัติการสั่งซื้อ จัดการข้อมูลส่วนตัว และรับสิทธิพิเศษจากทางร้าน"}
            </span>
          </div>
        </span>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 transition-transform group-open:rotate-180"
          aria-hidden="true"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
            <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </summary>

      <div className="border-t border-zinc-100 p-5 sm:p-6">
        {/* =====================================================================
            STATE 1: ACTIVE MEMBER (บัตรสมาชิกดิจิทัล)
           ===================================================================== */}
        {state === "member" && member && (
          <div className="space-y-5">
            {/* Digital Member Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-900 via-zinc-800 to-orange-950 p-6 text-white shadow-md">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-widest text-orange-400">Smart Order Member</span>
                  <p className="mt-1 font-mono text-2xl font-black tracking-wider text-white">{member.memberCode}</p>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-1.5 backdrop-blur-sm">
                  <span className="text-xs text-zinc-300">เบอร์โทรศัพท์</span>
                  <p className="font-mono text-sm font-bold text-white">{formatThaiPhone(member.phone)}</p>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 sm:grid-cols-4">
                <div>
                  <span className="text-xs text-zinc-400">เพศ</span>
                  <p className="text-sm font-semibold text-zinc-100">{memberGenderLabels[member.gender] || "ไม่ระบุ"}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-400">ช่วงอายุ</span>
                  <p className="text-sm font-semibold text-zinc-100">{memberAgeLabels[member.age] || "ไม่ระบุ"}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-400">วันที่สมัคร</span>
                  <p className="text-sm font-semibold text-zinc-100">{formatThaiDateTime(member.createdAt)}</p>
                </div>
                <div>
                  <span className="text-xs text-zinc-400">รับโปรโมชัน</span>
                  <p className="text-sm font-semibold text-zinc-100">{member.promotions ? "ยินยอม" : "ไม่รับ"}</p>
                </div>
              </div>
            </div>

            {/* Member Action Bar */}
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(!isEditing);
                  setShowHistory(false);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  isEditing ? "bg-orange-600 text-white" : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                <span>{isEditing ? "ปิดการแก้ไข" : "แก้ไขข้อมูลส่วนตัว"}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !showHistory;
                  setShowHistory(next);
                  setIsEditing(false);
                  if (next) void fetchOrders();
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  showHistory ? "bg-orange-600 text-white" : "border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                }`}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                  <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                </svg>
                <span>{showHistory ? "ซ่อนประวัติการสั่ง" : "ประวัติการสั่งอาหาร"}</span>
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={() => void handleLogout()}
                className="ml-auto flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" />
                </svg>
                <span>ออกจากระบบ</span>
              </button>
            </div>

            {/* Profile Edit Form */}
            {isEditing && (
              <form onSubmit={handleUpdateProfile} className="mt-4 rounded-xl border border-orange-200 bg-orange-50/50 p-5">
                <h3 className="font-bold text-zinc-900">แก้ไขข้อมูลส่วนตัว</h3>
                <p className="mt-1 text-xs text-zinc-500">ข้อมูลเพศและช่วงอายุใช้เพื่อสรุปสถิติเมนูอาหารของร้าน</p>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                    เพศ
                    <select
                      value={editGender}
                      onChange={(e) => setEditGender(e.target.value as MemberGender)}
                      className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    >
                      {memberGenders.map((g) => (
                        <option key={g} value={g}>
                          {memberGenderLabels[g]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                    ช่วงอายุ
                    <select
                      value={editAge}
                      onChange={(e) => setEditAge(e.target.value as MemberAge)}
                      className="min-h-11 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    >
                      {memberAges.map((a) => (
                        <option key={a} value={a}>
                          {memberAgeLabels[a]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 rounded-lg bg-white p-3">
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-700">
                    <input
                      type="checkbox"
                      checked={editPromotions}
                      onChange={(e) => setEditPromotions(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-orange-600"
                    />
                    <span>ยินยอมรับข้อมูลข่าวสารและโปรโมชันของทางร้าน</span>
                  </label>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-60"
                  >
                    {pending ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
                  >
                    ยกเลิก
                  </button>
                </div>
              </form>
            )}

            {/* Order History Panel */}
            {showHistory && (
              <div className="mt-4 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900">ประวัติการสั่งอาหารของคุณ</h3>
                  <button
                    type="button"
                    onClick={() => void fetchOrders()}
                    className="text-xs font-semibold text-orange-600 underline"
                  >
                    รีเฟรชประวัติ
                  </button>
                </div>

                {loadingOrders ? (
                  <p className="py-6 text-center text-sm text-zinc-500">กำลังโหลดประวัติการสั่งอาหาร...</p>
                ) : orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-zinc-500">
                    <p className="font-semibold text-zinc-700">ยังไม่มีประวัติการสั่งอาหาร</p>
                    <p className="mt-1 text-xs">เมื่อคุณสั่งอาหารในสถานะสมาชิก รายการจะปรากฏที่นี่</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((ord) => {
                      const st = statusConfig[ord.status] || {
                        label: ord.status,
                        bg: "bg-zinc-100",
                        text: "text-zinc-800",
                      };
                      const isSelected = selectedOrder?.id === ord.id;
                      return (
                        <div
                          key={ord.id}
                          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-orange-300"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-orange-600">
                                  {formatOrderNumber(ord.order_number)}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.bg} ${st.text}`}>
                                  {st.label}
                                </span>
                                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                                  โต๊ะ {ord.table_id}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-zinc-400">{formatThaiDateTime(ord.created_at)}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-bold text-zinc-900">฿{Number(ord.total_amount).toLocaleString()}</span>
                              <p className="text-xs text-zinc-500">{ord.item_count} รายการ</p>
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end border-t border-zinc-100 pt-3">
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) setSelectedOrder(null);
                                else void viewOrderDetail(ord.id);
                              }}
                              className="text-xs font-semibold text-orange-600 underline underline-offset-2 hover:text-orange-700"
                            >
                              {isSelected ? "ซ่อนรายละเอียด" : "ดูรายละเอียดอาหาร"}
                            </button>
                          </div>

                          {/* Expanded Order Detail */}
                          {isSelected && selectedOrder && (
                            <div className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm">
                              {loadingDetail ? (
                                <p className="py-2 text-center text-xs text-zinc-500">กำลังโหลดรายการอาหาร...</p>
                              ) : (
                                <div>
                                  <p className="text-xs font-semibold text-zinc-500">
                                    รายการอาหารในออเดอร์ {formatOrderNumber(selectedOrder.order_number)}:
                                  </p>
                                  <div className="mt-2 divide-y divide-zinc-200">
                                    {selectedOrder.items?.map((item, idx) => (
                                      <div key={idx} className="flex items-start justify-between py-2 text-xs">
                                        <div>
                                          <p className="font-medium text-zinc-800">
                                            {item.menu_name} <span className="text-zinc-500">× {item.quantity}</span>
                                          </p>
                                          {item.options?.length > 0 && (
                                            <p className="text-zinc-400">
                                              {item.options.map((opt) => `${opt.name}: ${opt.choice}`).join(", ")}
                                            </p>
                                          )}
                                        </div>
                                        <p className="font-mono font-semibold text-zinc-900">
                                          ฿{Number(item.subtotal).toLocaleString()}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                  {selectedOrder.order_note && (
                                    <p className="mt-2 text-xs text-zinc-500">
                                      <span className="font-semibold">หมายเหตุ:</span> {selectedOrder.order_note}
                                    </p>
                                  )}
                                  {selectedOrder.payment_method && (
                                    <p className="mt-1 text-xs text-emerald-700">
                                      <span className="font-semibold">ชำระด้วย:</span> {selectedOrder.payment_method}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* =====================================================================
            STATE 2: PENDING APPROVAL (รอแอดมินยืนยัน)
           ===================================================================== */}
        {state === "pending" && (
          <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-5 text-zinc-800">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-xl text-white shadow-xs">
                ⏳
              </span>
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-amber-950">ส่งคำขอสมัครสมาชิกแล้ว (รอแอดมินยืนยัน)</h3>
                  <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-xs font-bold text-amber-900">
                    รอการยืนยัน
                  </span>
                </div>

                <p className="text-sm leading-6 text-zinc-600">
                  ระบบได้บันทึกข้อมูลเบอร์โทรศัพท์ <span className="font-mono font-bold text-zinc-900">{formatThaiPhone(member?.phone)}</span> เรียบร้อยแล้ว 
                  พนักงานหรือแอดมินของร้านจะกดยืนยันให้ในระบบสักครู่ครับ
                </p>

                <div className="rounded-xl border border-amber-200/60 bg-white/80 p-3 text-xs text-zinc-600">
                  <span className="font-semibold text-zinc-800">💡 คุณสามารถเริ่มสั่งอาหารได้ทันทีตามปกติ:</span> เมื่อแอดมินกดยืนยันแล้ว บัตรสมาชิกจะเปิดใช้งานและออเดอร์จะบันทึกเข้าประวัติสะสมให้อัตโนมัติ
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700"
                  >
                    <span>🔄 ตรวจสถานะอีกครั้ง</span>
                  </button>

                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void handleLogout()}
                    className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-700"
                  >
                    ยกเลิกคำขอ / เปลี่ยนเบอร์
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            STATE 3: GUEST (สมัครสมาชิก / เข้าสู่ระบบด้วยเบอร์โทร)
           ===================================================================== */}
        {state === "guest" && (
          <div>
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
              <p className="font-bold text-zinc-900">ระบบสมาชิก Smart Order</p>
              <p className="mt-1 text-sm leading-6 text-zinc-700">
                สมัครฟรี! เพื่อดูประวัติการสั่งซื้อ จัดการข้อมูลส่วนตัว และรับสิทธิพิเศษจากทางร้าน
              </p>
            </div>

            {/* Sub-tab selection (3 choices) */}
            <div className="mt-4 grid grid-cols-1 gap-2 rounded-xl bg-zinc-100 p-1.5 sm:grid-cols-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("register");
                  setMessage("");
                }}
                className={`rounded-lg py-2.5 px-3 text-center text-sm font-semibold transition ${
                  activeTab === "register" ? "bg-white text-orange-600 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                สมัครสมาชิกใหม่
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("login");
                  setMessage("");
                }}
                className={`rounded-lg py-2.5 px-3 text-center text-sm font-semibold transition ${
                  activeTab === "login" ? "bg-white text-orange-600 shadow-xs" : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                สมาชิกเดิม (เข้าสู่ระบบด้วยเบอร์โทร)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                  window.scrollBy({ top: 120, behavior: "smooth" });
                }}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 px-3 text-center text-sm font-semibold text-zinc-600 transition hover:bg-zinc-200/70 hover:text-zinc-900"
              >
                <span>สั่งอาหารโดยไม่สมัครสมาชิก</span>
                <span aria-hidden="true">↓</span>
              </button>
            </div>

            {/* TAB 1: REGISTER */}
            {activeTab === "register" && (
              <form onSubmit={handleRegister} className="mt-5 grid gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800 sm:col-span-2">
                    เบอร์มือถือไทย <span className="text-red-500">*</span>
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                      required
                      placeholder="ตัวอย่าง 08X-XXX-XXXX"
                      className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800 sm:col-span-2">
                    ตั้งรหัสผ่านสมาชิก <span className="text-red-500">*</span>
                    <input
                      name="password"
                      type="password"
                      minLength={4}
                      maxLength={30}
                      required
                      placeholder="เช่น PIN 4-6 หลัก หรือรหัสผ่านจำง่าย"
                      className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    />
                    <span className="text-xs text-zinc-500">ใช้สำหรับเข้าสู่ระบบในครั้งถัดไปอย่างปลอดภัย</span>
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                    เพศ <span className="font-normal text-zinc-500">(ไม่บังคับ)</span>
                    <select
                      name="gender"
                      defaultValue="unspecified"
                      className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    >
                      <option value="unspecified">ไม่ระบุ</option>
                      <option value="female">หญิง</option>
                      <option value="male">ชาย</option>
                      <option value="other">อื่น ๆ</option>
                    </select>
                  </label>

                  <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                    ช่วงอายุ <span className="font-normal text-zinc-500">(ไม่บังคับ)</span>
                    <select
                      name="age"
                      defaultValue="unspecified"
                      className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    >
                      <option value="unspecified">ไม่ระบุ</option>
                      <option value="under18">ต่ำกว่า 18 ปี</option>
                      <option value="18-24">18 - 24 ปี</option>
                      <option value="25-34">25 - 34 ปี</option>
                      <option value="35-44">35 - 44 ปี</option>
                      <option value="45-54">45 - 54 ปี</option>
                      <option value="55plus">55 ปีขึ้นไป</option>
                    </select>
                  </label>
                </div>

                <div className="space-y-3 rounded-xl bg-zinc-50 p-4">
                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-700">
                    <input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-orange-600" />
                    <span>ต้องการสมัครสมาชิกและยอมรับเงื่อนไขการใช้งาน</span>
                  </label>

                  <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-700">
                    <input type="checkbox" name="promotions" className="mt-0.5 h-4 w-4 accent-orange-600" />
                    <span>ยินยอมรับข้อมูลข่าวสารและสิทธิพิเศษโปรโมชัน (ไม่บังคับ)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-12 rounded-xl bg-orange-600 px-5 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {pending ? "กำลังส่งคำขอ..." : "สมัครสมาชิก"}
                </button>
              </form>
            )}

            {/* TAB 2: LOGIN */}
            {activeTab === "login" && (
              <form onSubmit={handleLogin} className="mt-5 grid gap-4">
                <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                  เบอร์โทรศัพท์ที่เคยสมัคร <span className="text-red-500">*</span>
                  <input
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    required
                    defaultValue={duplicatePhone || ""}
                    placeholder="ตัวอย่าง 08X-XXX-XXXX"
                    className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                  รหัสผ่าน <span className="text-red-500">*</span>
                  <input
                    name="password"
                    type="password"
                    minLength={4}
                    maxLength={30}
                    required
                    placeholder="กรอกรหัสผ่านของคุณ"
                    className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-zinc-500">
                    <span>กรอกรหัสผ่านที่ตั้งไว้ตอนสมัคร</span>
                    <span className="font-medium text-orange-600">ลืมรหัสผ่าน? แจ้งพนักงานที่ร้านเพื่อรีเซ็ตได้เลย</span>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={pending}
                  className="min-h-12 rounded-xl bg-orange-600 px-5 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200 disabled:cursor-wait disabled:opacity-60"
                >
                  {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบสมาชิก"}
                </button>
              </form>
            )}

            {/* Link to order directly without membership */}
            <div className="mt-4 border-t border-zinc-100 pt-3 text-center">
              <button
                type="button"
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                  window.scrollBy({ top: 120, behavior: "smooth" });
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500 transition hover:text-orange-600"
              >
                <span>สั่งอาหารโดยไม่สมัครสมาชิก (เลือกดูเมนูอาหารด้านล่างได้ทันที)</span>
                <span aria-hidden="true">↓</span>
              </button>
            </div>
          </div>
        )}

        {/* Status Message Notification */}
        {message && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-4 rounded-xl p-3.5 text-sm font-medium ${
              messageType === "success"
                ? "border border-green-200 bg-green-50 text-green-800"
                : messageType === "error"
                ? "border border-red-200 bg-red-50 text-red-800"
                : "border border-blue-200 bg-blue-50 text-blue-800"
            }`}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>{message}</div>
              {duplicatePhone && activeTab === "register" && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("login");
                    setMessage("");
                  }}
                  className="inline-flex items-center gap-1 font-bold text-orange-600 underline hover:text-orange-700"
                >
                  👉 เข้าสู่ระบบผ่านแท็บสมาชิกเดิม
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
