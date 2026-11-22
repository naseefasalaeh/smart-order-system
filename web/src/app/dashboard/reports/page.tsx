import DashboardSidebar from "@/components/dashboard-sidebar";
import ReportOrderHistory from "@/components/report-order-history";
import ReportsCharts, {
  type ChartBucket,
  type HorizontalBarItem,
  type PeakHourBucket,
  BestSellingSection,
  DemographicsSection,
} from "@/components/reports-charts";
import ReportsPeriodSelector from "@/components/reports-period-selector";
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
  const [ordersResult, paymentsResult, memberStats] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        dining_type,
        status,
        note,
        created_at,
        updated_at,
        restaurant_tables (
          table_number
        ),
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          note,
          menu_name_snapshot,
          menus (
            name
          ),
          order_item_options(option_name,additional_price,quantity)
        ),
        payments (
          id,
          order_id,
          payment_method,
          amount,
          status,
          paid_at,
          created_at
        )
      `)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false }),

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

    supabase.rpc("member_menu_statistics", { p_start: start, p_end: end }),
  ]);

  const rawOrders = ordersResult.data ?? [];
  const successfulPaymentStatuses = ["paid", "completed", "success", "successful"];

  const allOrders = rawOrders.map((order) => {
    const successfulPayment = (order.payments ?? []).find((p) =>
      successfulPaymentStatuses.includes(String(p.status ?? "").toLowerCase())
    ) ?? order.payments?.[0];

    const rawMethod = successfulPayment?.payment_method;
    const paymentMethod = rawMethod
      ? paymentMethodLabels[rawMethod] ?? rawMethod
      : order.status === "completed"
      ? "เงินสด"
      : null;

    return {
      ...order,
      payment_method: paymentMethod,
      paid_at: successfulPayment?.paid_at ?? null,
      order_items: (order.order_items ?? []).map((item) => ({
        ...item,
        order_item_options: item.order_item_options ?? [],
      })),
    };
  });

  const error = ordersResult.error ?? paymentsResult.error ?? memberStats.error;

  const totalOrdersCount = allOrders.length;
  const completedOrders = allOrders.filter((order) => order.status === "completed");
  const cancelledOrders = allOrders.filter((order) => order.status === "cancelled");
  const cancelledCount = cancelledOrders.length;
  const completedOrderCount = completedOrders.length;

  const allDineInCount = allOrders.filter((order) => order.dining_type === "dine_in").length;
  const allTakeawayCount = allOrders.filter((order) => order.dining_type === "takeaway").length;
  const completedDineInCount = completedOrders.filter((order) => order.dining_type === "dine_in").length;
  const completedTakeawayCount = completedOrders.filter((order) => order.dining_type === "takeaway").length;

  const completedOrderIds = new Set(completedOrders.map((o) => o.id));

  // Link payments strictly to completed orders in this period to maintain 100% data consistency
  const rawPayments = [
    ...(paymentsResult.data ?? []).filter((p) => completedOrderIds.has(p.order_id)),
    ...completedOrders.flatMap((o) => o.payments ?? []),
  ];
  const paidCompletedPayments = [
    ...new Map(
      rawPayments
        .filter((p) => successfulPaymentStatuses.includes(String(p.status ?? "").toLowerCase()))
        .map((p) => [p.id, p])
    ).values(),
  ];

  const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total_amount ?? 0), 0);
  const averageOrderValue =
    completedOrderCount > 0 ? totalSales / completedOrderCount : 0;

  // Best selling menus & addons (from completed orders only)
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
    allOrders,
    completedOrders,
    cancelledOrders,
    payments: paidCompletedPayments,
    totalSales,
    completedOrderCount,
    averageOrderValue,
    totalOrdersCount,
    allDineInCount,
    allTakeawayCount,
    completedDineInCount,
    completedTakeawayCount,
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

    primaryData.completedOrders.forEach((o) => {
      const h = bangkokHourKey(o.created_at);
      if (buckets[h]) {
        buckets[h].orders += 1;
        buckets[h].sales += Number(o.total_amount ?? 0);
      }
    });

    if (compareData) {
      compareData.completedOrders.forEach((o) => {
        const h = bangkokHourKey(o.created_at);
        if (buckets[h] && buckets[h].compareOrders !== undefined && buckets[h].compareSales !== undefined) {
          buckets[h].compareOrders! += 1;
          buckets[h].compareSales! += Number(o.total_amount ?? 0);
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
    primaryData.completedOrders.forEach((o) => {
      const d = bucketByDate.get(bangkokDateKey(o.created_at));
      if (d) {
        d.orders += 1;
        d.sales += Number(o.total_amount ?? 0);
      }
    });

    if (compareData && compareWeek) {
      const compareDates = Array.from({ length: 7 }, (_, d) => {
        const cUtc = Date.parse(`${compareWeek.startDay}T00:00:00.000Z`) + d * 86400000;
        return new Date(cUtc).toISOString().slice(0, 10);
      });

      compareData.completedOrders.forEach((o) => {
        const oDate = bangkokDateKey(o.created_at);
        const idx = compareDates.indexOf(oDate);
        if (idx !== -1 && buckets[idx]?.compareOrders !== undefined && buckets[idx]?.compareSales !== undefined) {
          buckets[idx].compareOrders! += 1;
          buckets[idx].compareSales! += Number(o.total_amount ?? 0);
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

    primaryData.completedOrders.forEach((o) => {
      const dKey = bangkokDateKey(o.created_at);
      const m = parseInt(dKey.slice(5, 7), 10) - 1;
      if (buckets[m]) {
        buckets[m].orders += 1;
        buckets[m].sales += Number(o.total_amount ?? 0);
      }
    });

    if (compareData) {
      compareData.completedOrders.forEach((o) => {
        const dKey = bangkokDateKey(o.created_at);
        const m = parseInt(dKey.slice(5, 7), 10) - 1;
        if (buckets[m] && buckets[m].compareOrders !== undefined && buckets[m].compareSales !== undefined) {
          buckets[m].compareOrders! += 1;
          buckets[m].compareSales! += Number(o.total_amount ?? 0);
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
    primaryData.completedOrders.forEach((o) => {
      const d = bucketByDate.get(bangkokDateKey(o.created_at));
      if (d) {
        d.orders += 1;
        d.sales += Number(o.total_amount ?? 0);
      }
    });

    if (compareData && compareStartDate && compareEndDate) {
      const compRange = bangkokCustomRange(compareStartDate, compareEndDate);
      if (compRange) {
        const compStartUtc = Date.parse(`${compRange.startDay}T00:00:00.000Z`);
        const compDates = Array.from({ length: compRange.dayCount }, (_, i) =>
          new Date(compStartUtc + i * 86400000).toISOString().slice(0, 10)
        );

        compareData.completedOrders.forEach((o) => {
          const oDate = bangkokDateKey(o.created_at);
          const idx = compDates.indexOf(oDate);
          if (idx !== -1 && idx < buckets.length && buckets[idx]?.compareOrders !== undefined && buckets[idx]?.compareSales !== undefined) {
            buckets[idx].compareOrders! += 1;
            buckets[idx].compareSales! += Number(o.total_amount ?? 0);
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
    primaryData.completedOrders.forEach((order) => {
      const day = dailyByDate.get(bangkokDateKey(order.created_at));
      if (day) {
        day.orders += 1;
        day.sales += Number(order.total_amount ?? 0);
      }
    });

    if (compareData && compareMonth) {
      compareData.completedOrders.forEach((o) => {
        const dKey = bangkokDateKey(o.created_at);
        const dayNum = parseInt(dKey.slice(8, 10), 10);
        if (dayNum >= 1 && dayNum <= buckets.length && buckets[dayNum - 1]?.compareOrders !== undefined && buckets[dayNum - 1]?.compareSales !== undefined) {
          buckets[dayNum - 1].compareOrders! += 1;
          buckets[dayNum - 1].compareSales! += Number(o.total_amount ?? 0);
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
    const h = bangkokHourKey(o.created_at);
    if (peakHourBuckets[h]) {
      peakHourBuckets[h].orders += 1;
      peakHourBuckets[h].sales += Number(o.total_amount ?? 0);
    }
  });

  const maxPeakOrders = Math.max(0, ...peakHourBuckets.map((b) => b.orders));
  const peakBuckets = peakHourBuckets.filter((b) => b.orders === maxPeakOrders && maxPeakOrders > 0);
  const maxPeakHour = peakBuckets[0] ?? peakHourBuckets[0];
  const isPeakTie = peakBuckets.length > 1;
  const totalPeakSales = peakBuckets.reduce((sum, b) => sum + b.sales, 0);
  const peakHourSummary =
    maxPeakOrders > 0
      ? {
          hourLabel: isPeakTie
            ? peakBuckets.map((b) => `${String(b.hour).padStart(2, "0")}:00–${String((b.hour + 1) % 24).padStart(2, "0")}:00`).join(", ") + " น."
            : maxPeakHour.label,
          orderCount: maxPeakOrders,
          salesAmount: totalPeakSales,
          isTie: isPeakTie,
          tiedHours: peakBuckets.map((b) => ({
            hour: b.hour,
            label: b.label,
            orders: b.orders,
            sales: b.sales,
          })),
        }
      : undefined;

  // 7. Calculate Cancellation Metrics
  const cancellationRate =
    primaryData.totalOrdersCount > 0
      ? (primaryData.cancelledCount / primaryData.totalOrdersCount) * 100
      : 0;

  // 8. 3.4 & 3.5 Horizontal Bar Items for Payment Methods and Dining Type
  const totalPaidTransactions = Math.max(1, primaryData.payments.length);
  const cashPayments = primaryData.paymentMethods.filter((item) => item.method === "cash");
  const qrPayments = primaryData.paymentMethods.filter((item) => item.method === "qr" || item.method === "qr_code");
  const otherPayments = primaryData.paymentMethods.filter((item) => !["cash", "qr", "qr_code"].includes(item.method));

  const cashCount = cashPayments.reduce((sum, item) => sum + item.count, 0);
  const cashAmount = cashPayments.reduce((sum, item) => sum + item.amount, 0);
  const qrCount = qrPayments.reduce((sum, item) => sum + item.count, 0);
  const qrAmount = qrPayments.reduce((sum, item) => sum + item.amount, 0);
  const otherCount = otherPayments.reduce((sum, item) => sum + item.count, 0);
  const otherAmount = otherPayments.reduce((sum, item) => sum + item.amount, 0);

  const paymentHorizontalBars: HorizontalBarItem[] = [
    {
      label: "เงินสด (Cash)",
      count: cashCount,
      percentage: (cashCount / totalPaidTransactions) * 100,
      amount: cashAmount,
      color: "#f97316",
    },
    {
      label: "QR Code / พร้อมเพย์",
      count: qrCount,
      percentage: (qrCount / totalPaidTransactions) * 100,
      amount: qrAmount,
      color: "#18181b",
    },
    ...(otherCount > 0
      ? [
          {
            label: "ช่องทางอื่น / โอนเงิน",
            count: otherCount,
            percentage: (otherCount / totalPaidTransactions) * 100,
            amount: otherAmount,
            color: "#71717a",
          },
        ]
      : []),
  ];

  // Dining Type Horizontal Bar Items (Based strictly on completed orders for 100% data consistency)
  const completedDiningTotal = Math.max(1, primaryData.completedOrderCount);
  const diningHorizontalBars: HorizontalBarItem[] = [
    {
      label: "ทานที่ร้าน (Dine-in)",
      count: primaryData.completedDineInCount,
      percentage: (primaryData.completedDineInCount / completedDiningTotal) * 100,
      color: "#f97316",
    },
    {
      label: "กลับบ้าน (Takeaway)",
      count: primaryData.completedTakeawayCount,
      percentage: (primaryData.completedTakeawayCount / completedDiningTotal) * 100,
      color: "#52525b",
    },
  ];

  // 9. Comparison Diff & Pct Changes
  const salesComparison = compareData ? calcPctChange(primaryData.totalSales, compareData.totalSales) : null;
  const ordersComparison = compareData ? calcPctChange(primaryData.completedOrderCount, compareData.completedOrderCount) : null;
  const aovComparison = compareData ? calcPctChange(primaryData.averageOrderValue, compareData.averageOrderValue) : null;
  const cancelledComparison = compareData ? calcPctChange(primaryData.cancelledCount, compareData.cancelledCount) : null;

  // 10. Letterhead Timestamp
  const generatedAt = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) + " (Asia/Bangkok)";

  const rankedBestSellingMenus = primaryData.bestSellingMenus.map((m, idx) => ({
    rank: idx + 1,
    name: m.name,
    quantity: m.quantity,
    revenue: m.revenue,
  }));

  return (
    <main className="min-h-screen bg-orange-50 lg:flex print:bg-white print:p-0">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/reports" />

      <section className="min-w-0 flex-1 p-6 sm:p-8 print:p-0">
        <div className="mx-auto max-w-7xl">
          {/* Print Letterhead Header (Visible in PDF / Print only) */}
          <header className="hidden print:block mb-4 border-b-2 border-orange-500 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-black tracking-tight text-zinc-900">SMART ORDER SYSTEM</h1>
                <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                  รายงานผลการดำเนินงานและสถิติการขาย (Business Performance Report)
                </p>
              </div>
              <div className="text-right text-xs text-zinc-600">
                <p className="font-bold text-zinc-900">ช่วงเวลา: {primaryLabel}</p>
                <p>พิมพ์เมื่อ: {generatedAt}</p>
              </div>
            </div>
          </header>

          {/* Web Header (Hidden during Print) */}
          <header className="no-print flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-orange-500">สรุปผลการดำเนินงานและวิเคราะห์ข้อมูล</p>
              <h2 className="mt-1 text-3xl font-bold text-zinc-900">รายงานยอดขาย (Reports)</h2>
              <p className="mt-1.5 text-zinc-600">
                รายงาน {primaryLabel} · เขตเวลาไทย (Asia/Bangkok)
              </p>
            </div>
          </header>

          {/* 1. Period Selector Component with Mode Tabs and Print PDF */}
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
          />

          {pageError ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
              ไม่สามารถโหลดข้อมูลรายงานได้: {pageError.message}
            </div>
          ) : (
            <>
              {/* Comparison Highlight Banner if active (Web only) */}
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

              {/* 2. 4 Summary Cards (ยอดขายรวม, ออเดอร์สำเร็จ, ยอดเฉลี่ยต่อออเดอร์, ออเดอร์ยกเลิก) */}
              <section id="report-summary-cards" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4 print:gap-2 print:mt-2 print-break-inside-avoid">
                {/* 1. ยอดขายรวม (Total Sales) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm print:p-2.5 print:rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-500 print:text-[8.5pt]">ยอดขายรวม (Total Sales)</p>
                    <span className="rounded-lg bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-600 print:text-[7.5pt] print:py-0">
                      รายรับ
                    </span>
                  </div>
                  <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-orange-600 print:text-xl print:mt-0.5">
                    ฿{formatCurrency(primaryData.totalSales)}
                  </p>

                  {isCompare && compareData && salesComparison ? (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs print:mt-1.5 print:pt-1.5 print:text-[7.5pt]">
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
                    <p className="mt-1.5 text-xs text-zinc-400 print:text-[7.5pt] print:mt-0.5">เฉพาะรายการชำระเงินสำเร็จ</p>
                  )}
                </article>

                {/* 2. ออเดอร์ที่สำเร็จ (Completed Orders) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm print:p-2.5 print:rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-500 print:text-[8.5pt]">ออเดอร์ที่สำเร็จ (Completed)</p>
                    <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700 print:text-[7.5pt] print:py-0">
                      สำเร็จ
                    </span>
                  </div>
                  <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-zinc-900 print:text-xl print:mt-0.5">
                    {primaryData.completedOrderCount.toLocaleString("th-TH")} <span className="text-base font-medium text-zinc-500 print:text-xs">รายการ</span>
                  </p>

                  {isCompare && compareData && ordersComparison ? (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs print:mt-1.5 print:pt-1.5 print:text-[7.5pt]">
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
                    <p className="mt-1.5 text-xs text-zinc-400 print:text-[7.5pt] print:mt-0.5">เสร็จสิ้นและชำระเงินแล้ว</p>
                  )}
                </article>

                {/* 3. ยอดขายเฉลี่ยต่อออเดอร์ (Average Order Value - AOV) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm print:p-2.5 print:rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-500 print:text-[8.5pt]">ยอดเฉลี่ยต่อออเดอร์ (AOV)</p>
                    <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700 print:text-[7.5pt] print:py-0">
                      เฉลี่ย
                    </span>
                  </div>
                  <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-zinc-900 print:text-xl print:mt-0.5">
                    ฿{formatCurrency(primaryData.averageOrderValue)}
                  </p>

                  {isCompare && compareData && aovComparison ? (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs print:mt-1.5 print:pt-1.5 print:text-[7.5pt]">
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
                    <p className="mt-1.5 text-xs text-zinc-400 print:text-[7.5pt] print:mt-0.5">คำนวณจากยอดขาย ÷ ออเดอร์สำเร็จ</p>
                  )}
                </article>

                {/* 4. จำนวนออเดอร์ที่ยกเลิก (Cancelled Orders) */}
                <article className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm print:p-2.5 print:rounded-xl">
                  <div className="flex items-center justify-between">
                    <p className="text-xs sm:text-sm font-semibold text-zinc-500 print:text-[8.5pt]">ออเดอร์ที่ยกเลิก (Cancelled)</p>
                    <span className="rounded-lg bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 print:text-[7.5pt] print:py-0">
                      ยกเลิก
                    </span>
                  </div>
                  <p className="mt-2 text-2xl sm:text-3xl font-extrabold text-zinc-900 print:text-xl print:mt-0.5">
                    {primaryData.cancelledCount.toLocaleString("th-TH")} <span className="text-base font-medium text-zinc-500 print:text-xs">รายการ</span>
                  </p>

                  {isCompare && compareData && cancelledComparison ? (
                    <div className="mt-2.5 pt-2.5 border-t border-zinc-100 flex items-center justify-between gap-2 text-xs print:mt-1.5 print:pt-1.5 print:text-[7.5pt]">
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
                    <p className="mt-1.5 text-xs text-rose-600 font-semibold print:text-[7.5pt] print:mt-0.5">
                      คิดเป็น {cancellationRate.toFixed(1)}% (ยกเลิก {primaryData.cancelledCount} จากทั้งหมด {primaryData.totalOrdersCount} รายการ)
                    </p>
                  )}
                </article>
              </section>

              {/* Data Consistency Explanatory Badge */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-orange-100/60 border border-orange-200 px-4 py-2 text-xs text-zinc-700 print-break-inside-avoid print:bg-white print:border-zinc-300 print:py-1.5 print:px-3 print:text-[8pt] print:mt-1.5">
                <span>
                  💡 <strong>ความสอดคล้องของข้อมูล:</strong> ออเดอร์ทั้งหมด {primaryData.totalOrdersCount} รายการ = สำเร็จ {primaryData.completedOrderCount} + ยกเลิก {primaryData.cancelledCount} รายการ (อัตราการยกเลิก {cancellationRate.toFixed(1)}%)
                </span>
                <span className="text-zinc-500 font-medium print:text-[7.5pt]">
                  ยอดขาย (฿{primaryData.totalSales.toLocaleString("th-TH")}), รายการชำระเงิน ({primaryData.payments.length} รายการชำระ จาก {primaryData.completedOrderCount} ออเดอร์) และประเภทการรับอาหาร ({primaryData.completedOrderCount} ออเดอร์) คำนวณจากออเดอร์ที่สำเร็จ 100%
                </span>
              </div>

              {/* 3. Sales Chart, 4. Orders Chart, 5. Peak Hours, 6. Horizontal Payment & Dining */}
              <ReportsCharts
                days={buckets}
                payments={paymentHorizontalBars}
                dining={diningHorizontalBars}
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

              {/* Page 3 in Print: Product & Add-on Performance */}
              <div id="report-page-3" className="print-page-break-before print:pt-1 space-y-6 print:space-y-0">
                <div className="hidden print:block border-b-2 border-orange-500 pb-1 mb-1.5">
                  <h3 className="text-xs font-bold text-zinc-900 uppercase">
                    ส่วนที่ 3: เมนูขายดีที่สุดและตัวเลือกเสริม (Product & Add-on Performance)
                  </h3>
                </div>

                {/* 7. เมนูขายดีที่สุด (Best Selling Items) - Horizontal Bar Chart + Detailed Table */}
                <BestSellingSection menus={rankedBestSellingMenus} />

                {/* 8. Add-on (ท็อปปิ้ง/ตัวเลือกเสริม) */}
                <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid print:p-2.5 print:!mt-5 print:rounded-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 print:pb-1">
                    <div>
                      <h3 className="text-xl font-bold text-zinc-900 print:text-sm">
                        Add-on (ท็อปปิ้ง/ตัวเลือกเสริม) ที่ขายในช่วงเวลานี้
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500 print:text-[7.5pt]">
                        คำนวณจาก snapshot ราคาและตัวเลือกเสริมตอนลูกค้ากดสั่ง (เรียงตามยอดขาย)
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-zinc-500 print:text-[8pt]">
                      รวม {[...primaryData.addonSales.values()].reduce((sum, a) => sum + a.quantity, 0)} รายการ
                    </span>
                  </div>

                  {[...primaryData.addonSales.values()].length ? (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3 print:gap-1.5 print:mt-1.5">
                      {[...primaryData.addonSales.values()]
                        .sort((a, b) => b.revenue - a.revenue)
                        .map((addon) => (
                          <li
                            key={addon.name}
                            className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 p-3.5 text-sm print:p-1.5 print:rounded-lg print:text-xs"
                          >
                            <div>
                              <p className="font-semibold text-zinc-900 print:text-[8.5pt]">{addon.name}</p>
                              <p className="text-xs text-zinc-500 print:text-[7.5pt]">ขายได้ {addon.quantity.toLocaleString("th-TH")} ครั้ง</p>
                            </div>
                            <span className="font-extrabold text-orange-600 print:text-[8.5pt]">
                              ฿{formatCurrency(addon.revenue)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500 print:p-3 print:mt-2 print:text-xs">
                      ไม่มี Add-on ที่ขายในช่วงเวลาที่เลือก
                    </p>
                  )}
                </section>
              </div>

              {/* Section 4 in Print: Customer Demographics (Natural flow, breaks cleanly across pages) */}
              <div id="report-page-4" className="print:pt-1 space-y-6 print:space-y-2">
                <div className="hidden print:block border-b-2 border-orange-500 pb-1 mb-1.5">
                  <h3 className="text-xs font-bold text-zinc-900 uppercase">
                    ส่วนที่ 4: สถิติเมนูตามกลุ่มลูกค้า (Customer Demographics)
                  </h3>
                </div>

                {/* 9. สถิติเมนูแยกตามกลุ่มลูกค้า (Customer Demographics) with Interactive Client-side Filter */}
                <DemographicsSection
                  data={primaryData.memberStatsData}
                  completedOrderCount={primaryData.completedOrderCount}
                />

                {/* Print Document Footer */}
                <footer className="hidden print:flex items-center justify-between border-t border-zinc-200 pt-2 mt-4 text-[8pt] text-zinc-500">
                  <span>Smart Order System · รายงานสรุปผลการดำเนินงานและสถิติการขาย</span>
                  <span>รายงานสรุปผลการดำเนินงาน</span>
                </footer>
              </div>

              {/* 10. ประวัติคำสั่งซื้อย้อนหลัง (Order History Table) & Slide-over Drawer (Web only) */}
              <ReportOrderHistory orders={primaryData.allOrders} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
