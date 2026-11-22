"use client";

import Link from "next/link";
import { useState, useMemo, useTransition } from "react";
import {
  formatThaiPhone,
  memberAgeLabels,
  memberAges,
  memberGenderLabels,
  memberGenders,
  validateMemberPassword,
  generateRandomMemberPassword,
  type MemberAge,
  type MemberGender,
} from "@/lib/member-input";
import {
  bangkokToday,
  bangkokDayRange,
  bangkokWeekRange,
  bangkokMonthRange,
  bangkokCustomRange,
} from "@/lib/bangkok-date";

export type AdminMemberRow = {
  id: string;
  member_code: string;
  phone: string;
  gender: string;
  age_range: string;
  promotion_consent: boolean;
  created_at: string;
  order_count: number;
  completed_orders_count?: number;
  cancelled_orders_count?: number;
  total_orders_count?: number;
  total_spent: number;
};

export type MemberOrderSummary = {
  id: string;
  member_id: string;
  total_amount: number;
  status: string;
  created_at: string;
};

export type PeriodMode = "all" | "daily" | "weekly" | "monthly" | "custom";

export type MemberAnalyticsData = {
  total_members: number;
  total_orders: number;
  total_spent: number;
  monthly_signups: Array<{ month: string; count: number }>;
  gender_distribution: Array<{ gender: string; count: number }>;
  age_distribution: Array<{ age_range: string; count: number }>;
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(Date.parse(`${dateStr}T00:00:00.000Z`) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function addMonths(monthStr: string, months: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatThaiDateShort(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00+07:00`);
    return d.toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatThaiMonth(monthStr: string): string {
  try {
    const [y, m] = monthStr.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1, 15));
    return d.toLocaleDateString("th-TH", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "long",
    });
  } catch {
    return monthStr;
  }
}

export default function MembersClient({
  members,
  analytics,
  memberOrders = [],
  addAction,
  updateAction,
  deleteAction,
  resetPasswordAction,
}: {
  members: AdminMemberRow[];
  analytics: MemberAnalyticsData;
  memberOrders?: MemberOrderSummary[];
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  resetPasswordAction: (formData: FormData) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<"directory" | "analytics">("directory");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterGender, setFilterGender] = useState<string>("all");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  // Period state for Marketing Analytics Tab
  const todayStr = useMemo(() => bangkokToday(), []);
  const todayMonthStr = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("all");
  const [dailyDate, setDailyDate] = useState(todayStr);
  const [weeklyDate, setWeeklyDate] = useState(todayStr);
  const [monthlyMonth, setMonthlyMonth] = useState(todayMonthStr);
  const [customStartDate, setCustomStartDate] = useState(() => {
    const d = new Date(Date.parse(`${todayStr}T00:00:00.000Z`) - 29 * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState(todayStr);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addPasswordValue, setAddPasswordValue] = useState("");
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

  // Derived metrics for Tab 2 (รายชื่อสมาชิก)
  const totalSpendAllMembers = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.total_spent || 0), 0);
  }, [members]);

  const totalCompletedOrders = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.completed_orders_count ?? m.order_count ?? 0), 0);
  }, [members]);

  const totalCancelledOrders = useMemo(() => {
    return members.reduce((sum, m) => sum + Number(m.cancelled_orders_count ?? 0), 0);
  }, [members]);

  const totalOrdersAllMembers = useMemo(() => {
    return members.reduce(
      (sum, m) =>
        sum +
        Number(
          m.total_orders_count ??
            (m.completed_orders_count ?? m.order_count ?? 0) + (m.cancelled_orders_count ?? 0)
        ),
      0
    );
  }, [members]);

  // Period range calculation for Tab 3 (Dashboard สถิติการตลาด)
  const weekRangeInfo = useMemo(() => {
    if (periodMode === "weekly" && weeklyDate) {
      return bangkokWeekRange(weeklyDate);
    }
    return null;
  }, [periodMode, weeklyDate]);

  const activeRange = useMemo(() => {
    if (periodMode === "all") return null;
    if (periodMode === "daily") {
      return bangkokDayRange(dailyDate || todayStr);
    }
    if (periodMode === "weekly") {
      return bangkokWeekRange(weeklyDate || todayStr);
    }
    if (periodMode === "monthly") {
      return bangkokMonthRange(monthlyMonth || todayMonthStr);
    }
    if (periodMode === "custom") {
      const s = customStartDate || todayStr;
      const e = customEndDate || todayStr;
      if (s > e) return bangkokCustomRange(e, s);
      return bangkokCustomRange(s, e);
    }
    return null;
  }, [periodMode, dailyDate, weeklyDate, monthlyMonth, customStartDate, customEndDate, todayStr, todayMonthStr]);

  const periodDisplayLabel = useMemo(() => {
    if (periodMode === "all") return "ทั้งหมด (All Time)";
    if (periodMode === "daily") return formatThaiDateShort(dailyDate || todayStr);
    if (periodMode === "weekly" && weekRangeInfo) {
      return `${formatThaiDateShort(weekRangeInfo.startDay)} - ${formatThaiDateShort(weekRangeInfo.endDay)}`;
    }
    if (periodMode === "monthly") return formatThaiMonth(monthlyMonth || todayMonthStr);
    if (periodMode === "custom") {
      return `${formatThaiDateShort(customStartDate)} - ${formatThaiDateShort(customEndDate)}`;
    }
    return "ช่วงเวลาที่เลือก";
  }, [periodMode, dailyDate, todayStr, weekRangeInfo, monthlyMonth, todayMonthStr, customStartDate, customEndDate]);

  // Orders filtered by the active period
  const filteredOrders = useMemo(() => {
    if (!activeRange) return memberOrders;
    const startMs = Date.parse(activeRange.start);
    const endMs = Date.parse(activeRange.end);
    return memberOrders.filter((o) => {
      const t = Date.parse(o.created_at);
      return Number.isFinite(t) && t >= startMs && t < endMs;
    });
  }, [memberOrders, activeRange]);

  const periodCompletedOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.status === "completed");
  }, [filteredOrders]);

  const periodCancelledOrders = useMemo(() => {
    return filteredOrders.filter((o) => o.status === "cancelled");
  }, [filteredOrders]);

  const periodTotalOrders = useMemo(() => {
    if (periodMode === "all" && memberOrders.length === 0) {
      return totalOrdersAllMembers;
    }
    return filteredOrders.length;
  }, [periodMode, memberOrders.length, totalOrdersAllMembers, filteredOrders.length]);

  const periodCompletedOrdersCount = useMemo(() => {
    if (periodMode === "all" && memberOrders.length === 0) {
      return totalCompletedOrders;
    }
    return periodCompletedOrders.length;
  }, [periodMode, memberOrders.length, totalCompletedOrders, periodCompletedOrders.length]);

  const periodCancelledOrdersCount = useMemo(() => {
    if (periodMode === "all" && memberOrders.length === 0) {
      return totalCancelledOrders;
    }
    return periodCancelledOrders.length;
  }, [periodMode, memberOrders.length, totalCancelledOrders, periodCancelledOrders.length]);

  const periodTotalSpent = useMemo(() => {
    if (periodMode === "all" && memberOrders.length === 0) {
      return totalSpendAllMembers;
    }
    return periodCompletedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  }, [periodMode, memberOrders.length, totalSpendAllMembers, periodCompletedOrders]);

  // New members who joined in the active period
  const periodNewMembers = useMemo(() => {
    if (!activeRange) return members;
    const startMs = Date.parse(activeRange.start);
    const endMs = Date.parse(activeRange.end);
    return members.filter((m) => {
      const t = Date.parse(m.created_at);
      return Number.isFinite(t) && t >= startMs && t < endMs;
    });
  }, [members, activeRange]);

  // Members who either joined or made an order in the active period
  const activeMemberIdsInPeriod = useMemo(() => {
    if (!activeRange) return null;
    const ids = new Set<string>();
    for (const m of periodNewMembers) ids.add(m.id);
    for (const o of filteredOrders) if (o.member_id) ids.add(o.member_id);
    return ids;
  }, [activeRange, periodNewMembers, filteredOrders]);

  const periodMembersForDemographics = useMemo(() => {
    if (!activeMemberIdsInPeriod) return members;
    const matched = members.filter((m) => activeMemberIdsInPeriod.has(m.id));
    return matched;
  }, [members, activeMemberIdsInPeriod]);

  // Demographics distributions for period
  const periodGenderDistribution = useMemo(() => {
    const pool = periodMembersForDemographics.length > 0 ? periodMembersForDemographics : members;
    const counts: Record<string, number> = { female: 0, male: 0, other: 0, unspecified: 0 };
    for (const m of pool) {
      const g = m.gender in counts ? m.gender : "unspecified";
      counts[g] = (counts[g] || 0) + 1;
    }
    return [
      { gender: "female", count: counts.female },
      { gender: "male", count: counts.male },
      { gender: "other", count: counts.other },
      { gender: "unspecified", count: counts.unspecified },
    ];
  }, [periodMembersForDemographics, members]);

  const periodAgeDistribution = useMemo(() => {
    const pool = periodMembersForDemographics.length > 0 ? periodMembersForDemographics : members;
    const counts: Record<string, number> = {
      under18: 0,
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55plus": 0,
      unspecified: 0,
    };
    for (const m of pool) {
      const a = m.age_range in counts ? m.age_range : "unspecified";
      counts[a] = (counts[a] || 0) + 1;
    }
    return [
      { age_range: "under18", count: counts.under18 },
      { age_range: "18-24", count: counts["18-24"] },
      { age_range: "25-34", count: counts["25-34"] },
      { age_range: "35-44", count: counts["35-44"] },
      { age_range: "45-54", count: counts["45-54"] },
      { age_range: "55plus", count: counts["55plus"] },
      { age_range: "unspecified", count: counts.unspecified },
    ];
  }, [periodMembersForDemographics, members]);

  // Key marketing insights
  const topGender = useMemo(() => {
    const list = [...periodGenderDistribution].sort((a, b) => b.count - a.count);
    return list[0]?.count > 0 ? list[0] : null;
  }, [periodGenderDistribution]);

  const topAge = useMemo(() => {
    const list = [...periodAgeDistribution].sort((a, b) => b.count - a.count);
    return list[0]?.count > 0 ? list[0] : null;
  }, [periodAgeDistribution]);

  // Signups Bar Chart Buckets
  const signupChartBuckets = useMemo(() => {
    if (periodMode === "daily") {
      return [
        {
          label: formatThaiDateShort(dailyDate || todayStr),
          count: periodNewMembers.length,
        },
      ];
    }
    if (periodMode === "weekly" && weekRangeInfo) {
      const buckets: Array<{ label: string; count: number }> = [];
      const dayNames = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
      let cur = weekRangeInfo.startDay;
      for (let i = 0; i < 7; i++) {
        const next = addDays(cur, 1);
        const dayRange = {
          start: new Date(Date.parse(`${cur}T00:00:00.000Z`) - 7 * 3600000).toISOString(),
          end: new Date(Date.parse(`${next}T00:00:00.000Z`) - 7 * 3600000).toISOString(),
        };
        const c = members.filter((m) => {
          const t = Date.parse(m.created_at);
          return t >= Date.parse(dayRange.start) && t < Date.parse(dayRange.end);
        }).length;
        buckets.push({
          label: `${dayNames[i]} ${cur.slice(8)}`,
          count: c,
        });
        cur = next;
      }
      return buckets;
    }
    if (periodMode === "custom") {
      const startMs = Date.parse(`${customStartDate}T00:00:00.000Z`);
      const endMs = Date.parse(`${customEndDate}T00:00:00.000Z`);
      const diffDays = Math.round((endMs - startMs) / 86400000) + 1;
      if (diffDays <= 31 && diffDays > 0) {
        const buckets: Array<{ label: string; count: number }> = [];
        let cur = customStartDate;
        for (let i = 0; i < diffDays; i++) {
          const next = addDays(cur, 1);
          const dayRange = {
            start: new Date(Date.parse(`${cur}T00:00:00.000Z`) - 7 * 3600000).toISOString(),
            end: new Date(Date.parse(`${next}T00:00:00.000Z`) - 7 * 3600000).toISOString(),
          };
          const c = members.filter((m) => {
            const t = Date.parse(m.created_at);
            return t >= Date.parse(dayRange.start) && t < Date.parse(dayRange.end);
          }).length;
          buckets.push({
            label: `${cur.slice(8)}/${cur.slice(5, 7)}`,
            count: c,
          });
          cur = next;
        }
        return buckets;
      }
    }
    // Default to monthly signups from analytics (or aggregated)
    return (analytics?.monthly_signups ?? []).map((m) => ({
      label: formatMonthLabel(m.month),
      count: m.count,
    }));
  }, [
    periodMode,
    dailyDate,
    todayStr,
    weekRangeInfo,
    customStartDate,
    customEndDate,
    members,
    analytics?.monthly_signups,
    periodNewMembers.length,
  ]);

  const maxChartCount = useMemo(() => {
    return Math.max(1, ...signupChartBuckets.map((b) => b.count));
  }, [signupChartBuckets]);

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-2">
        <nav aria-label="แถบเมนูสมาชิก" className="flex flex-wrap gap-2">
          {/* TAB 1: DIRECTORY */}
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

          {/* TAB 2: MARKETING ANALYTICS */}
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
            setAddPasswordValue(generateRandomMemberPassword());
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-orange-700"
        >
          <span className="text-base leading-none">+</span>
          <span>เพิ่มสมาชิกใหม่</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: รายชื่อสมาชิกทั้งหมด (DIRECTORY + CRUD)
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
              <p className="mt-1 text-2xl font-black text-zinc-900">{totalOrdersAllMembers.toLocaleString()} ครั้ง</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                <span className="text-emerald-600">สำเร็จ {totalCompletedOrders.toLocaleString()}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-red-600">ยกเลิก {totalCancelledOrders.toLocaleString()}</span>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold text-zinc-500">ยอดซื้อสะสมจากสมาชิก</span>
              <p className="mt-1 text-2xl font-black text-emerald-600">฿{totalSpendAllMembers.toLocaleString()}</p>
              <p className="mt-1 text-xs text-zinc-500">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ</p>
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
                        <td className="px-5 py-4 text-center">
                          <div className="font-mono font-bold text-zinc-900">
                            {m.cancelled_orders_count && m.cancelled_orders_count > 0 ? (
                              <>
                                <span className="text-xs font-normal text-zinc-500">สำเร็จ </span>
                                <span>{m.order_count.toLocaleString()}</span>
                              </>
                            ) : (
                              m.order_count.toLocaleString()
                            )}
                          </div>
                          {(m.cancelled_orders_count ?? 0) > 0 && (
                            <div className="mt-0.5 text-[11px] font-medium text-red-600">
                              (ยกเลิก {(m.cancelled_orders_count ?? 0).toLocaleString()})
                            </div>
                          )}
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
          {/* Period Filter Selector Card */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-zinc-900">ตัวกรองช่วงเวลาสถิติการตลาด</h3>
                <p className="text-xs text-zinc-500">
                  เลือกช่วงเวลาเพื่อดูสถิติสมาชิกใหม่ คำสั่งซื้อ และสัดส่วนพฤติกรรมลูกค้า
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3.5 py-1 text-xs font-bold text-orange-800 border border-orange-200">
                <span>📅</span>
                <span>{periodDisplayLabel}</span>
              </div>
            </div>

            {/* Mode Selector Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all", label: "ทั้งหมด (All Time)" },
                { id: "daily", label: "รายวัน (Daily)" },
                { id: "weekly", label: "รายสัปดาห์ (Weekly)" },
                { id: "monthly", label: "รายเดือน (Monthly)" },
                { id: "custom", label: "กำหนดช่วงเวลาเอง (Custom)" },
              ].map((tab) => {
                const isActive = periodMode === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPeriodMode(tab.id as PeriodMode)}
                    className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
                      isActive
                        ? "bg-orange-500 text-white shadow-xs"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Mode-specific Sub-controls */}
            {periodMode === "daily" && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                <label htmlFor="period-daily-date" className="text-xs font-semibold text-zinc-600">
                  เลือกวันที่:
                </label>
                <input
                  id="period-daily-date"
                  type="date"
                  value={dailyDate}
                  max={todayStr}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setDailyDate(todayStr)}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => setDailyDate(addDays(dailyDate || todayStr, -1))}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  -1 วัน
                </button>
                <button
                  type="button"
                  onClick={() => setDailyDate(addDays(dailyDate || todayStr, 1))}
                  disabled={dailyDate >= todayStr}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
                >
                  +1 วัน
                </button>
              </div>
            )}

            {periodMode === "weekly" && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                <label htmlFor="period-weekly-date" className="text-xs font-semibold text-zinc-600">
                  เลือกวันในสัปดาห์:
                </label>
                <input
                  id="period-weekly-date"
                  type="date"
                  value={weeklyDate}
                  max={todayStr}
                  onChange={(e) => setWeeklyDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setWeeklyDate(todayStr)}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  สัปดาห์นี้
                </button>
                {weekRangeInfo && (
                  <span className="text-xs font-medium text-orange-800 bg-orange-50 px-2.5 py-1 rounded-lg border border-orange-200">
                    จันทร์ {formatThaiDateShort(weekRangeInfo.startDay)} - อาทิตย์ {formatThaiDateShort(weekRangeInfo.endDay)}
                  </span>
                )}
              </div>
            )}

            {periodMode === "monthly" && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100">
                <label htmlFor="period-monthly-month" className="text-xs font-semibold text-zinc-600">
                  เลือกเดือน:
                </label>
                <input
                  id="period-monthly-month"
                  type="month"
                  value={monthlyMonth}
                  max={todayMonthStr}
                  onChange={(e) => setMonthlyMonth(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setMonthlyMonth(todayMonthStr)}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  เดือนนี้
                </button>
                <button
                  type="button"
                  onClick={() => setMonthlyMonth(addMonths(monthlyMonth || todayMonthStr, -1))}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  -1 เดือน
                </button>
                <button
                  type="button"
                  onClick={() => setMonthlyMonth(addMonths(monthlyMonth || todayMonthStr, 1))}
                  disabled={monthlyMonth >= todayMonthStr}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
                >
                  +1 เดือน
                </button>
              </div>
            )}

            {periodMode === "custom" && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor="period-custom-start" className="text-xs font-semibold text-zinc-600">
                      ตั้งแต่:
                    </label>
                    <input
                      id="period-custom-start"
                      type="date"
                      value={customStartDate}
                      max={customEndDate || todayStr}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                    />
                  </div>
                  <span className="text-zinc-400 text-xs">ถึง</span>
                  <div className="flex items-center gap-2">
                    <label htmlFor="period-custom-end" className="text-xs font-semibold text-zinc-600">
                      ถึงวันที่:
                    </label>
                    <input
                      id="period-custom-end"
                      type="date"
                      value={customEndDate}
                      min={customStartDate}
                      max={todayStr}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                    />
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate(addDays(todayStr, -6));
                      setCustomEndDate(todayStr);
                    }}
                    className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                  >
                    7 วันล่าสุด
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate(addDays(todayStr, -29));
                      setCustomEndDate(todayStr);
                    }}
                    className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                  >
                    30 วันล่าสุด
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStartDate(`${todayMonthStr}-01`);
                      setCustomEndDate(todayStr);
                    }}
                    className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                  >
                    เดือนนี้
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Key Stat Cards (Connected to Date Filter) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">สมาชิกทั้งหมด</span>
              <p className="mt-2 text-3xl font-black text-zinc-900">{members.length} คน</p>
              <p className="mt-1 text-xs text-zinc-500">ฐานข้อมูลสมาชิกร้าน</p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {periodMode === "all" ? "สมาชิกใหม่เดือนล่าสุด" : "สมาชิกใหม่ในช่วงเวลาที่เลือก"}
              </span>
              <p className="mt-2 text-3xl font-black text-orange-600">
                {periodNewMembers.length.toLocaleString()} คน
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                {periodMode === "all" ? "สมาชิกที่สมัครทั้งหมด" : `สมัครในช่วง ${periodDisplayLabel}`}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {periodMode === "all" ? "ออเดอร์จากสมาชิกทั้งหมด" : "ออเดอร์จากสมาชิก"}
              </span>
              <p className="mt-2 text-3xl font-black text-zinc-900">
                {periodTotalOrders.toLocaleString()} ครั้ง
              </p>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                <span className="text-emerald-600">สำเร็จ {periodCompletedOrdersCount.toLocaleString()}</span>
                <span className="text-zinc-400">·</span>
                <span className="text-red-600">ยกเลิก {periodCancelledOrdersCount.toLocaleString()}</span>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {periodMode === "all" ? "ยอดขายรวมจากสมาชิก" : "ยอดขายรวมจากสมาชิก"}
              </span>
              <p className="mt-2 text-3xl font-black text-emerald-600">
                ฿{periodTotalSpent.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-zinc-500">เฉพาะออเดอร์ที่ชำระเงินสำเร็จ</p>
            </div>
          </div>

          {/* Signups Bar Chart (Dynamic for Filtered Period) */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-zinc-900">
                  {periodMode === "daily"
                    ? "จำนวนสมาชิกใหม่รายวัน"
                    : periodMode === "weekly" || (periodMode === "custom" && signupChartBuckets.length <= 31)
                    ? "จำนวนสมาชิกใหม่รายวันในช่วงที่เลือก"
                    : "จำนวนสมาชิกใหม่ในแต่ละเดือน"}
                </h3>
                <p className="text-xs text-zinc-500">
                  {periodMode === "all"
                    ? "สถิติการสมัครสมาชิกย้อนหลัง 12 เดือน"
                    : `สถิติการสมัครสมาชิกในช่วง ${periodDisplayLabel}`}
                </p>
              </div>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-800">
                รวม {periodNewMembers.length} คน
              </span>
            </div>

            <div className="mt-6">
              {signupChartBuckets.length === 0 ? (
                <p className="py-8 text-center text-sm text-zinc-500">ยังไม่มีข้อมูลสมาชิกใหม่ในช่วงเวลานี้</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex h-44 items-end gap-2 overflow-x-auto pb-2 pt-6">
                    {signupChartBuckets.map((m, idx) => {
                      const heightPct = Math.round((m.count / maxChartCount) * 100);
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
                            {m.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Demographic Breakdown Grid for Marketing (Filtered by Period) */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gender Distribution */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">สัดส่วนสมาชิกตามเพศ (เพื่อการตลาด)</h3>
                  <p className="text-xs text-zinc-500">ข้อมูลเพศของลูกค้าที่สมัครหรือสั่งซื้อในช่วงเวลานี้</p>
                </div>
                <span className="text-xs font-bold text-zinc-500">
                  {periodMembersForDemographics.length} คน
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {periodGenderDistribution.length === 0 || periodMembersForDemographics.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">ไม่มีข้อมูลสมาชิกในช่วงเวลานี้</p>
                ) : (
                  periodGenderDistribution.map((g) => {
                    const label = memberGenderLabels[g.gender as MemberGender] || g.gender;
                    const totalPool = periodMembersForDemographics.length;
                    const pct = totalPool > 0 ? Math.round((g.count / totalPool) * 100) : 0;
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
                  })
                )}
              </div>
            </div>

            {/* Age Range Distribution */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">สัดส่วนสมาชิกตามช่วงอายุ (เพื่อการตลาด)</h3>
                  <p className="text-xs text-zinc-500">การกระจายตัวของกลุ่มช่วงอายุลูกค้าในช่วงเวลานี้</p>
                </div>
                <span className="text-xs font-bold text-zinc-500">
                  {periodMembersForDemographics.length} คน
                </span>
              </div>

              <div className="mt-5 space-y-3.5">
                {periodAgeDistribution.length === 0 || periodMembersForDemographics.length === 0 ? (
                  <p className="py-6 text-center text-sm text-zinc-500">ไม่มีข้อมูลสมาชิกในช่วงเวลานี้</p>
                ) : (
                  periodAgeDistribution.map((a) => {
                    const label = memberAgeLabels[a.age_range as MemberAge] || a.age_range;
                    const totalPool = periodMembersForDemographics.length;
                    const pct = totalPool > 0 ? Math.round((a.count / totalPool) * 100) : 0;
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
                  })
                )}
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
                <h4 className="text-base font-bold text-zinc-900">
                  ข้อมูลสรุปและข้อเสนอแนะในการทำการตลาด ({periodDisplayLabel})
                </h4>
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
                    <p className="text-xs text-zinc-500">อัตราการสั่งซื้อของสมาชิก</p>
                    <p className="mt-1 font-bold text-zinc-900">
                      {members.length > 0
                        ? `${Math.round((periodCompletedOrdersCount / members.length) * 10) / 10} ออเดอร์/คน`
                        : "0 ออเดอร์/คน"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-400">เฉพาะออเดอร์ที่สำเร็จ</p>
                  </div>
                </div>
                <p className="pt-2 text-xs text-zinc-600">
                  * ข้อมูลข้างต้นรวบรวมจากสมาชิกร้านอาหาร เพื่อช่วยปรับแต่งเมนูและออกแบบโปรโมชันให้ตรงตามกลุ่มลูกค้าเป้าหมาย
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
                const passwordToSet = String(form.get("password") ?? "").trim();
                const passCheck = validateMemberPassword(passwordToSet);
                if (!passCheck.valid) {
                  setModalError(passCheck.error || "รหัสผ่านไม่ถูกต้อง");
                  return;
                }
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

              <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">
                รหัสผ่านเริ่มต้น <span className="text-red-500">*</span>
                <div className="flex gap-2">
                  <input
                    name="password"
                    type="text"
                    minLength={6}
                    maxLength={6}
                    pattern="[A-Za-z0-9]{6}"
                    required
                    value={addPasswordValue}
                    onChange={(e) => setAddPasswordValue(e.target.value.replace(/[^A-Za-z0-9]/g, ""))}
                    placeholder="เช่น A1b2C3 (6 ตัวอักษร)"
                    className="flex-1 rounded-xl border border-zinc-300 p-2.5 font-mono text-sm outline-none focus:border-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() => setAddPasswordValue(generateRandomMemberPassword())}
                    className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50"
                  >
                    🎲 สุ่มรหัสผ่าน
                  </button>
                </div>
                <span className="text-xs text-zinc-500">
                  ตั้งรหัสผ่าน 6 ตัวอักษร (ใช้ได้เฉพาะภาษาอังกฤษ A-Z และตัวเลข 0-9)
                </span>
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
                  const passCheck = validateMemberPassword(passwordToSet);
                  if (!passCheck.valid) {
                    setModalError(passCheck.error || "รหัสผ่านไม่ถูกต้อง");
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
                      minLength={6}
                      maxLength={6}
                      pattern="[A-Za-z0-9]{6}"
                      required
                      placeholder="เช่น A1b2C3 (6 ตัวอักษร)"
                      className="min-h-11 flex-1 rounded-xl border border-zinc-300 px-3 font-mono font-medium outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewPasswordValue(generateRandomMemberPassword());
                      }}
                      className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-100"
                      title="สุ่มรหัสผ่าน 6 ตัวอักษรอัตโนมัติ"
                    >
                      🎲 สุ่มรหัสผ่าน
                    </button>
                  </div>
                  <span className="text-xs text-zinc-500">
                    ตั้งรหัสผ่าน 6 ตัวอักษร (ใช้ได้เฉพาะภาษาอังกฤษ A-Z และตัวเลข 0-9)
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
