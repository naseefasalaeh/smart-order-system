import DashboardSidebar from "@/components/dashboard-sidebar";
import ReportsCharts, {
  type ChartBucket,
  type Segment,
  type PeakHourBucket,
} from "@/components/reports-charts";
import ReportsPeriodSelector, { type ReportExportData } from "@/components/reports-period-selector";
import {
  bangkokToday,
  bangkokCurrentMonth,
  bangkokCurrentYear,
  bangkokDayRange,
  bangkokWeekRange,
  bangkokMonthRange,
  bangkokYearRange,
  bangkokCustomRange,
  getPreviousDay,
  getPreviousWeekDate,
  getPreviousMonth,
  getPreviousYear,
  getPreviousCustomRange,
  bangkokDateKey,
  bangkokHourKey,
  formatThaiDate,
  formatThaiYear,
  type ReportPeriodType,
} from "@/lib/bangkok-date";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import type { SupabaseClient } from "@supabase/supabase-js";

const paymentMethodLabels: Record<string, string> = {
  cash: "เงินสด",
  qr: "QR Code",
  qr_code: "QR Code",
  transfer: "โอนเงิน",
  bank_transfer: "โอนผ่านธนาคาร",
  card: "บัตร",
  credit_card: "บัตรเครดิต",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function calcPctChange(current: number, previous: number): { diff: number; pct: number; isUp: boolean; isZero: boolean } {
  const diff = current - previous;
  const isZero = diff === 0;
  if (previous === 0) {
    return {
      diff,
      pct: current > 0 ? 100 : 0,
      isUp: current > 0,
      isZero,
    };
  }
  const pct = (diff / previous) * 100;
  return {
    diff,
    pct,
    isUp: diff > 0,
    isZero,
  };
}

const THAI_MONTH_NAMES = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

const THAI_DAYS = ["จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์", "อาทิตย์"];

type ReportsSearchParams = {
  type?: string;
  date?: string;
  weekDate?: string;
  month?: string;
  year?: string;
  startDate?: string;
  endDate?: string;
  compare?: string;
  compareType?: string;
  compareDate?: string;
  compareWeekDate?: string;
  compareMonth?: string;
  compareYear?: string;
  compareStartDate?: string;
  compareEndDate?: string;
};

async function fetchReportData(supabase: SupabaseClient, start: string, end: string) {
  const [
    completedOrdersResult,
    periodOrdersResult,
    cancelledOrdersResult,
    diningOrdersResult,
    paymentsResult,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        created_at,
        updated_at,
        order_items (
          id,
          quantity,
          subtotal,
          menu_name_snapshot,
          menus (
            name
          ),
          order_item_options(option_name,additional_price,quantity)
        )
      `)
      .eq("status", "completed")
      .gte("updated_at", start)
      .lt("updated_at", end)
      .order("created_at", { ascending: false }),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", start)
      .lt("created_at", end),

    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelled")
      .gte("updated_at", start)
      .lt("updated_at", end),

    supabase
      .from("orders")
      .select("dining_type")
      .gte("created_at", start)
      .lt("created_at", end),

    supabase
      .from("payments")
      .select(`
        id,
        order_id,
        payment_method,
        amount,
        status,
        paid_at,
        created_at
      `)
      .gte("paid_at", start)
      .lt("paid_at", end)
      .order("created_at", { ascending: false }),
  ]);

  const memberStats = await supabase.rpc("member_menu_statistics", { p_start: start, p_end: end });

  const completedOrders = completedOrdersResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  const error =
    completedOrdersResult.error ??
    periodOrdersResult.error ??
    cancelledOrdersResult.error ??
    diningOrdersResult.error ??
    paymentsResult.error ??
    memberStats.error;

  const totalOrdersCount = periodOrdersResult.count ?? 0;
  const dineInCount = (diningOrdersResult.data ?? []).filter((order) => order.dining_type === "dine_in").length;
  const takeawayCount = (diningOrdersResult.data ?? []).filter((order) => order.dining_type === "takeaway").length;
  const cancelledCount = cancelledOrdersResult.count ?? 0;

  const successfulPaymentStatuses = ["paid", "completed", "success", "successful"];
  const successfulPayments = payments.filter((payment) =>
    successfulPaymentStatuses.includes(String(payment.status ?? "").toLowerCase())
  );

  const paidCompletedPayments = [...new Map(successfulPayments.map((p) => [p.id, p])).values()];
  const completedOrderCount = completedOrders.length;

  const totalSales = paidCompletedPayments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
  const averageOrderValue =
    completedOrderCount > 0
      ? completedOrders.reduce((sum, order) => sum + Number(order.total_amount), 0) / completedOrderCount
      : 0;

  // Best selling menus & addons
  const menuSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
  const addonSales = new Map<string, { name: string; quantity: number; revenue: number }>();

  completedOrders.forEach((order) => {
    order.order_items?.forEach((item) => {
      const menu = Array.isArray(item.menus) ? item.menus[0] : item.menus;
      const menuName = item.menu_name_snapshot ?? menu?.name ?? "ไม่พบชื่อเมนู";

      if (!menuSales[menuName]) {
        menuSales[menuName] = {
          name: menuName,
          quantity: 0,
          revenue: 0,
        };
      }

      menuSales[menuName].quantity += Number(item.quantity ?? 0);
      menuSales[menuName].revenue += Number(item.subtotal ?? 0);

      item.order_item_options?.forEach((option) => {
        const existing = addonSales.get(option.option_name) ?? {
          name: option.option_name,
          quantity: 0,
          revenue: 0,
        };
        const quantity = Number(option.quantity) * Number(item.quantity);
        existing.quantity += quantity;
        existing.revenue += quantity * Number(option.additional_price);
        addonSales.set(option.option_name, existing);
      });
    });
  });

  const bestSellingMenus = Object.values(menuSales).sort((a, b) => b.quantity - a.quantity);

  // Payment methods
  const paymentSummary: Record<string, { method: string; count: number; amount: number }> = {};
  paidCompletedPayments.forEach((payment) => {
    const method = payment.payment_method ?? "other";
    if (!paymentSummary[method]) {
      paymentSummary[method] = {
        method,
        count: 0,
        amount: 0,
      };
    }
    paymentSummary[method].count += 1;
    paymentSummary[method].amount += Number(payment.amount ?? 0);
  });

  const paymentMethods = Object.values(paymentSummary).sort((a, b) => b.amount - a.amount);

  return {
    error,
    completedOrders,
    payments: paidCompletedPayments,
    totalSales,
    completedOrderCount,
    averageOrderValue,
    totalOrdersCount,
    dineInCount,
    takeawayCount,
    cancelledCount,
    bestSellingMenus,
    addonSales,
    paymentMethods,
    memberStatsData: memberStats.data ?? [],
  };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const { db: supabase, role, fullName } = await requireDashboardContext(["admin"]);
  const params = await searchParams;

  const today = bangkokToday();
  const currentMonth = bangkokCurrentMonth();
  const currentYearNum = bangkokCurrentYear();

  // 1. Determine Report Period Type
  const rawType = String(params.type ?? "").toLowerCase();
  const periodType: ReportPeriodType = ["daily", "weekly", "monthly", "yearly", "custom"].includes(rawType)
    ? (rawType as ReportPeriodType)
    : "monthly";

  // 2. Resolve Primary Range
  let primaryStart = "";
  let primaryEnd = "";
  let primaryLabel = "";
  let primaryYear = Number(params.year) || currentYearNum;
  let primaryStartDate = params.startDate ?? today.slice(0, 7) + "-01";
  let primaryEndDate = params.endDate ?? today;

  const primaryDate = bangkokDayRange(params.date ?? "") ? params.date! : today;
  const primaryWeekDate = bangkokWeekRange(params.weekDate ?? "") ? params.weekDate! : today;
  const primaryMonth = bangkokMonthRange(params.month ?? "") ? params.month! : currentMonth;

  if (periodType === "daily") {
    const range = bangkokDayRange(primaryDate)!;
    primaryStart = range.start;
    primaryEnd = range.end;
    primaryLabel = `วันที่ ${formatThaiDate(range.start, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`;
  } else if (periodType === "weekly") {
    const range = bangkokWeekRange(primaryWeekDate)!;
    primaryStart = range.start;
    primaryEnd = range.end;
    primaryLabel = `สัปดาห์ที่เลือก (${formatThaiDate(range.startDay, { day: "numeric", month: "short" })} – ${formatThaiDate(range.endDay, { day: "numeric", month: "short", year: "numeric" })})`;
  } else if (periodType === "yearly") {
    const range = bangkokYearRange(primaryYear) ?? bangkokYearRange(currentYearNum)!;
    primaryStart = range.start;
    primaryEnd = range.end;
    primaryYear = range.year;
    primaryLabel = `ปี พ.ศ. ${formatThaiYear(range.year)} (${range.year})`;
  } else if (periodType === "custom") {
    const range = bangkokCustomRange(primaryStartDate, primaryEndDate) ??
      bangkokCustomRange(primaryEndDate, primaryStartDate) ??
      bangkokCustomRange(today.slice(0, 7) + "-01", today)!;
    primaryStartDate = range.startDay;
    primaryEndDate = range.endDay;
    primaryStart = range.start;
    primaryEnd = range.end;
    primaryLabel = `${formatThaiDate(range.startDay, { day: "numeric", month: "short", year: "numeric" })} ถึง ${formatThaiDate(range.endDay, { day: "numeric", month: "short", year: "numeric" })}`;
  } else {
    // monthly (default)
    const range = bangkokMonthRange(primaryMonth)!;
    primaryStart = range.start;
    primaryEnd = range.end;
    primaryLabel = `เดือน${formatThaiDate(range.start, { month: "long", year: "numeric" })}`;
  }

  // 3. Resolve Comparison Range if requested
  const isCompare = params.compare === "true" || params.compare === "1";
  const compareType = (params.compareType as "prev_period" | "prev_year" | "custom") || "prev_period";

  let compareStart = "";
  let compareEnd = "";
  let compareLabel = "";
  let compareDate = params.compareDate ?? "";
  let compareWeekDate = params.compareWeekDate ?? "";
  let compareMonth = params.compareMonth ?? "";
  let compareYear = Number(params.compareYear) || currentYearNum - 1;
  let compareStartDate = params.compareStartDate ?? "";
  let compareEndDate = params.compareEndDate ?? "";

  if (isCompare) {
    if (periodType === "daily") {
      let targetDay = "";
      if (compareType === "custom" && compareDate) {
        targetDay = compareDate;
      } else if (compareType === "prev_year") {
        const [y, m, d] = primaryDate.split("-");
        targetDay = `${Number(y) - 1}-${m}-${d}`;
      } else {
        targetDay = getPreviousDay(primaryDate);
      }
      const range = bangkokDayRange(targetDay) ?? bangkokDayRange(getPreviousDay(primaryDate))!;
      compareStart = range.start;
      compareEnd = range.end;
      compareDate = targetDay;
      compareLabel = `วันเปรียบเทียบ (${formatThaiDate(range.start, { day: "numeric", month: "short", year: "numeric" })})`;
    } else if (periodType === "weekly") {
      let targetWeekDate = "";
      if (compareType === "custom" && compareWeekDate) {
        targetWeekDate = compareWeekDate;
      } else if (compareType === "prev_year") {
        const [y, m, d] = primaryWeekDate.split("-");
        targetWeekDate = `${Number(y) - 1}-${m}-${d}`;
      } else {
        targetWeekDate = getPreviousWeekDate(primaryWeekDate);
      }
      const range = bangkokWeekRange(targetWeekDate) ?? bangkokWeekRange(getPreviousWeekDate(primaryWeekDate))!;
      compareStart = range.start;
      compareEnd = range.end;
      compareWeekDate = targetWeekDate;
      compareLabel = `สัปดาห์เปรียบเทียบ (${formatThaiDate(range.startDay, { day: "numeric", month: "short" })} – ${formatThaiDate(range.endDay, { day: "numeric", month: "short", year: "numeric" })})`;
    } else if (periodType === "yearly") {
      const targetYear = compareType === "custom" && compareYear ? compareYear : getPreviousYear(primaryYear);
      const range = bangkokYearRange(targetYear) ?? bangkokYearRange(primaryYear - 1)!;
      compareStart = range.start;
      compareEnd = range.end;
      compareYear = range.year;
      compareLabel = `ปี พ.ศ. ${formatThaiYear(range.year)} (${range.year})`;
    } else if (periodType === "custom") {
      let range: ReturnType<typeof bangkokCustomRange> = null;
      if (compareType === "custom" && compareStartDate && compareEndDate) {
        range = bangkokCustomRange(compareStartDate, compareEndDate);
      }
      if (!range) {
        const prev = getPreviousCustomRange(primaryStartDate, primaryEndDate);
        range = bangkokCustomRange(prev.prevStartDay, prev.prevEndDay)!;
        compareStartDate = prev.prevStartDay;
        compareEndDate = prev.prevEndDay;
      }
      compareStart = range.start;
      compareEnd = range.end;
      compareLabel = `ช่วงเปรียบเทียบ (${formatThaiDate(range.startDay, { day: "numeric", month: "short" })} – ${formatThaiDate(range.endDay, { day: "numeric", month: "short", year: "numeric" })})`;
    } else {
      // monthly
      let targetMonth = "";
      if (compareType === "custom" && compareMonth) {
        targetMonth = compareMonth;
      } else if (compareType === "prev_year") {
        const [y, m] = primaryMonth.split("-");
        targetMonth = `${Number(y) - 1}-${m}`;
      } else {
        targetMonth = getPreviousMonth(primaryMonth);
      }
      const range = bangkokMonthRange(targetMonth) ?? bangkokMonthRange(getPreviousMonth(primaryMonth))!;
      compareStart = range.start;
      compareEnd = range.end;
      compareMonth = targetMonth;
      compareLabel = `เดือน${formatThaiDate(range.start, { month: "long", year: "numeric" })}`;
    }
  }

  // 4. Fetch Report Data
  const primaryData = await fetchReportData(supabase, primaryStart, primaryEnd);
  const compareData = isCompare && compareStart && compareEnd ? await fetchReportData(supabase, compareStart, compareEnd) : null;

  const pageError = primaryData.error ?? compareData?.error;

  // 5. Build Chart Buckets
  const buckets: ChartBucket[] = [];

  if (periodType === "daily") {
    // 24 Hours
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, "0")}:00`;
      buckets.push({
        date: `h-${h}`,
        label,
        sales: 0,
        orders: 0,
        compareSales: isCompare ? 0 : undefined,
        compareOrders: isCompare ? 0 : undefined,
      });
    }

    primaryData.payments.forEach((p) => {
      const h = bangkokHourKey(p.paid_at ?? p.created_at);
      if (buckets[h]) buckets[h].sales += Number(p.amount ?? 0);
    });
    primaryData.completedOrders.forEach((o) => {
      const h = bangkokHourKey(o.updated_at ?? o.created_at);
      if (buckets[h]) buckets[h].orders += 1;
    });

    if (compareData) {
      compareData.payments.forEach((p) => {
        const h = bangkokHourKey(p.paid_at ?? p.created_at);
        if (buckets[h] && buckets[h].compareSales !== undefined) {
          buckets[h].compareSales! += Number(p.amount ?? 0);
        }
      });
      compareData.completedOrders.forEach((o) => {
        const h = bangkokHourKey(o.updated_at ?? o.created_at);
        if (buckets[h] && buckets[h].compareOrders !== undefined) {
          buckets[h].compareOrders! += 1;
        }
      });
    }
  } else if (periodType === "weekly") {
    // 7 Days: Monday (0) to Sunday (6)
    const primaryWeek = bangkokWeekRange(primaryWeekDate)!;
    const compareWeek = isCompare && compareWeekDate ? bangkokWeekRange(compareWeekDate) : null;

    for (let d = 0; d < 7; d++) {
      const pUtc = Date.parse(`${primaryWeek.startDay}T00:00:00.000Z`) + d * 86400000;
      const pDayStr = new Date(pUtc).toISOString().slice(0, 10);
      const label = `${THAI_DAYS[d]} (${pDayStr.slice(8)})`;

      buckets.push({
        date: pDayStr,
        label,
        sales: 0,
        orders: 0,
        compareSales: isCompare ? 0 : undefined,
        compareOrders: isCompare ? 0 : undefined,
      });
    }

    const bucketByDate = new Map(buckets.map((b) => [b.date, b]));
    primaryData.payments.forEach((p) => {
      const d = bucketByDate.get(bangkokDateKey(p.paid_at ?? p.created_at));
      if (d) d.sales += Number(p.amount ?? 0);
    });
    primaryData.completedOrders.forEach((o) => {
      const d = bucketByDate.get(bangkokDateKey(o.updated_at ?? o.created_at));
      if (d) d.orders += 1;
    });

    if (compareData && compareWeek) {
      const compareDates = Array.from({ length: 7 }, (_, d) => {
        const cUtc = Date.parse(`${compareWeek.startDay}T00:00:00.000Z`) + d * 86400000;
        return new Date(cUtc).toISOString().slice(0, 10);
      });

      compareData.payments.forEach((p) => {
        const pDate = bangkokDateKey(p.paid_at ?? p.created_at);
        const idx = compareDates.indexOf(pDate);
        if (idx !== -1 && buckets[idx]?.compareSales !== undefined) {
          buckets[idx].compareSales! += Number(p.amount ?? 0);
        }
      });

      compareData.completedOrders.forEach((o) => {
        const oDate = bangkokDateKey(o.updated_at ?? o.created_at);
        const idx = compareDates.indexOf(oDate);
        if (idx !== -1 && buckets[idx]?.compareOrders !== undefined) {
          buckets[idx].compareOrders! += 1;
        }
      });
    }
  } else if (periodType === "yearly") {
    // 12 Months
    for (let m = 0; m < 12; m++) {
      const label = THAI_MONTH_NAMES[m];
      buckets.push({
        date: `${primaryYear}-${String(m + 1).padStart(2, "0")}`,
        label,
        sales: 0,
        orders: 0,
        compareSales: isCompare ? 0 : undefined,
        compareOrders: isCompare ? 0 : undefined,
      });
    }

    primaryData.payments.forEach((p) => {
      const dKey = bangkokDateKey(p.paid_at ?? p.created_at);
      const m = parseInt(dKey.slice(5, 7), 10) - 1;
      if (buckets[m]) buckets[m].sales += Number(p.amount ?? 0);
    });
    primaryData.completedOrders.forEach((o) => {
      const dKey = bangkokDateKey(o.updated_at ?? o.created_at);
      const m = parseInt(dKey.slice(5, 7), 10) - 1;
      if (buckets[m]) buckets[m].orders += 1;
    });

    if (compareData) {
      compareData.payments.forEach((p) => {
        const dKey = bangkokDateKey(p.paid_at ?? p.created_at);
        const m = parseInt(dKey.slice(5, 7), 10) - 1;
        if (buckets[m] && buckets[m].compareSales !== undefined) {
          buckets[m].compareSales! += Number(p.amount ?? 0);
        }
      });
      compareData.completedOrders.forEach((o) => {
        const dKey = bangkokDateKey(o.updated_at ?? o.created_at);
        const m = parseInt(dKey.slice(5, 7), 10) - 1;
        if (buckets[m] && buckets[m].compareOrders !== undefined) {
          buckets[m].compareOrders! += 1;
        }
      });
    }
  } else if (periodType === "custom") {
    // Custom range days
    const range = bangkokCustomRange(primaryStartDate, primaryEndDate)!;
    const startUtc = Date.parse(`${range.startDay}T00:00:00.000Z`);

    for (let d = 0; d < range.dayCount; d++) {
      const curUtc = startUtc + d * 86400000;
      const dateStr = new Date(curUtc).toISOString().slice(0, 10);
      const label = range.dayCount <= 14 ? formatThaiDate(dateStr, { day: "numeric", month: "short" }) : dateStr.slice(8);

      buckets.push({
        date: dateStr,
        label,
        sales: 0,
        orders: 0,
        compareSales: isCompare ? 0 : undefined,
        compareOrders: isCompare ? 0 : undefined,
      });
    }

    const bucketByDate = new Map(buckets.map((b) => [b.date, b]));
    primaryData.payments.forEach((p) => {
      const d = bucketByDate.get(bangkokDateKey(p.paid_at ?? p.created_at));
      if (d) d.sales += Number(p.amount ?? 0);
    });
    primaryData.completedOrders.forEach((o) => {
      const d = bucketByDate.get(bangkokDateKey(o.updated_at ?? o.created_at));
      if (d) d.orders += 1;
    });

    if (compareData && compareStartDate && compareEndDate) {
      const compRange = bangkokCustomRange(compareStartDate, compareEndDate);
      if (compRange) {
        const compStartUtc = Date.parse(`${compRange.startDay}T00:00:00.000Z`);
        const compDates = Array.from({ length: compRange.dayCount }, (_, i) =>
          new Date(compStartUtc + i * 86400000).toISOString().slice(0, 10)
        );

        compareData.payments.forEach((p) => {
          const pDate = bangkokDateKey(p.paid_at ?? p.created_at);
          const idx = compDates.indexOf(pDate);
          if (idx !== -1 && idx < buckets.length && buckets[idx]?.compareSales !== undefined) {
            buckets[idx].compareSales! += Number(p.amount ?? 0);
          }
        });

        compareData.completedOrders.forEach((o) => {
          const oDate = bangkokDateKey(o.updated_at ?? o.created_at);
          const idx = compDates.indexOf(oDate);
          if (idx !== -1 && idx < buckets.length && buckets[idx]?.compareOrders !== undefined) {
            buckets[idx].compareOrders! += 1;
          }
        });
      }
    }
  } else {
    // monthly
    const [y, m] = primaryMonth.split("-").map(Number);
    const primaryDaysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    let totalDays = primaryDaysInMonth;
    if (isCompare && compareMonth) {
      const [compY, compM] = compareMonth.split("-").map(Number);
      const compareDaysInMonth = new Date(Date.UTC(compY, compM, 0)).getUTCDate();
      totalDays = Math.max(primaryDaysInMonth, compareDaysInMonth);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${primaryMonth}-${String(day).padStart(2, "0")}`;
      buckets.push({
        date: dateStr,
        label: String(day),
        sales: 0,
        orders: 0,
        compareSales: isCompare ? 0 : undefined,
        compareOrders: isCompare ? 0 : undefined,
      });
    }

    const dailyByDate = new Map(buckets.map((b) => [b.date, b]));
    primaryData.payments.forEach((payment) => {
      const day = dailyByDate.get(bangkokDateKey(payment.paid_at ?? payment.created_at));
      if (day) day.sales += Number(payment.amount ?? 0);
    });
    primaryData.completedOrders.forEach((order) => {
      const day = dailyByDate.get(bangkokDateKey(order.updated_at));
      if (day) day.orders += 1;
    });

    if (compareData && compareMonth) {
      compareData.payments.forEach((p) => {
        const dKey = bangkokDateKey(p.paid_at ?? p.created_at);
        const dayNum = parseInt(dKey.slice(8, 10), 10);
        if (dayNum >= 1 && dayNum <= buckets.length && buckets[dayNum - 1]?.compareSales !== undefined) {
          buckets[dayNum - 1].compareSales! += Number(p.amount ?? 0);
        }
      });
      compareData.completedOrders.forEach((o) => {
        const dKey = bangkokDateKey(o.updated_at ?? o.created_at);
        const dayNum = parseInt(dKey.slice(8, 10), 10);
        if (dayNum >= 1 && dayNum <= buckets.length && buckets[dayNum - 1]?.compareOrders !== undefined) {
          buckets[dayNum - 1].compareOrders! += 1;
        }
      });
    }
  }

  // 6. Calculate Peak Ordering Hours (00:00 - 23:59 น.)
  const peakHourBuckets: PeakHourBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${String(h).padStart(2, "0")}:00 – ${String((h + 1) % 24).padStart(2, "0")}:00 น.`,
    orders: 0,
    sales: 0,
  }));

  primaryData.completedOrders.forEach((o) => {
    const h = bangkokHourKey(o.created_at ?? o.updated_at);
    if (peakHourBuckets[h]) {
      peakHourBuckets[h].orders += 1;
    }
  });

  primaryData.payments.forEach((p) => {
    const h = bangkokHourKey(p.paid_at ?? p.created_at);
    if (peakHourBuckets[h]) {
      peakHourBuckets[h].sales += Number(p.amount ?? 0);
    }
  });

  const maxPeakHour = peakHourBuckets.reduce((best, cur) => (cur.orders > best.orders ? cur : best), peakHourBuckets[0]);
  const peakHourSummary =
    maxPeakHour.orders > 0
      ? {
          hourLabel: maxPeakHour.label,
          orderCount: maxPeakHour.orders,
          salesAmount: maxPeakHour.sales,
        }
      : undefined;

  // 7. Calculate Cancellation Metrics
  const cancellationRate =
    primaryData.totalOrdersCount > 0
      ? (primaryData.cancelledCount / primaryData.totalOrdersCount) * 100
      : 0;

  // 8. Donut segments
  const cash = primaryData.paymentMethods.filter((item) => item.method === "cash");
  const qr = primaryData.paymentMethods.filter((item) => item.method === "qr" || item.method === "qr_code");
  const other = primaryData.paymentMethods.filter((item) => !["cash", "qr", "qr_code"].includes(item.method));

  const summarize = (items: typeof primaryData.paymentMethods) => ({
    count: items.reduce((sum, item) => sum + item.count, 0),
    amount: items.reduce((sum, item) => sum + item.amount, 0),
  });

  const paymentChart: Segment[] = [
    { label: "เงินสด", ...summarize(cash), color: "#f97316" },
    { label: "QR Code", ...summarize(qr), color: "#18181b" },
    ...(other.length ? [{ label: "ช่องทางอื่น", ...summarize(other), color: "#a1a1aa" }] : []),
  ];

  const diningChart: Segment[] = [
    { label: "ทานที่ร้าน", count: primaryData.dineInCount, color: "#f97316" },
    { label: "กลับบ้าน", count: primaryData.takeawayCount, color: "#18181b" },
  ];

  // 9. Comparison Diff & Pct Changes
  const salesComparison = compareData ? calcPctChange(primaryData.totalSales, compareData.totalSales) : null;
  const ordersComparison = compareData ? calcPctChange(primaryData.completedOrderCount, compareData.completedOrderCount) : null;
  const aovComparison = compareData ? calcPctChange(primaryData.averageOrderValue, compareData.averageOrderValue) : null;
  const cancelledComparison = compareData ? calcPctChange(primaryData.cancelledCount, compareData.cancelledCount) : null;

  // 10. Prepare Export Data for Excel (CSV)
  const exportData: ReportExportData = {
    title: "รายงานผลการดำเนินงาน Smart Order",
    periodLabel: primaryLabel,
    generatedAt: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) + " (Asia/Bangkok)",
    summary: {
      totalSales: primaryData.totalSales,
      completedOrders: primaryData.completedOrderCount,
      aov: primaryData.averageOrderValue,
      cancelledOrders: primaryData.cancelledCount,
      cancellationRate,
    },
    breakdown: buckets.map((b) => ({
      period: b.label,
      sales: b.sales,
      orders: b.orders,
    })),
    bestSellingMenus: primaryData.bestSellingMenus.map((m, idx) => ({
      rank: idx + 1,
      name: m.name,
      quantity: m.quantity,
      revenue: m.revenue,
    })),
    paymentMethods: primaryData.paymentMethods.map((p) => ({
      method: paymentMethodLabels[p.method] ?? p.method,
      count: p.count,
      amount: p.amount,
    })),
  };

  const topSellingBest = primaryData.bestSellingMenus.slice(0, 10);
  const maxMenuQty = Math.max(1, ...topSellingBest.map((m) => m.quantity));

  return (
    <main className="min-h-screen bg-orange-50 lg:flex print:bg-white print:p-0">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/reports" />

      <section className="min-w-0 flex-1 p-6 sm:p-8 print:p-2">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-orange-500">สรุปผลการดำเนินงานและวิเคราะห์ข้อมูล</p>
              <h2 className="mt-1 text-3xl font-bold text-zinc-900">รายงานยอดขาย (Reports)</h2>
              <p className="mt-1.5 text-zinc-600">
                รายงาน {primaryLabel} · เขตเวลาไทย (Asia/Bangkok)
              </p>
            </div>
          </header>

          {/* Period Selector Component with Presets and Export */}
          <ReportsPeriodSelector
            key={`${periodType}-${primaryDate}-${primaryWeekDate}-${primaryMonth}-${primaryYear}-${primaryStartDate}-${primaryEndDate}-${isCompare}-${compareType}-${compareDate}-${compareWeekDate}-${compareMonth}-${compareYear}-${compareStartDate}-${compareEndDate}`}
            currentType={periodType}
            currentDate={primaryDate}
            currentWeekDate={primaryWeekDate}
            currentMonth={primaryMonth}
            currentYear={primaryYear}
            currentStartDate={primaryStartDate}
            currentEndDate={primaryEndDate}
            isCompare={isCompare}
            compareType={compareType}
            compareDate={compareDate}
            compareWeekDate={compareWeekDate}
            compareMonth={compareMonth}
            compareYear={compareYear}
            compareStartDate={compareStartDate}
            compareEndDate={compareEndDate}
            today={today}
            currentYearNum={currentYearNum}
            exportData={exportData}
          />

          {pageError ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดข้อมูลรายงานได้: {pageError.message}
            </div>
          ) : (
            <>
              {/* Comparison Highlight Banner if active */}
              {isCompare && compareData && (
                <section aria-label="สรุปผลการเปรียบเทียบ" className="no-print mt-6 rounded-2xl border border-orange-200 bg-orange-100/60 p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow-sm">
                        📊 สรุปการเปรียบเทียบข้อมูล
                      </span>
                      <h3 className="mt-2 text-base font-bold text-zinc-900 sm:text-lg">
                        {primaryLabel} เทียบกับ {compareLabel}
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm font-semibold">
                      <div className="rounded-lg bg-white px-3 py-1.5 shadow-xs border border-orange-200">
                        <span className="text-zinc-500">ผลต่างยอดขาย: </span>
                        <span className={`font-bold ${salesComparison && salesComparison.diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {salesComparison && salesComparison.diff >= 0 ? "+" : ""}฿{formatCurrency(salesComparison?.diff ?? 0)} ({salesComparison && salesComparison.pct >= 0 ? "+" : ""}{(salesComparison?.pct ?? 0).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-1.5 shadow-xs border border-orange-200">
                        <span className="text-zinc-500">ผลต่างออเดอร์: </span>
                        <span className={`font-bold ${ordersComparison && ordersComparison.diff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                          {ordersComparison && ordersComparison.diff >= 0 ? "+" : ""}{ordersComparison?.diff ?? 0} ออเดอร์ ({ordersComparison && ordersComparison.pct >= 0 ? "+" : ""}{(ordersComparison?.pct ?? 0).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* 4 Summary Cards (ยอดขายรวม, ออเดอร์สำเร็จ, ยอดเฉลี่ยต่อออเดอร์, ออเดอร์ยกเลิก) */}
              <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print-break-inside-avoid">
                {/* 1. ยอดขายรวม (Total Sales) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-500">ยอดขายรวม (Total Sales)</p>
                    <span className="rounded-lg bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600">
                      รายรับ
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-orange-600">
                    ฿{formatCurrency(primaryData.totalSales)}
                  </p>

                  {isCompare && compareData && salesComparison ? (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500 truncate" title={`เทียบกับ ฿${formatCurrency(compareData.totalSales)}`}>
                        เทียบ: ฿{formatCurrency(compareData.totalSales)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold ${
                          salesComparison.isZero
                            ? "bg-zinc-100 text-zinc-600"
                            : salesComparison.isUp
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {salesComparison.isZero ? "0%" : salesComparison.isUp ? `↑ +${salesComparison.pct.toFixed(1)}%` : `↓ ${salesComparison.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">เฉพาะรายการชำระเงินสำเร็จ (ไม่รวมยกเลิก)</p>
                  )}
                </article>

                {/* 2. ออเดอร์ที่สำเร็จ (Completed Orders) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-500">ออเดอร์ที่สำเร็จ (Completed)</p>
                    <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      สำเร็จ
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-zinc-900">
                    {primaryData.completedOrderCount.toLocaleString("th-TH")} <span className="text-lg font-medium text-zinc-500">รายการ</span>
                  </p>

                  {isCompare && compareData && ordersComparison ? (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500 truncate" title={`เทียบกับ ${compareData.completedOrderCount} ออเดอร์`}>
                        เทียบ: {compareData.completedOrderCount} รายการ
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold ${
                          ordersComparison.isZero
                            ? "bg-zinc-100 text-zinc-600"
                            : ordersComparison.isUp
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {ordersComparison.isZero ? "0%" : ordersComparison.isUp ? `↑ +${ordersComparison.pct.toFixed(1)}%` : `↓ ${ordersComparison.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">เสร็จสิ้นและชำระเงินเรียบร้อยแล้ว</p>
                  )}
                </article>

                {/* 3. ยอดขายเฉลี่ยต่อออเดอร์ (Average Order Value - AOV) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-500">ยอดเฉลี่ยต่อออเดอร์ (AOV)</p>
                    <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                      เฉลี่ย
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-zinc-900">
                    ฿{formatCurrency(primaryData.averageOrderValue)}
                  </p>

                  {isCompare && compareData && aovComparison ? (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500 truncate" title={`เทียบกับ ฿${formatCurrency(compareData.averageOrderValue)}`}>
                        เทียบ: ฿{formatCurrency(compareData.averageOrderValue)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold ${
                          aovComparison.isZero
                            ? "bg-zinc-100 text-zinc-600"
                            : aovComparison.isUp
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {aovComparison.isZero ? "0%" : aovComparison.isUp ? `↑ +${aovComparison.pct.toFixed(1)}%` : `↓ ${aovComparison.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-zinc-400">คำนวณจากยอดขาย ÷ ออเดอร์ที่สำเร็จ</p>
                  )}
                </article>

                {/* 4. จำนวนออเดอร์ที่ยกเลิก (Cancelled Orders) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-500">ออเดอร์ที่ยกเลิก (Cancelled)</p>
                    <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
                      ยกเลิก
                    </span>
                  </div>
                  <p className="mt-3 text-3xl font-extrabold text-zinc-900">
                    {primaryData.cancelledCount.toLocaleString("th-TH")} <span className="text-lg font-medium text-zinc-500">รายการ</span>
                  </p>

                  {isCompare && compareData && cancelledComparison ? (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs">
                      <span className="text-zinc-500 truncate" title={`เทียบกับ ${compareData.cancelledCount} รายการ`}>
                        เทียบ: {compareData.cancelledCount} รายการ
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold ${
                          cancelledComparison.isZero
                            ? "bg-zinc-100 text-zinc-600"
                            : !cancelledComparison.isUp
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        }`}
                      >
                        {cancelledComparison.isZero ? "0%" : cancelledComparison.isUp ? `↑ +${cancelledComparison.pct.toFixed(1)}%` : `↓ ${cancelledComparison.pct.toFixed(1)}%`}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-rose-600 font-medium">
                      คิดเป็น {cancellationRate.toFixed(1)}% ของออเดอร์ทั้งหมด
                    </p>
                  )}
                </article>
              </section>

              {/* Performance Charts (Sales Bar Chart & Orders Chart & Peak Hours & Payment Donut) */}
              <ReportsCharts
                days={buckets}
                menus={primaryData.bestSellingMenus.map((menu) => ({
                  name: menu.name,
                  quantity: menu.quantity,
                  revenue: menu.revenue,
                }))}
                payments={paymentChart}
                dining={diningChart}
                periodType={periodType}
                compareMode={isCompare && Boolean(compareData)}
                primaryLabel={primaryLabel}
                compareLabel={compareLabel}
                primarySalesTotal={primaryData.totalSales}
                compareSalesTotal={compareData?.totalSales}
                primaryOrdersTotal={primaryData.completedOrderCount}
                compareOrdersTotal={compareData?.completedOrderCount}
                peakHours={peakHourBuckets}
                peakHourSummary={peakHourSummary}
              />

              {/* 3.1 เมนูขายดีที่สุด (Best Selling Items) */}
              <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-4">
                  <div>
                    <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
                      🏆 จัดอันดับเมนู
                    </span>
                    <h3 className="mt-1.5 text-xl font-bold text-zinc-900">
                      เมนูขายดีที่สุด (Best Selling Items)
                    </h3>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      เรียงตามจำนวนที่ขายได้มากที่สุด พร้อมยอดขายรวมของแต่ละเมนู
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-zinc-500">
                    ทั้งหมด {primaryData.bestSellingMenus.length} เมนู
                  </span>
                </div>

                {primaryData.bestSellingMenus.length === 0 ? (
                  <div className="mt-6 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center">
                    <p className="text-zinc-500">ยังไม่มีข้อมูลเมนูที่ขายในช่วงเวลานี้</p>
                  </div>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                          <th className="py-3 px-3 text-center w-16">อันดับ</th>
                          <th className="py-3 px-3">ชื่อเมนู</th>
                          <th className="py-3 px-3 text-right">จำนวนที่ขายได้</th>
                          <th className="py-3 px-3 text-right">ยอดขายรวม</th>
                          <th className="py-3 px-3 w-40">สัดส่วน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {primaryData.bestSellingMenus.map((menu, index) => {
                          const isTop3 = index < 3;
                          const ratio = (menu.quantity / maxMenuQty) * 100;
                          return (
                            <tr key={menu.name} className="hover:bg-orange-50/50 transition">
                              <td className="py-3 px-3 text-center">
                                <span
                                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                    index === 0
                                      ? "bg-amber-400 text-amber-950 shadow-xs"
                                      : index === 1
                                      ? "bg-zinc-300 text-zinc-900"
                                      : index === 2
                                      ? "bg-amber-600 text-white"
                                      : "bg-zinc-100 text-zinc-600"
                                  }`}
                                >
                                  {index + 1}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`font-semibold ${isTop3 ? "text-zinc-900 font-bold" : "text-zinc-800"}`}>
                                  {menu.name}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-zinc-900">
                                {menu.quantity.toLocaleString("th-TH")}{" "}
                                <span className="text-xs font-normal text-zinc-500">จาน</span>
                              </td>
                              <td className="py-3 px-3 text-right font-extrabold text-orange-600">
                                ฿{formatCurrency(menu.revenue)}
                              </td>
                              <td className="py-3 px-3">
                                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                                  <div
                                    className="h-full rounded-full bg-orange-500 transition-all duration-300"
                                    style={{ width: `${ratio}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Add-ons Sold in Period */}
              <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid">
                <h3 className="text-xl font-bold text-zinc-900">Add-on (ท็อปปิ้ง/ตัวเลือกเสริม) ที่ขายในช่วงเวลานี้</h3>
                <p className="mt-1 text-xs text-zinc-500">คำนวณจาก snapshot ราคาและตัวเลือกเสริมตอนลูกค้ากดสั่ง</p>
                {[...primaryData.addonSales.values()].length ? (
                  <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {[...primaryData.addonSales.values()]
                      .sort((a, b) => b.quantity - a.quantity)
                      .map((addon) => (
                        <li key={addon.name} className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                          <span className="font-medium text-zinc-800">
                            {addon.name} <span className="text-xs text-zinc-500">({addon.quantity} รายการ)</span>
                          </span>
                          <span className="font-bold text-orange-600">฿{formatCurrency(addon.revenue)}</span>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
                    ไม่มี Add-on ที่ขายในช่วงเวลาที่เลือก
                  </p>
                )}
              </section>

              {/* Member Demographics Statistics */}
              <section className="mt-6 mb-6 overflow-x-auto rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid">
                <h3 className="text-lg font-bold text-zinc-900">สถิติเมนูแยกตามกลุ่มลูกค้า (Customer Demographics)</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  แยกลูกค้าทั่วไปออกจากสมาชิก ไม่รวมออเดอร์ที่ยกเลิก
                </p>
                {primaryData.memberStatsData.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
                    ยังไม่มีข้อมูลสมาชิกในช่วงเวลาที่เลือก
                  </p>
                ) : (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                        <th className="py-2.5">กลุ่มลูกค้า</th>
                        <th>เพศ</th>
                        <th>ช่วงอายุ</th>
                        <th>เมนู</th>
                        <th className="text-right">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {primaryData.memberStatsData.map(
                        (
                          row: {
                            customer_group: string;
                            gender: string;
                            age_range: string;
                            menu_name: string;
                            quantity: number;
                          },
                          index: number
                        ) => (
                          <tr key={index} className="hover:bg-zinc-50">
                            <td className="py-2">
                              <span
                                className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${
                                  row.customer_group === "guest"
                                    ? "bg-zinc-100 text-zinc-700"
                                    : "bg-orange-100 text-orange-800"
                                }`}
                              >
                                {row.customer_group === "guest" ? "ลูกค้าทั่วไป" : "สมาชิก"}
                              </span>
                            </td>
                            <td>
                              {
                                (
                                  {
                                    female: "หญิง",
                                    male: "ชาย",
                                    other: "อื่น ๆ",
                                    unspecified: "ไม่ระบุ",
                                  } as Record<string, string>
                                )[row.gender] ?? "ไม่ระบุ"
                              }
                            </td>
                            <td>
                              {row.age_range === "unspecified"
                                ? "ไม่ระบุ"
                                : row.age_range === "under18"
                                ? "ต่ำกว่า 18"
                                : row.age_range === "55plus"
                                ? "55 ขึ้นไป"
                                : row.age_range}
                            </td>
                            <td className="font-medium text-zinc-900">{row.menu_name}</td>
                            <td className="text-right font-bold text-orange-600">{row.quantity} จาน</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
