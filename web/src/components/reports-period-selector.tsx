"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type ReportPeriodType,
  bangkokWeekRange,
  formatThaiDate,
  formatThaiYear,
} from "@/lib/bangkok-date";

export type ExportOrderItem = {
  order_number: string;
  created_at: string;
  table_display: string;
  items_summary: string;
  payment_method: string;
  total_amount: number;
  status_label: string;
};

export type ReportExportData = {
  title: string;
  periodLabel: string;
  generatedAt: string;
  summary: {
    totalSales: number;
    completedOrders: number;
    aov: number;
    cancelledOrders: number;
    cancellationRate: number;
  };
  breakdown: {
    period: string;
    sales: number;
    orders: number;
    cancelledOrders: number;
  }[];
  bestSellingMenus: {
    rank: number;
    name: string;
    quantity: number;
    revenue: number;
    percentage: number;
  }[];
  paymentMethods: {
    method: string;
    count: number;
    amount: number;
  }[];
  orders: ExportOrderItem[];
};

export type ReportsPeriodSelectorProps = {
  currentType: ReportPeriodType;
  currentDate: string;
  currentWeekDate: string;
  currentMonth: string;
  currentYear: number;
  currentStartDate: string;
  currentEndDate: string;
  isCompare: boolean;
  compareType: "prev_period" | "prev_year" | "custom";
  compareDate: string;
  compareWeekDate: string;
  compareMonth: string;
  compareYear: number;
  compareStartDate: string;
  compareEndDate: string;
  today: string;
  currentYearNum: number;
  exportData?: ReportExportData;
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(Date.parse(`${dateStr}T00:00:00.000Z`) + days * 86400000);
  return d.toISOString().slice(0, 10);
}

function addMonths(monthStr: string, months: number): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Export CSV helper (retained for backward compatibility)
export function handleExportCsv() {
  return "\uFEFF";
}

export default function ReportsPeriodSelector({
  currentType,
  currentDate,
  currentWeekDate,
  currentMonth,
  currentYear,
  currentStartDate,
  currentEndDate,
  isCompare,
  compareType: initialCompareType,
  compareDate: initialCompareDate,
  compareWeekDate: initialCompareWeekDate,
  compareMonth: initialCompareMonth,
  compareYear: initialCompareYear,
  compareStartDate: initialCompareStartDate,
  compareEndDate: initialCompareEndDate,
  today,
  currentYearNum,
}: ReportsPeriodSelectorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [type, setType] = useState<ReportPeriodType>(currentType);
  const [date, setDate] = useState(currentDate || today);
  const [weekDate, setWeekDate] = useState(currentWeekDate || today);
  const [month, setMonth] = useState(currentMonth || today.slice(0, 7));
  const [year, setYear] = useState(currentYear || currentYearNum);
  const [startDate, setStartDate] = useState(currentStartDate || today.slice(0, 7) + "-01");
  const [endDate, setEndDate] = useState(currentEndDate || today);

  // Comparison state
  const [compare, setCompare] = useState(isCompare);
  const [compareType, setCompareType] = useState(initialCompareType || "prev_period");
  const [compareDate, setCompareDate] = useState(initialCompareDate || "");
  const [compareWeekDate, setCompareWeekDate] = useState(initialCompareWeekDate || "");
  const [compareMonth, setCompareMonth] = useState(initialCompareMonth || "");
  const [compareYear, setCompareYear] = useState(initialCompareYear || currentYearNum - 1);
  const [compareStartDate, setCompareStartDate] = useState(initialCompareStartDate || "");
  const [compareEndDate, setCompareEndDate] = useState(initialCompareEndDate || "");

  // Validation
  const isCustomDateInvalid = type === "custom" && Boolean(startDate && endDate && startDate > endDate);
  const isCustomCompareInvalid =
    compare &&
    compareType === "custom" &&
    type === "custom" &&
    Boolean(compareStartDate && compareEndDate && compareStartDate > compareEndDate);

  const canSubmit = !isCustomDateInvalid && !isCustomCompareInvalid && !isPending;

  function navigateWithParams(overrides: {
    type?: ReportPeriodType;
    date?: string;
    weekDate?: string;
    month?: string;
    year?: number;
    startDate?: string;
    endDate?: string;
    compare?: boolean;
    compareType?: "prev_period" | "prev_year" | "custom";
  } = {}) {
    const activeType = overrides.type ?? type;
    const params = new URLSearchParams();
    params.set("type", activeType);

    if (activeType === "daily") {
      params.set("date", overrides.date ?? date);
    } else if (activeType === "weekly") {
      params.set("weekDate", overrides.weekDate ?? weekDate);
    } else if (activeType === "monthly") {
      params.set("month", overrides.month ?? month);
    } else if (activeType === "yearly") {
      params.set("year", String(overrides.year ?? year));
    } else if (activeType === "custom") {
      params.set("startDate", overrides.startDate ?? startDate);
      params.set("endDate", overrides.endDate ?? endDate);
    }

    const activeCompare = overrides.compare !== undefined ? overrides.compare : compare;
    if (activeCompare) {
      params.set("compare", "true");
      const activeCompareType = overrides.compareType ?? compareType;
      params.set("compareType", activeCompareType);
      if (activeCompareType === "custom") {
        if (activeType === "daily" && compareDate) params.set("compareDate", compareDate);
        if (activeType === "weekly" && compareWeekDate) params.set("compareWeekDate", compareWeekDate);
        if (activeType === "monthly" && compareMonth) params.set("compareMonth", compareMonth);
        if (activeType === "yearly" && compareYear) params.set("compareYear", String(compareYear));
        if (activeType === "custom" && compareStartDate && compareEndDate) {
          params.set("compareStartDate", compareStartDate);
          params.set("compareEndDate", compareEndDate);
        }
      }
    }

    startTransition(() => {
      router.push(`/dashboard/reports?${params.toString()}`);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    navigateWithParams();
  }

  // Quick Preset Handlers
  const last7DaysStart = addDays(today, -6);
  const last30DaysStart = addDays(today, -29);
  const thisMonthStr = today.slice(0, 7);
  const lastMonthStr = addMonths(thisMonthStr, -1);

  // Preset helper
  function selectPreset(preset: "today" | "last7" | "last30" | "thisMonth" | "lastMonth") {
    if (preset === "today") {
      setType("daily");
      setDate(today);
      navigateWithParams({ type: "daily", date: today });
    } else if (preset === "last7") {
      setType("custom");
      setStartDate(last7DaysStart);
      setEndDate(today);
      navigateWithParams({ type: "custom", startDate: last7DaysStart, endDate: today });
    } else if (preset === "last30") {
      setType("custom");
      setStartDate(last30DaysStart);
      setEndDate(today);
      navigateWithParams({ type: "custom", startDate: last30DaysStart, endDate: today });
    } else if (preset === "thisMonth") {
      setType("monthly");
      setMonth(thisMonthStr);
      navigateWithParams({ type: "monthly", month: thisMonthStr });
    } else if (preset === "lastMonth") {
      setType("monthly");
      setMonth(lastMonthStr);
      navigateWithParams({ type: "monthly", month: lastMonthStr });
    }
  }

  // Print PDF Handler
  function handlePrint() {
    window.print();
  }

  // Generate year options (Past 5 years + current year + next year)
  const yearOptions: number[] = [];
  for (let y = currentYearNum + 1; y >= currentYearNum - 5; y--) {
    yearOptions.push(y);
  }

  // Computed previews
  const weekInfo = type === "weekly" && weekDate ? bangkokWeekRange(weekDate) : null;

  return (
    <section aria-label="ตัวเลือกช่วงเวลารายงาน" className="mt-5 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
      {/* 1. แถวบน: แถบเลือกโหมดช่วงเวลา (ซ้าย) คู่กับปุ่ม พิมพ์รายงาน (PDF) (ขวา) */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4">
        {/* แถบเลือกโหมดช่วงเวลา */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {[
            { id: "daily", label: "รายวัน (Daily)" },
            { id: "weekly", label: "รายสัปดาห์ (Weekly)" },
            { id: "monthly", label: "รายเดือน (Monthly)" },
            { id: "yearly", label: "รายปี (Yearly)" },
            { id: "custom", label: "กำหนดช่วงเวลาเอง (Custom)" },
          ].map((tab) => {
            const isActive = type === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  const nextType = tab.id as ReportPeriodType;
                  setType(nextType);
                }}
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

        {/* ปุ่มพิมพ์รายงาน (PDF) เพียงปุ่มเดียว */}
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-500 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-xs hover:bg-orange-600 transition"
          title="สั่งพิมพ์รายงาน หรือบันทึกเป็น PDF"
        >
          <span>🖨️</span>
          <span>พิมพ์รายงาน (PDF)</span>
        </button>
      </div>

      {/* 2. แถวล่าง: ช่องเลือกวันที่/เดือน/ปี ของโหมดนั้น และตัวเลือกเปรียบเทียบข้อมูล */}
      <form onSubmit={handleSubmit} className="no-print mt-4 space-y-4">
        {/* Period Inputs based on Type */}
        <div className="flex flex-wrap items-end gap-4">
          {type === "daily" && (
            <div>
              <label htmlFor="report-date" className="block text-sm font-medium text-zinc-700">
                เลือกวันที่
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id="report-date"
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  วันนี้
                </button>
                <button
                  type="button"
                  onClick={() => setDate(addDays(date || today, -1))}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  -1 วัน
                </button>
                <button
                  type="button"
                  onClick={() => setDate(addDays(date || today, 1))}
                  disabled={date >= today}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-40"
                >
                  +1 วัน
                </button>
              </div>
            </div>
          )}

          {type === "weekly" && (
            <div>
              <label htmlFor="report-week" className="block text-sm font-medium text-zinc-700">
                เลือกวันใดก็ได้ในสัปดาห์ที่ต้องการ
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id="report-week"
                  type="date"
                  value={weekDate}
                  max={today}
                  onChange={(e) => setWeekDate(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setWeekDate(today)}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  สัปดาห์นี้
                </button>
                <button
                  type="button"
                  onClick={() => setWeekDate(addDays(weekDate || today, -7))}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  สัปดาห์ก่อน
                </button>
              </div>
              {weekInfo && (
                <p className="mt-1.5 text-xs font-medium text-orange-600">
                  สัปดาห์: {formatThaiDate(weekInfo.startDay, { day: "numeric", month: "short" })} –{" "}
                  {formatThaiDate(weekInfo.endDay, { day: "numeric", month: "short", year: "numeric" })} (จันทร์ – อาทิตย์)
                </p>
              )}
            </div>
          )}

          {type === "monthly" && (
            <div>
              <label htmlFor="report-month" className="block text-sm font-medium text-zinc-700">
                เลือกเดือนและปี
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                  id="report-month"
                  type="month"
                  value={month}
                  max={today.slice(0, 7)}
                  onChange={(e) => setMonth(e.target.value)}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => setMonth(today.slice(0, 7))}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  เดือนนี้
                </button>
                <button
                  type="button"
                  onClick={() => setMonth(addMonths(month || today.slice(0, 7), -1))}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  เดือนก่อน
                </button>
              </div>
            </div>
          )}

          {type === "yearly" && (
            <div>
              <label htmlFor="report-year" className="block text-sm font-medium text-zinc-700">
                เลือกปี (พ.ศ.)
              </label>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <select
                  id="report-year"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      พ.ศ. {formatThaiYear(y)} ({y})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setYear(currentYearNum)}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  ปีปัจจุบัน
                </button>
                <button
                  type="button"
                  onClick={() => setYear(currentYearNum - 1)}
                  className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  ปีก่อนหน้า
                </button>
              </div>
            </div>
          )}

          {type === "custom" && (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="report-start" className="block text-xs font-semibold text-zinc-600">
                  วันที่เริ่มต้น
                </label>
                <input
                  id="report-start"
                  type="date"
                  value={startDate}
                  max={endDate || today}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 block rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                />
              </div>
              <span className="pb-2 text-xs text-zinc-400">ถึง</span>
              <div>
                <label htmlFor="report-end" className="block text-xs font-semibold text-zinc-600">
                  วันที่สิ้นสุด
                </label>
                <input
                  id="report-end"
                  type="date"
                  value={endDate}
                  max={today}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="mt-1 block rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs sm:text-sm text-zinc-900 outline-none focus:border-orange-500"
                />
              </div>

              {/* Quick range presets for custom */}
              <div className="flex items-center gap-1.5 pb-0.5">
                <button
                  type="button"
                  onClick={() => selectPreset("last7")}
                  className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                >
                  7 วันล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("last30")}
                  className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                >
                  30 วันล่าสุด
                </button>
                <button
                  type="button"
                  onClick={() => selectPreset("thisMonth")}
                  className="rounded-lg border border-orange-200/60 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                >
                  เดือนนี้
                </button>
              </div>
            </div>
          )}

          {/* Submit Search Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50 transition"
          >
            {isPending ? "กำลังโหลด..." : "ดูรายงาน"}
          </button>
        </div>

        {isCustomDateInvalid && (
          <p className="text-xs font-medium text-red-600">
            ⚠️ วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด
          </p>
        )}

        {/* Comparison Toggle & Mode Selector */}
        <div className="border-t border-zinc-100 pt-3">
          <div className="flex items-center gap-2">
            <input
              id="enable-compare"
              type="checkbox"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-orange-500 focus:ring-orange-400 accent-orange-500"
            />
            <label htmlFor="enable-compare" className="text-sm font-semibold text-zinc-800 cursor-pointer">
              เปิดการเปรียบเทียบข้อมูล (Comparison Mode)
            </label>
          </div>

          {compare && (
            <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wider mb-2">
                รูปแบบการเปรียบเทียบ
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1.5 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="compareType"
                    value="prev_period"
                    checked={compareType === "prev_period"}
                    onChange={() => setCompareType("prev_period")}
                    className="accent-orange-500"
                  />
                  <span>
                    {type === "daily" && "เปรียบเทียบกับ วันก่อนหน้า"}
                    {type === "weekly" && "เปรียบเทียบกับ สัปดาห์ก่อนหน้า"}
                    {type === "monthly" && "เปรียบเทียบกับ เดือนก่อนหน้า"}
                    {type === "yearly" && "เปรียบเทียบกับ ปีก่อนหน้า"}
                    {type === "custom" && "เปรียบเทียบกับ ช่วงเวลาก่อนหน้า (จำนวนวันเท่ากัน)"}
                  </span>
                </label>

                {(type === "monthly" || type === "weekly" || type === "daily") && (
                  <label className="flex items-center gap-1.5 text-sm text-zinc-700">
                    <input
                      type="radio"
                      name="compareType"
                      value="prev_year"
                      checked={compareType === "prev_year"}
                      onChange={() => setCompareType("prev_year")}
                      className="accent-orange-500"
                    />
                    <span>เปรียบเทียบกับ ช่วงเวลาเดียวกันของปีก่อนหน้า</span>
                  </label>
                )}

                <label className="flex items-center gap-1.5 text-sm text-zinc-700">
                  <input
                    type="radio"
                    name="compareType"
                    value="custom"
                    checked={compareType === "custom"}
                    onChange={() => setCompareType("custom")}
                    className="accent-orange-500"
                  />
                  <span>กำหนดช่วงเปรียบเทียบเอง</span>
                </label>
              </div>

              {/* Custom comparison inputs */}
              {compareType === "custom" && (
                <div className="mt-3 pt-3 border-t border-orange-200/50 flex flex-wrap items-center gap-3">
                  {type === "daily" && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700">
                        เลือกวันที่ต้องการนำมาเปรียบเทียบ
                      </label>
                      <input
                        type="date"
                        value={compareDate}
                        onChange={(e) => setCompareDate(e.target.value)}
                        className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                      />
                    </div>
                  )}

                  {type === "weekly" && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700">
                        เลือกวันที่ในสัปดาห์ที่ต้องการเปรียบเทียบ
                      </label>
                      <input
                        type="date"
                        value={compareWeekDate}
                        onChange={(e) => setCompareWeekDate(e.target.value)}
                        className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                      />
                    </div>
                  )}

                  {type === "monthly" && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700">
                        เลือกเดือนและปีที่ต้องการเปรียบเทียบ
                      </label>
                      <input
                        type="month"
                        value={compareMonth}
                        onChange={(e) => setCompareMonth(e.target.value)}
                        className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                      />
                    </div>
                  )}

                  {type === "yearly" && (
                    <div>
                      <label className="block text-xs font-medium text-zinc-700">
                        เลือกปีที่ต้องการเปรียบเทียบ
                      </label>
                      <select
                        value={compareYear}
                        onChange={(e) => setCompareYear(Number(e.target.value))}
                        className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                      >
                        {yearOptions.map((y) => (
                          <option key={y} value={y}>
                            พ.ศ. {formatThaiYear(y)} ({y})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {type === "custom" && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div>
                        <label className="block text-xs font-medium text-zinc-700">
                          เริ่มต้นเปรียบเทียบ
                        </label>
                        <input
                          type="date"
                          value={compareStartDate}
                          onChange={(e) => setCompareStartDate(e.target.value)}
                          className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                        />
                      </div>
                      <span className="mt-5 text-xs text-zinc-400">ถึง</span>
                      <div>
                        <label className="block text-xs font-medium text-zinc-700">
                          สิ้นสุดเปรียบเทียบ
                        </label>
                        <input
                          type="date"
                          value={compareEndDate}
                          onChange={(e) => setCompareEndDate(e.target.value)}
                          className="mt-1 block rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none focus:border-orange-500"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
