"use client";

import Link from "next/link";
import { useState, useMemo, useTransition } from "react";
import {
  formatThaiPhone,
  memberAgeLabels,
  memberAges,
  memberGenderLabels,
  memberGenders,
  type MemberAge,
  type MemberGender,
} from "@/lib/member-input";

export type AdminMemberRow = {
  id: string;
  member_code: string;
  phone: string;
  gender: string;
  age_range: string;
  promotion_consent: boolean;
  created_at: string;
  order_count: number;
  total_spent: number;
};

export type MemberAnalyticsData = {
  total_members: number;
  total_orders: number;
  total_spent: number;
  monthly_signups: Array<{ month: string; count: number }>;
  gender_distribution: Array<{ gender: string; count: number }>;
  age_distribution: Array<{ age_range: string; count: number }>;
};

export type PendingMemberRow = {
  token_hash: string;
  member_id: string;
  member_code: string;
  phone: string;
  gender: string;
  age_range: string;
  promotion_consent: boolean;
  created_at: string;
};

const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

function formatThaiDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("th-TH", {
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

function formatMonthLabel(monthStr: string): string {
  const [y, m] = monthStr.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  const thaiYear = parseInt(y, 10) + 543;
  return `${THAI_MONTH_SHORT[monthIdx] || m} ${String(thaiYear).slice(-2)}`;
}

export default function MembersClient({
  members,
  analytics,
  pendingMembers,
  approveAction,
  rejectAction,
  addAction,
  updateAction,
  deleteAction,
  resetPasswordAction,
}: {
  members: AdminMemberRow[];
  analytics: MemberAnalyticsData;
  pendingMembers: PendingMemberRow[];
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  resetPasswordAction: (formData: FormData) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"pending" | "directory" | "analytics">(
    pendingMembers.length > 0 ? "pending" : "directory"
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AdminMemberRow | null>(null);
  const [deletingMember, setDeletingMember] = useState<AdminMemberRow | null>(null);
  const [resettingMember, setResettingMember] = useState<AdminMemberRow | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState("");
  const [resetSuccessMessage, setResetSuccessMessage] = useState("");
  const [modalError, setModalError] = useState("");

  // Filtered members for directory
  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (filterGender !== "all" && m.gender !== filterGender) return false;
      if (filterAge !== "all" && m.age_range !== filterAge) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim().replace(/[-\s]/g, "");
      const codeMatch = (m.member_code || "").toLowerCase().includes(q);
      const phoneClean = (m.phone || "").replace(/[-\s+]/g, "");
      const phoneMatch = phoneClean.includes(q) || (m.phone || "").toLowerCase().includes(q);
      return codeMatch || phoneMatch;
    });
  }, [members, searchQuery, filterGender, filterAge]);

  // Derived metrics
  const totalSpendAllMembers = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.total_spent || 0), 0);
  }, [members]);

  const totalOrdersAllMembers = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.order_count || 0), 0);
  }, [members]);

  // Key marketing insights
  const topGender = useMemo(() => {
    const list = [...(analytics?.gender_distribution ?? [])].sort((a, b) => b.count - a.count);
    return list[0]?.count > 0 ? list[0] : null;
  }, [analytics]);

  const topAge = useMemo(() => {
    const list = [...(analytics?.age_distribution ?? [])].sort((a, b) => b.count - a.count);
    return list[0]?.count > 0 ? list[0] : null;
  }, [analytics]);

  const maxMonthlyCount = useMemo(() => {
    return Math.max(1, ...(analytics?.monthly_signups ?? []).map((m) => m.count));
  }, [analytics]);

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-2">
        <nav aria-label="แถบเมนูสมาชิก" className="flex flex-wrap gap-2">
          {/* TAB 1: PENDING APPROVALS */}
          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "pending"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <span>รออนุมัติสมาชิกใหม่</span>
            {pendingMembers.length > 0 ? (
              <span className="rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white animate-pulse">
                {pendingMembers.length}
              </span>
            ) : (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-500">
                0
              </span>
            )}
          </button>

          {/* TAB 2: DIRECTORY */}
          <button
            type="button"
            onClick={() => setActiveTab("directory")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "directory"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <span>รายชื่อสมาชิกทั้งหมด</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                activeTab === "directory" ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              {members.length}
            </span>
          </button>

          {/* TAB 3: MARKETING ANALYTICS */}
          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              activeTab === "analytics"
                ? "bg-orange-500 text-white shadow-xs"
                : "bg-white text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <span>Dashboard สถิติการตลาด</span>
          </button>
        </nav>

        {/* Quick Add Button */}
        <button
          type="button"
          onClick={() => {
            setModalError("");
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-orange-700"
        >
          <span className="text-base leading-none">+</span>
          <span>เพิ่มสมาชิกใหม่</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: รออนุมัติสมาชิกใหม่ (1-Click Simple Admin Approval)
         ========================================================================= */}
      {activeTab === "pending" && (
        <section aria-label="รออนุมัติสมาชิกใหม่" className="space-y-6">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">คำขอสมัครสมาชิกใหม่ที่รอการยืนยัน</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  ลูกค้าสมัครผ่านหน้าร้าน กรุณากดปุ่ม <strong>&quot;✓ อนุมัติ&quot;</strong> เพื่อยืนยันสิทธิ์สมาชิกให้ลูกค้าทันที
                </p>
              </div>
              <span className="rounded-xl bg-orange-100 px-3 py-1.5 text-xs font-bold text-orange-800">
                รออนุมัติ {pendingMembers.length} รายการ
              </span>
            </div>

            {pendingMembers.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/50 p-12 text-center text-zinc-500">
                <span className="text-3xl" aria-hidden="true">
                  ✨
                </span>
                <p className="mt-3 font-semibold text-zinc-800">ไม่มีคำขอสมัครสมาชิกค้างอยู่</p>
                <p className="mt-1 text-xs text-zinc-400">เมื่อลูกค้าที่โต๊ะกดสมัครสมาชิก รายการจะปรากฏที่นี่ทันที</p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {pendingMembers.map((item) => (
                  <div
                    key={item.token_hash}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50/40 via-white to-white p-5 shadow-xs transition hover:border-orange-300"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xl font-black text-zinc-900">
                          {formatThaiPhone(item.phone)}
                        </span>
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          รออนุมัติ
                        </span>
                      </div>

                      {/* ข้อมูลเพศและช่วงอายุเพื่อการตลาด */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-600">
                        <div>
                          <span className="text-zinc-400">เพศ: </span>
                          <span className="font-semibold text-zinc-800">
                            {memberGenderLabels[item.gender as MemberGender] || item.gender || "ไม่ระบุ"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">ช่วงอายุ: </span>
                          <span className="font-semibold text-zinc-800">
                            {memberAgeLabels[item.age_range as MemberAge] || item.age_range || "ไม่ระบุ"}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">รับข่าวสาร: </span>
                          <span className="font-semibold text-zinc-800">
                            {item.promotion_consent ? "ยินยอม" : "ไม่รับ"}
                          </span>
                        </div>
                        <div className="text-zinc-400">
                          ส่งคำขอเมื่อ: {formatThaiDate(item.created_at)}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: 1-Click Approve & Reject */}
                    <div className="flex items-center gap-2.5">
                      <form
                        action={(formData) => {
                          startTransition(() => {
                            void approveAction(formData);
                          });
                        }}
                      >
                        <input type="hidden" name="hash" value={item.token_hash} />
                        <button
                          type="submit"
                          disabled={isPending}
                          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-200 disabled:opacity-60"
                        >
                          <span>✓ อนุมัติสมาชิก</span>
                        </button>
                      </form>

                      <form
                        action={(formData) => {
                          if (!window.confirm("ต้องการปฏิเสธคำขอนี้ใช่หรือไม่?")) return;
                          startTransition(() => {
                            void rejectAction(formData);
                          });
                        }}
                      >
                        <input type="hidden" name="hash" value={item.token_hash} />
                        <button
                          type="submit"
                          disabled={isPending}
                          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                        >
                          ✕ ปฏิเสธ
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 2: รายชื่อสมาชิกทั้งหมด (DIRECTORY + CRUD)
         ========================================================================= */}
      {activeTab === "directory" && (
        <section aria-label="รายชื่อสมาชิก" className="space-y-6">
          {/* Top Quick Stats */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold text-zinc-500">จำนวนสมาชิกทั้งหมด</span>
              <p className="mt-1 text-2xl font-black text-zinc-900">{members.length} คน</p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold text-zinc-500">ออเดอร์สะสมจากสมาชิก</span>
              <p className="mt-1 text-2xl font-black text-orange-600">{totalOrdersAllMembers.toLocaleString()} ครั้ง</p>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold text-zinc-500">ยอดซื้อสะสมจากสมาชิก</span>
              <p className="mt-1 text-2xl font-black text-emerald-600">฿{totalSpendAllMembers.toLocaleString()}</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 shadow-xs">
            <div className="relative min-w-[280px] flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาด้วยรหัสสมาชิก (เช่น MEM-00001) หรือเบอร์โทรศัพท์..."
                className="w-full rounded-xl border border-zinc-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              />
              <span className="pointer-events-none absolute left-3 top-3 text-zinc-400">
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2">
                  <path d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" strokeLinecap="round" />
                </svg>
              </span>
            </div>

            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none focus:border-orange-500"
            >
              <option value="all">เพศทั้งหมด</option>
              <option value="female">หญิง</option>
              <option value="male">ชาย</option>
              <option value="other">อื่นๆ</option>
              <option value="unspecified">ไม่ระบุ</option>
            </select>

            <select
              value={filterAge}
              onChange={(e) => setFilterAge(e.target.value)}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none focus:border-orange-500"
            >
              <option value="all">ช่วงอายุทั้งหมด</option>
              <option value="under18">ต่ำกว่า 18 ปี</option>
              <option value="18-24">18 - 24 ปี</option>
              <option value="25-34">25 - 34 ปี</option>
              <option value="35-44">35 - 44 ปี</option>
              <option value="45-54">45 - 54 ปี</option>
              <option value="55plus">55 ปีขึ้นไป</option>
              <option value="unspecified">ไม่ระบุ</option>
            </select>

            {(searchQuery || filterGender !== "all" || filterAge !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setFilterGender("all");
                  setFilterAge("all");
                }}
                className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {/* Members Table */}
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-zinc-700">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase text-zinc-600">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">รหัสสมาชิก</th>
                    <th scope="col" className="px-5 py-3.5">เบอร์โทรศัพท์</th>
                    <th scope="col" className="px-5 py-3.5">เพศ</th>
                    <th scope="col" className="px-5 py-3.5">ช่วงอายุ</th>
                    <th scope="col" className="px-5 py-3.5">วันที่สมัคร</th>
                    <th scope="col" className="px-5 py-3.5 text-center">จำนวนครั้งที่สั่ง</th>
                    <th scope="col" className="px-5 py-3.5 text-right">ยอดซื้อสะสม</th>
                    <th scope="col" className="px-5 py-3.5 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-zinc-500">
                        ไม่พบข้อมูลสมาชิกตามเงื่อนไขที่ระบุ
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => (
                      <tr key={m.id} className="transition hover:bg-orange-50/40">
                        <td className="px-5 py-4 font-mono font-bold text-orange-600">
                          {m.member_code}
                        </td>
                        <td className="px-5 py-4 font-mono font-medium text-zinc-900">
                          {formatThaiPhone(m.phone)}
                        </td>
                        <td className="px-5 py-4">
                          {memberGenderLabels[m.gender as MemberGender] || m.gender || "ไม่ระบุ"}
                        </td>
                        <td className="px-5 py-4">
                          {memberAgeLabels[m.age_range as MemberAge] || m.age_range || "ไม่ระบุ"}
                        </td>
                        <td className="px-5 py-4 text-zinc-500">
                          {formatThaiDate(m.created_at)}
                        </td>
                        <td className="px-5 py-4 text-center font-bold text-zinc-900">
                          {m.order_count}
                        </td>
                        <td className="px-5 py-4 text-right font-mono font-bold text-emerald-700">
                          ฿{Number(m.total_spent || 0).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* ดูรายละเอียด */}
                            <Link
                              href={`/dashboard/members/${m.id}`}
                              className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-100"
                              title="ดูรายละเอียดและประวัติออเดอร์"
                            >
                              รายละเอียด
                            </Link>

                            {/* แก้ไขข้อมูล */}
                            <button
                              type="button"
                              onClick={() => {
                                setModalError("");
                                setEditingMember(m);
                              }}
                              className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                              title="แก้ไขข้อมูลสมาชิก"
                            >
                              แก้ไข
                            </button>

                            {/* รีเซ็ตรหัสผ่าน */}
                            <button
                              type="button"
                              onClick={() => {
                                setModalError("");
                                setResetSuccessMessage("");
                                setNewPasswordValue("");
                                setResettingMember(m);
                              }}
                              className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                              title="รีเซ็ตรหัสผ่านสมาชิก"
                            >
                              รีเซ็ตรหัส
                            </button>

                            {/* ลบสมาชิก */}
                            <button
                              type="button"
                              onClick={() => {
                                setModalError("");
                                setDeletingMember(m);
                              }}
                              className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-100"
                              title="ลบสมาชิก"
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          TAB 3: DASHBOARD สถิติการตลาด (MARKETING ANALYTICS)
         ========================================================================= */}
      {activeTab === "analytics" && (
        <section aria-label="วิเคราะห์ข้อมูลสมาชิก" className="space-y-6">
          {/* Key Stat Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">สมาชิกทั้งหมด</span>
              <p className="mt-2 text-3xl font-black text-zinc-900">{analytics.total_members} คน</p>
              <p className="mt-1 text-xs text-zinc-500">ฐานข้อมูลสมาชิกร้าน</p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">สมาชิกใหม่เดือนล่าสุด</span>
              <p className="mt-2 text-3xl font-black text-orange-600">
                {analytics.monthly_signups?.[analytics.monthly_signups.length - 1]?.count ?? 0} คน
              </p>
              <p className="mt-1 text-xs text-zinc-500">เดือนปัจจุบัน (Asia/Bangkok)</p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">ออเดอร์จากสมาชิกทั้งหมด</span>
              <p className="mt-2 text-3xl font-black text-blue-600">{Number(analytics.total_orders).toLocaleString()} ครั้ง</p>
              <p className="mt-1 text-xs text-zinc-500">เชื่อมโยงผ่าน Member ID</p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">ยอดขายรวมจากสมาชิก</span>
              <p className="mt-2 text-3xl font-black text-emerald-600">฿{Number(analytics.total_spent).toLocaleString()}</p>
              <p className="mt-1 text-xs text-zinc-500">เฉพาะออเดอร์ที่ชำระเงินแล้ว</p>
            </div>
          </div>

          {/* Monthly Signups Bar Chart */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">จำนวนสมาชิกใหม่ในแต่ละเดือน</h3>
                <p className="text-xs text-zinc-500">สถิติการสมัครสมาชิกย้อนหลัง 12 เดือน</p>
              </div>
            </div>

            <div className="mt-6">
              {analytics.monthly_signups?.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">ยังไม่มีข้อมูลสมาชิกใหม่</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex h-44 items-end gap-2 overflow-x-auto pb-2 pt-6">
                    {analytics.monthly_signups.map((m, idx) => {
                      const heightPct = Math.round((m.count / maxMonthlyCount) * 100);
                      return (
                        <div key={idx} className="flex min-w-[48px] flex-1 flex-col items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-zinc-700">{m.count}</span>
                          <div className="w-full rounded-t-lg bg-orange-100 p-0.5">
                            <div
                              style={{ height: `${Math.max(8, heightPct)}%` }}
                              className="w-full rounded-t-md bg-gradient-to-t from-orange-600 to-orange-400 transition-all duration-300"
                            />
                          </div>
                          <span className="whitespace-nowrap text-[11px] font-medium text-zinc-500">
                            {formatMonthLabel(m.month)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Demographic Breakdown Grid for Marketing */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gender Distribution */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-zinc-900">สัดส่วนสมาชิกตามเพศ (เพื่อการตลาด)</h3>
              <p className="text-xs text-zinc-500">ข้อมูลเพศของลูกค้าที่บันทึกไว้ในระบบ</p>

              <div className="mt-5 space-y-4">
                {analytics.gender_distribution?.map((g) => {
                  const label = memberGenderLabels[g.gender as MemberGender] || g.gender;
                  const pct = analytics.total_members > 0 ? Math.round((g.count / analytics.total_members) * 100) : 0;
                  return (
                    <div key={g.gender} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-zinc-800">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900">{g.count} คน</span>
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${
                            g.gender === "female"
                              ? "bg-pink-500"
                              : g.gender === "male"
                              ? "bg-blue-500"
                              : g.gender === "other"
                              ? "bg-purple-500"
                              : "bg-zinc-400"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Age Range Distribution */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h3 className="text-lg font-bold text-zinc-900">สัดส่วนสมาชิกตามช่วงอายุ (เพื่อการตลาด)</h3>
              <p className="text-xs text-zinc-500">การกระจายตัวของกลุ่มช่วงอายุลูกค้า</p>

              <div className="mt-5 space-y-3.5">
                {analytics.age_distribution?.map((a) => {
                  const label = memberAgeLabels[a.age_range as MemberAge] || a.age_range;
                  const pct = analytics.total_members > 0 ? Math.round((a.count / analytics.total_members) * 100) : 0;
                  return (
                    <div key={a.age_range} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-zinc-700">{label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-900">{a.count} คน</span>
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full rounded-full bg-orange-500 transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Strategic Customer Insights Callout */}
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-6 shadow-xs">
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-sm">
                💡
              </span>
              <div className="space-y-2">
                <h4 className="text-base font-bold text-zinc-900">ข้อมูลสรุปและข้อเสนอแนะในการทำการตลาด</h4>
                <div className="grid gap-3 text-sm text-zinc-700 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs">
                    <p className="text-xs text-zinc-500">กลุ่มเพศที่มีสัดส่วนสูงสุด</p>
                    <p className="mt-1 font-bold text-zinc-900">
                      {topGender ? memberGenderLabels[topGender.gender as MemberGender] || topGender.gender : "-"}
                      {topGender ? ` (${topGender.count} คน)` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs">
                    <p className="text-xs text-zinc-500">ช่วงอายุหลักของร้าน</p>
                    <p className="mt-1 font-bold text-zinc-900">
                      {topAge ? memberAgeLabels[topAge.age_range as MemberAge] || topAge.age_range : "-"}
                      {topAge ? ` (${topAge.count} คน)` : ""}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white/80 p-3 shadow-xs">
                    <p className="text-xs text-zinc-500">อัตราการมีส่วนร่วม</p>
                    <p className="mt-1 font-bold text-zinc-900">
                      {analytics.total_members > 0
                        ? `${Math.round((totalOrdersAllMembers / analytics.total_members) * 10) / 10} ออเดอร์/คน`
                        : "0 ออเดอร์/คน"}
                    </p>
                  </div>
                </div>
                <p className="pt-2 text-xs text-zinc-600">
                  * ข้อมูลข้างต้นรวบรวมจากคำขอสมาชิกที่ได้รับการอนุมัติ เพื่อช่วยร้านอาหารปรับแต่งเมนูและออกแบบโปรโมชันให้ตรงตามกลุ่มลูกค้าเป้าหมาย
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* =========================================================================
          MODAL 1: เพิ่มสมาชิกใหม่ (ADMIN ADD MEMBER)
         ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-zinc-900">เพิ่มสมาชิกใหม่ (Admin)</h3>
            <p className="mt-1 text-xs text-zinc-500">กรอกข้อมูลลูกค้าเพื่อลงทะเบียนเป็นสมาชิกของร้าน</p>

            {modalError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {modalError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModalError("");
                const form = new FormData(e.currentTarget);
                startTransition(async () => {
                  try {
                    await addAction(form);
                    setIsAddModalOpen(false);
                  } catch (err: unknown) {
                    setModalError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเพิ่มสมาชิก");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                เบอร์โทรศัพท์มือถือ <span className="text-red-500">*</span>
                <input
                  name="phone"
                  type="tel"
                  required
                  placeholder="08X-XXX-XXXX"
                  className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                  เพศ
                  <select
                    name="gender"
                    defaultValue="unspecified"
                    className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
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
                    name="age"
                    defaultValue="unspecified"
                    className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
                  >
                    {memberAges.map((a) => (
                      <option key={a} value={a}>
                        {memberAgeLabels[a]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" name="promotions" defaultChecked className="h-4 w-4 accent-orange-600" />
                <span>ยินยอมรับข้อมูลข่าวสารโปรโมชัน</span>
              </label>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-60"
                >
                  {isPending ? "กำลังบันทึก..." : "เพิ่มสมาชิก"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: แก้ไขข้อมูลสมาชิก (ADMIN EDIT MEMBER)
         ========================================================================= */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-zinc-900">แก้ไขข้อมูลสมาชิก</h3>
            <p className="mt-1 text-xs text-zinc-500">
              รหัสสมาชิก: <span className="font-mono font-bold text-orange-600">{editingMember.member_code}</span>
            </p>

            {modalError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {modalError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModalError("");
                const form = new FormData(e.currentTarget);
                startTransition(async () => {
                  try {
                    await updateAction(form);
                    setEditingMember(null);
                  } catch (err: unknown) {
                    setModalError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการแก้ไขข้อมูล");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="member_id" value={editingMember.id} />

              <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                เบอร์โทรศัพท์มือถือ <span className="text-red-500">*</span>
                <input
                  name="phone"
                  type="tel"
                  required
                  defaultValue={formatThaiPhone(editingMember.phone)}
                  className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                  เพศ
                  <select
                    name="gender"
                    defaultValue={editingMember.gender}
                    className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
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
                    name="age"
                    defaultValue={editingMember.age_range}
                    className="rounded-xl border border-zinc-300 p-2.5 text-sm outline-none focus:border-orange-500"
                  >
                    {memberAges.map((a) => (
                      <option key={a} value={a}>
                        {memberAgeLabels[a]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  name="promotions"
                  defaultChecked={editingMember.promotion_consent}
                  className="h-4 w-4 accent-orange-600"
                />
                <span>ยินยอมรับข้อมูลข่าวสารโปรโมชัน</span>
              </label>

              <div className="mt-6 flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setEditingMember(null)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-60"
                >
                  {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ยืนยันการลบสมาชิก (ADMIN DELETE MEMBER)
         ========================================================================= */}
      {deletingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-red-600">ยืนยันการลบสมาชิก</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              คุณต้องการลบสมาชิก <span className="font-mono font-bold text-zinc-900">{deletingMember.member_code}</span> (เบอร์: {formatThaiPhone(deletingMember.phone)}) ใช่หรือไม่?
            </p>
            <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500">
              ℹ️ <strong>หมายเหตุ:</strong> ระบบจะยังคงเก็บประวัติยอดขายและรายงานคำสั่งซื้อเดิมของร้านไว้ตามปกติ (ไม่กระทบรายรับของร้าน)
            </div>

            {modalError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                {modalError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setModalError("");
                const form = new FormData(e.currentTarget);
                startTransition(async () => {
                  try {
                    await deleteAction(form);
                    setDeletingMember(null);
                  } catch (err: unknown) {
                    setModalError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการลบสมาชิก");
                  }
                });
              }}
              className="mt-6 flex justify-end gap-2"
            >
              <input type="hidden" name="member_id" value={deletingMember.id} />
              <button
                type="button"
                disabled={isPending}
                onClick={() => setDeletingMember(null)}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-red-700 disabled:opacity-60"
              >
                {isPending ? "กำลังลบ..." : "ยืนยันลบสมาชิก"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: รีเซ็ตรหัสผ่านสมาชิก */}
      {resettingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">รีเซ็ตรหัสผ่านสมาชิก</h3>
              <button
                type="button"
                onClick={() => setResettingMember(null)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900">
              <p className="font-semibold">สมาชิก: {resettingMember.member_code}</p>
              <p className="text-xs text-amber-700">เบอร์โทร: {formatThaiPhone(resettingMember.phone)}</p>
            </div>

            {modalError && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700">
                {modalError}
              </div>
            )}

            {resetSuccessMessage ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-sm font-bold text-green-800">รีเซ็ตรหัสผ่านเรียบร้อยแล้ว!</p>
                  <p className="mt-1 text-xs text-green-700">รหัสผ่านใหม่ของสมาชิกท่านนี้คือ:</p>
                  <div className="mt-2 inline-block rounded-lg border border-green-300 bg-white px-6 py-2 font-mono text-2xl font-black tracking-wider text-zinc-900 shadow-xs">
                    {resetSuccessMessage}
                  </div>
                  <p className="mt-2 text-xs text-green-700">
                    แจ้งรหัสผ่านใหม่นี้แก่ลูกค้าเพื่อใช้เข้าสู่ระบบได้เลยครับ
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResettingMember(null)}
                  className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-bold text-white shadow-xs hover:bg-orange-700"
                >
                  เสร็จสิ้น
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setModalError("");
                  const form = new FormData(e.currentTarget);
                  const passwordToSet = newPasswordValue.trim();
                  if (!passwordToSet || passwordToSet.length < 4) {
                    setModalError("กรุณาระบุรหัสผ่านใหม่อย่างน้อย 4 หลัก");
                    return;
                  }
                  startTransition(async () => {
                    try {
                      await resetPasswordAction(form);
                      setResetSuccessMessage(passwordToSet);
                    } catch (err: unknown) {
                      setModalError(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน");
                    }
                  });
                }}
                className="mt-4 space-y-4"
              >
                <input type="hidden" name="member_id" value={resettingMember.id} />

                <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                  รหัสผ่านใหม่ <span className="text-red-500">*</span>
                  <div className="flex gap-2">
                    <input
                      name="new_password"
                      type="text"
                      value={newPasswordValue}
                      onChange={(e) => setNewPasswordValue(e.target.value)}
                      minLength={4}
                      maxLength={30}
                      required
                      placeholder="เช่น PIN 4-6 หลัก"
                      className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-3 font-mono font-medium outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const pin = Math.floor(1000 + Math.random() * 9000).toString();
                        setNewPasswordValue(pin);
                      }}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      title="สุ่มรหัส PIN 4 หลักอัตโนมัติ"
                    >
                      🎲 สุ่ม PIN
                    </button>
                  </div>
                  <span className="text-xs text-zinc-500">
                    กำหนดรหัสผ่านใหม่ให้ลูกค้า หรือกดปุ่ม &quot;สุ่ม PIN&quot; เพื่อสร้างเลข 4 หลัก
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => setResettingMember(null)}
                    className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white shadow-xs hover:bg-orange-700 disabled:opacity-60"
                  >
                    {isPending ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
