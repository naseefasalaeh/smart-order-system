"use client";

import { useState } from "react";
import type { ReportPeriodType } from "@/lib/bangkok-date";

export type ChartBucket = {
  date: string;
  label: string;
  sales: number;
  orders: number;
  compareSales?: number;
  compareOrders?: number;
  compareLabel?: string;
};

export type Menu = { name: string; quantity: number; revenue?: number };
export type Segment = { label: string; count: number; amount?: number; color: string };

export type PeakHourBucket = {
  hour: number;
  label: string;
  orders: number;
  sales: number;
};

const money = (value: number) => `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

function PeriodChart({
  buckets,
  metric,
  compareMode,
  primaryLabel,
  compareLabel,
  primaryTotalOverride,
  compareTotalOverride,
}: {
  buckets: ChartBucket[];
  metric: "sales" | "orders";
  compareMode?: boolean;
  primaryLabel?: string;
  compareLabel?: string;
  primaryTotalOverride?: number;
  compareTotalOverride?: number;
  periodType?: ReportPeriodType;
}) {
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (buckets.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
        ยังไม่มีข้อมูลในช่วงเวลาที่เลือก
      </p>
    );
  }

  const isSales = metric === "sales";
  const primaryMax = Math.max(0, ...buckets.map((b) => b[metric]));
  const compareMax = compareMode
    ? Math.max(0, ...buckets.map((b) => (isSales ? (b.compareSales ?? 0) : (b.compareOrders ?? 0))))
    : 0;
  const maximum = Math.max(primaryMax, compareMax);
  const scale = Math.max(1, maximum);

  const primaryTotal =
    primaryTotalOverride !== undefined
      ? primaryTotalOverride
      : buckets.reduce((sum, b) => sum + b[metric], 0);

  const compareTotal =
    compareTotalOverride !== undefined
      ? compareTotalOverride
      : compareMode
      ? buckets.reduce((sum, b) => sum + (isSales ? (b.compareSales ?? 0) : (b.compareOrders ?? 0)), 0)
      : 0;

  const left = 60,
    right = 784,
    top = 28,
    bottom = 222;
  const x = (index: number) =>
    buckets.length < 2 ? (left + right) / 2 : left + (index * (right - left)) / (buckets.length - 1);
  const y = (value: number) => bottom - (value / scale) * (bottom - top);

  // Line paths for primary
  const primaryLine = buckets.map((b, index) => `${x(index)},${y(b[metric])}`).join(" ");
  const primaryArea = `${left},${bottom} ${primaryLine} ${right},${bottom}`;

  // Line paths for compare
  const compareLine = compareMode
    ? buckets
        .map((b, index) => `${x(index)},${y(isSales ? (b.compareSales ?? 0) : (b.compareOrders ?? 0))}`)
        .join(" ")
    : "";

  const labelStep = Math.max(1, Math.ceil(buckets.length / 12));
  const activeBucket = hoverIndex !== null && buckets[hoverIndex] ? buckets[hoverIndex] : null;

  // Calculate slot & bar geometry
  const slotWidth = (right - left) / Math.max(1, buckets.length);

  return (
    <div className="mt-4 rounded-xl bg-zinc-50 p-2 sm:p-4">
      {/* Header controls: Totals, Compare tags, and Bar/Line toggle */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-orange-500 shadow-xs" />
            <span className="text-zinc-800">{primaryLabel || "ช่วงเวลาหลัก"}:</span>
            <span className="font-bold text-orange-600">
              {isSales ? money(primaryTotal) : `${primaryTotal.toLocaleString("th-TH")} ออเดอร์`}
            </span>
          </div>
          {compareMode && (
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-zinc-600 bg-zinc-300 shadow-xs" />
              <span className="text-zinc-600">{compareLabel || "ช่วงเวลาเปรียบเทียบ"}:</span>
              <span className="font-bold text-zinc-700">
                {isSales ? money(compareTotal) : `${compareTotal.toLocaleString("th-TH")} ออเดอร์`}
              </span>
            </div>
          )}
        </div>

        {/* View toggle for sales: Bar Chart or Line Chart */}
        {isSales && (
          <div className="no-print flex items-center rounded-lg border border-zinc-200 bg-white p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setChartType("bar")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition ${
                chartType === "bar" ? "bg-orange-500 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
              }`}
              title="แสดงแบบกราฟแท่ง (Bar Chart)"
            >
              <span>📊</span>
              <span>กราฟแท่ง</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType("line")}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition ${
                chartType === "line" ? "bg-orange-500 text-white shadow-xs" : "text-zinc-600 hover:text-zinc-900"
              }`}
              title="แสดงแบบกราฟเส้น (Line Chart)"
            >
              <span>📈</span>
              <span>กราฟเส้น</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating Info Tooltip Banner */}
      <div className="mb-2 min-h-[38px] px-2 text-xs sm:text-sm">
        {activeBucket ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-1.5 text-zinc-800 shadow-xs">
            <span className="font-bold text-zinc-900">📅 {activeBucket.label}:</span>
            <span className="font-bold text-orange-600">
              {isSales ? money(activeBucket.sales) : `${activeBucket.orders.toLocaleString("th-TH")} ออเดอร์`}
            </span>
            {compareMode && (
              <span className="text-zinc-600">
                (เทียบ:{" "}
                <span className="font-semibold text-zinc-700">
                  {isSales
                    ? money(activeBucket.compareSales ?? 0)
                    : `${(activeBucket.compareOrders ?? 0).toLocaleString("th-TH")} ออเดอร์`}
                </span>
                )
              </span>
            )}
          </div>
        ) : (
          <p className="text-xs text-zinc-400 italic">
            ชี้หรือแตะที่แท่งกราฟเพื่อดูวันที่และ{isSales ? "ยอดขาย" : "จำนวนออเดอร์"}อย่างละเอียด
          </p>
        )}
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 800 270"
          role="img"
          aria-label={`${isSales ? "ยอดขาย" : "จำนวนออเดอร์"}`}
          className="h-auto min-w-[620px] w-full"
          onMouseLeave={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id={isSales ? "sales-area" : "orders-area"} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={isSales ? "#f97316" : "#52525b"} stopOpacity=".24" />
              <stop offset="100%" stopColor={isSales ? "#f97316" : "#52525b"} stopOpacity=".02" />
            </linearGradient>
            <linearGradient id={isSales ? "sales-stroke" : "orders-stroke"}>
              <stop stopColor={isSales ? "#fb923c" : "#71717a"} />
              <stop offset="1" stopColor={isSales ? "#ea580c" : "#27272a"} />
            </linearGradient>
            <linearGradient id="sales-bar-grad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
            <linearGradient id="sales-bar-hover" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#c2410c" />
            </linearGradient>
          </defs>

          {/* Y Grid lines and ticks */}
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => {
            const yy = bottom - fraction * (bottom - top);
            const value = maximum * fraction;
            const tick =
              maximum === 0
                ? fraction === 0
                  ? "0"
                  : ""
                : isSales && value >= 1000
                ? `${(value / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}k`
                : Math.round(value).toLocaleString("th-TH");
            return (
              <g key={fraction}>
                <line x1={left} x2={right} y1={yy} y2={yy} stroke="#e4e4e7" strokeDasharray={fraction ? "3 5" : undefined} />
                {tick && (
                  <text x={left - 10} y={yy + 4} textAnchor="end" fill="#71717a" fontSize="11">
                    {tick}
                  </text>
                )}
              </g>
            );
          })}

          {/* Render Chart Content: Bar vs Line */}
          {chartType === "bar" || !isSales ? (
            /* Bar Chart for Sales or Orders */
            buckets.map((b, index) => {
              const cx = x(index);
              const isHovered = hoverIndex === index;
              const primaryVal = isSales ? b.sales : b.orders;
              const compareVal = isSales ? (b.compareSales ?? 0) : (b.compareOrders ?? 0);

              if (compareMode) {
                const barWidth = Math.max(3, Math.min(14, slotWidth * 0.36));
                const primaryHeight = primaryVal > 0 ? Math.max(3, (primaryVal / scale) * (bottom - top)) : 1.5;
                const compareHeight = compareVal > 0 ? Math.max(3, (compareVal / scale) * (bottom - top)) : 1.5;

                return (
                  <g
                    key={`bar-group-${b.date}-${index}`}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverIndex(index)}
                    onTouchStart={() => setHoverIndex(index)}
                  >
                    {/* Hover hotspot */}
                    <rect
                      x={cx - slotWidth / 2}
                      y={top}
                      width={slotWidth}
                      height={bottom - top}
                      fill="transparent"
                    />

                    {/* Primary Bar */}
                    <rect
                      x={cx - barWidth - 1}
                      y={bottom - primaryHeight}
                      width={barWidth}
                      height={primaryHeight}
                      rx={Math.min(barWidth / 2, 3)}
                      fill={isHovered ? "#ea580c" : "#f97316"}
                      opacity={primaryVal === 0 ? 0.35 : 1}
                    />

                    {/* Compare Bar */}
                    <rect
                      x={cx + 1}
                      y={bottom - compareHeight}
                      width={barWidth}
                      height={compareHeight}
                      rx={Math.min(barWidth / 2, 3)}
                      fill={isHovered ? "#52525b" : "#71717a"}
                      opacity={compareVal === 0 ? 0.35 : 1}
                    />
                  </g>
                );
              }

              // Single mode Bar Chart
              const barWidth = Math.max(5, Math.min(22, slotWidth * 0.62));
              const height = primaryVal > 0 ? Math.max(3, (primaryVal / scale) * (bottom - top)) : 1.5;

              return (
                <g
                  key={`bar-${b.date}-${index}`}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverIndex(index)}
                  onTouchStart={() => setHoverIndex(index)}
                >
                  {/* Full column invisible hotspot for easy hover/tap */}
                  <rect
                    x={cx - slotWidth / 2}
                    y={top}
                    width={slotWidth}
                    height={bottom - top}
                    fill={isHovered ? "rgba(249, 115, 22, 0.08)" : "transparent"}
                    rx={4}
                  />

                  {/* Primary Bar */}
                  <rect
                    x={cx - barWidth / 2}
                    y={bottom - height}
                    width={barWidth}
                    height={height}
                    rx={Math.min(barWidth / 2, 4)}
                    fill={isHovered ? "url(#sales-bar-hover)" : isSales ? "url(#sales-bar-grad)" : "url(#orders-stroke)"}
                    opacity={primaryVal === 0 ? 0.3 : 1}
                  />

                  {/* Top value badge when hovered */}
                  {isHovered && primaryVal > 0 && (
                    <g>
                      <rect
                        x={cx - 30}
                        y={Math.max(4, bottom - height - 24)}
                        width="60"
                        height="20"
                        rx="4"
                        fill="#18181b"
                      />
                      <text
                        x={cx}
                        y={Math.max(4, bottom - height - 24) + 14}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="bold"
                      >
                        {isSales ? money(primaryVal) : `${primaryVal}`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })
          ) : (
            /* Line Chart for Sales */
            <>
              {/* Primary Area & Line */}
              <polygon points={primaryArea} fill="url(#sales-area)" />
              <polyline
                points={primaryLine}
                fill="none"
                stroke="url(#sales-stroke)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {buckets.map((b, index) => {
                const isHovered = hoverIndex === index;
                return (
                  <circle
                    key={`p-${b.date}-${index}`}
                    cx={x(index)}
                    cy={y(b.sales)}
                    r={isHovered ? "6" : "4"}
                    fill={isHovered ? "#ea580c" : "white"}
                    stroke="#c2410c"
                    strokeWidth={isHovered ? "3" : "2"}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHoverIndex(index)}
                  />
                );
              })}

              {/* Compare Line if active */}
              {compareMode && (
                <>
                  <polyline
                    points={compareLine}
                    fill="none"
                    stroke="#71717a"
                    strokeWidth="2.5"
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {buckets.map((b, index) => (
                    <circle
                      key={`c-${b.date}-${index}`}
                      cx={x(index)}
                      cy={y(b.compareSales ?? 0)}
                      r="3.5"
                      fill="#71717a"
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  ))}
                </>
              )}
            </>
          )}

          {/* X Axis Labels */}
          {buckets.map((b, index) => {
            const isLast = index === buckets.length - 1;
            const tooCloseToLast = buckets.length - 1 - index < Math.ceil(labelStep / 2);
            const shouldShow = (index % labelStep === 0 && !tooCloseToLast) || isLast;
            const isHovered = hoverIndex === index;
            return shouldShow ? (
              <text
                key={`lbl-${b.date}-${index}`}
                x={x(index)}
                y="250"
                textAnchor="middle"
                fill={isHovered ? "#ea580c" : "#71717a"}
                fontWeight={isHovered ? "bold" : "normal"}
                fontSize="11"
              >
                {b.label}
              </text>
            ) : null;
          })}
        </svg>
      </div>
    </div>
  );
}

function Donut({ segments, total, label }: { segments: Segment[]; total: number; label: string }) {
  if (!total) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
        ยังไม่มีข้อมูล{label}
      </p>
    );
  }

  const stops = segments.reduce<{ end: number; values: string[] }>(
    (current, segment) => {
      const end = current.end + (segment.count / total) * 100;
      return { end, values: [...current.values, `${segment.color} ${current.end}% ${end}%`] };
    },
    { end: 0, values: [] }
  ).values;

  return (
    <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
      <div
        role="img"
        aria-label={`${label}: ${segments.map((item) => `${item.label} ${item.count} รายการ`).join(", ")}`}
        title={segments.map((item) => `${item.label}: ${item.count} รายการ`).join(" · ")}
        className="relative h-44 w-44 shrink-0 rounded-full p-3 shadow-inner"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-zinc-100 bg-white text-center shadow-xs">
          <span className="text-3xl font-bold tracking-tight text-zinc-900">{total.toLocaleString("th-TH")}</span>
          <span className="mt-0.5 text-xs text-zinc-500">{label}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-3">
        {segments.map((segment) => {
          const pct = ((segment.count / total) * 100).toFixed(0);
          return (
            <li
              key={segment.label}
              title={`${segment.label}: ${segment.count} รายการ คิดเป็น ${pct}%${segment.amount === undefined ? "" : ` รวม ${money(segment.amount)}`}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-2.5 text-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                <span className="font-medium text-zinc-800">{segment.label}</span>
              </div>
              <div className="text-right text-xs sm:text-sm">
                <span className="font-bold text-zinc-900">{segment.count} รายการ</span>
                <span className="text-zinc-500"> คิดเป็น </span>
                <span className="font-semibold text-orange-600">{pct}%</span>
                {segment.amount !== undefined && (
                  <>
                    <span className="text-zinc-500"> รวม </span>
                    <span className="font-bold text-zinc-900">{money(segment.amount)}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PeakHoursChart({
  buckets,
  peakHourSummary,
}: {
  buckets: PeakHourBucket[];
  peakHourSummary?: {
    hourLabel: string;
    orderCount: number;
    salesAmount: number;
  };
}) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const maxOrders = Math.max(0, ...buckets.map((b) => b.orders));
  const scale = Math.max(1, maxOrders);

  const left = 45,
    right = 784,
    top = 24,
    bottom = 190;
  const slotWidth = (right - left) / 24;

  const activeBucket = hoverHour !== null && buckets[hoverHour] ? buckets[hoverHour] : null;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">
              ⚡ ช่วงเวลาสั่งอาหาร (Peak Ordering Hours)
            </span>
          </div>
          <h4 className="mt-1.5 text-lg font-bold text-zinc-900">การกระจายตัวของออเดอร์ตามช่วงเวลา (00:00 – 23:59 น.)</h4>
          <p className="mt-0.5 text-xs text-zinc-500">วิเคราะห์เพื่อเตรียมวัตถุดิบและจัดกำลังคนให้เหมาะสม</p>
        </div>

        {peakHourSummary && peakHourSummary.orderCount > 0 && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-right">
            <p className="text-xs font-semibold text-orange-600">🔥 ช่วงเวลาที่สั่งมากที่สุด</p>
            <p className="text-base font-bold text-zinc-900">
              {peakHourSummary.hourLabel}{" "}
              <span className="text-orange-600">({peakHourSummary.orderCount} ออเดอร์)</span>
            </p>
            <p className="text-xs text-zinc-500">ยอดขายรวม {money(peakHourSummary.salesAmount)}</p>
          </div>
        )}
      </div>

      {/* Tooltip info */}
      <div className="mt-3 min-h-[32px] text-xs">
        {activeBucket ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-orange-100/80 px-3 py-1 font-semibold text-zinc-900">
            <span>⏰ ช่วงเวลา {activeBucket.label}:</span>
            <span className="text-orange-600 font-bold">{activeBucket.orders} ออเดอร์</span>
            <span>· ยอดขาย {money(activeBucket.sales)}</span>
          </span>
        ) : (
          <span className="text-zinc-400 italic">ชี้หรือแตะแท่งกราฟชั่วโมงเพื่อดูข้อมูล</span>
        )}
      </div>

      <div className="mt-2 overflow-x-auto">
        <svg
          viewBox="0 0 800 230"
          role="img"
          aria-label="กราฟวิเคราะห์ช่วงเวลาออเดอร์สูงสุด"
          className="h-auto min-w-[620px] w-full"
          onMouseLeave={() => setHoverHour(null)}
        >
          {/* Grid lines */}
          {[1, 0.5, 0].map((fraction) => {
            const yy = bottom - fraction * (bottom - top);
            const value = Math.round(maxOrders * fraction);
            return (
              <g key={fraction}>
                <line x1={left} x2={right} y1={yy} y2={yy} stroke="#e4e4e7" strokeDasharray={fraction ? "3 5" : undefined} />
                <text x={left - 8} y={yy + 4} textAnchor="end" fill="#71717a" fontSize="10">
                  {value}
                </text>
              </g>
            );
          })}

          {/* 24 Hour Bars */}
          {buckets.map((b, h) => {
            const cx = left + h * slotWidth + slotWidth / 2;
            const barWidth = Math.max(4, slotWidth * 0.65);
            const height = b.orders > 0 ? Math.max(3, (b.orders / scale) * (bottom - top)) : 1.5;
            const isPeak = maxOrders > 0 && b.orders === maxOrders;
            const isHovered = hoverHour === h;

            return (
              <g
                key={`hour-${h}`}
                className="cursor-pointer"
                onMouseEnter={() => setHoverHour(h)}
                onTouchStart={() => setHoverHour(h)}
              >
                {/* Hotspot */}
                <rect
                  x={left + h * slotWidth}
                  y={top}
                  width={slotWidth}
                  height={bottom - top}
                  fill={isHovered ? "rgba(249, 115, 22, 0.08)" : "transparent"}
                />

                {/* Bar */}
                <rect
                  x={cx - barWidth / 2}
                  y={bottom - height}
                  width={barWidth}
                  height={height}
                  rx={Math.min(barWidth / 2, 3)}
                  fill={isPeak ? "#ea580c" : isHovered ? "#fb923c" : "#f97316"}
                  opacity={b.orders === 0 ? 0.25 : 1}
                />

                {/* Peak Crown or Badge */}
                {isPeak && maxOrders > 0 && (
                  <text x={cx} y={bottom - height - 6} textAnchor="middle" fontSize="11" fill="#ea580c">
                    ⭐
                  </text>
                )}

                {/* Hour Labels */}
                {h % 2 === 0 && (
                  <text x={cx} y="212" textAnchor="middle" fill="#71717a" fontSize="10">
                    {String(h).padStart(2, "0")}:00
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </article>
  );
}

export type ReportsChartsProps = {
  days: ChartBucket[];
  menus?: (Menu & { revenue?: number })[];
  payments: Segment[];
  dining: Segment[];
  periodType?: ReportPeriodType;
  compareMode?: boolean;
  primaryLabel?: string;
  compareLabel?: string;
  primarySalesTotal?: number;
  compareSalesTotal?: number;
  primaryOrdersTotal?: number;
  compareOrdersTotal?: number;
  peakHours?: PeakHourBucket[];
  peakHourSummary?: {
    hourLabel: string;
    orderCount: number;
    salesAmount: number;
  };
};

export default function ReportsCharts({
  days,
  payments,
  dining,
  periodType = "monthly",
  compareMode = false,
  primaryLabel,
  compareLabel,
  primarySalesTotal,
  compareSalesTotal,
  primaryOrdersTotal,
  compareOrdersTotal,
  peakHours,
  peakHourSummary,
}: ReportsChartsProps) {
  const paymentTotal = payments.reduce((sum, item) => sum + item.count, 0);
  const diningTotal = dining.reduce((sum, item) => sum + item.count, 0);

  let salesTitle = "กราฟยอดขายรายวัน (Sales Chart)";
  let ordersTitle = "กราฟจำนวนออเดอร์ที่ชำระแล้ว (Orders Chart)";

  if (periodType === "daily") {
    salesTitle = "กราฟยอดขายรายชั่วโมง (00:00 – 23:00)";
    ordersTitle = "กราฟจำนวนออเดอร์ที่ชำระแล้วรายชั่วโมง";
  } else if (periodType === "weekly") {
    salesTitle = "กราฟยอดขายรายวันในสัปดาห์ (จันทร์ – อาทิตย์)";
    ordersTitle = "กราฟจำนวนออเดอร์ที่ชำระแล้วรายวันในสัปดาห์";
  } else if (periodType === "yearly") {
    salesTitle = "กราฟยอดขายรายเดือน (มกราคม – ธันวาคม)";
    ordersTitle = "กราฟจำนวนออเดอร์ที่ชำระแล้วรายเดือน";
  } else if (periodType === "custom") {
    salesTitle = "กราฟยอดขายตามช่วงวันที่เลือก";
    ordersTitle = "กราฟจำนวนออเดอร์ที่ชำระแล้วตามช่วงวันที่เลือก";
  }

  return (
    <section aria-labelledby="reports-charts-title" className="mt-6 space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">Analytics & Charts</p>
        <h3 id="reports-charts-title" className="mt-1 text-xl font-bold text-zinc-900">
          ภาพรวมแบบกราฟรายงาน {compareMode && "(เปรียบเทียบข้อมูล)"}
        </h3>
      </div>

      {/* 2.1 กราฟยอดขาย (Sales Chart) */}
      <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-lg font-bold text-zinc-900">{salesTitle}</h4>
            <p className="mt-0.5 text-xs text-zinc-500">
              เปรียบเทียบยอดขายอย่างชัดเจน · เฉพาะออเดอร์ที่สำเร็จ · หน่วยเงินบาท (฿)
            </p>
          </div>
        </div>

        <PeriodChart
          buckets={days}
          metric="sales"
          compareMode={compareMode}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
          primaryTotalOverride={primarySalesTotal}
          compareTotalOverride={compareSalesTotal}
          periodType={periodType}
        />
      </article>

      {/* 2.2 กราฟจำนวนออเดอร์ (Orders Chart) */}
      <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        <h4 className="text-lg font-bold text-zinc-900">{ordersTitle}</h4>
        <p className="mt-0.5 text-xs text-zinc-500">
          แสดงจำนวนรายการสั่งซื้อที่ชำระเงินสำเร็จแยกตามวัน (ไม่รวมออเดอร์ที่ยกเลิก)
        </p>
        <PeriodChart
          buckets={days}
          metric="orders"
          compareMode={compareMode}
          primaryLabel={primaryLabel}
          compareLabel={compareLabel}
          primaryTotalOverride={primaryOrdersTotal}
          compareTotalOverride={compareOrdersTotal}
          periodType={periodType}
        />
      </article>

      {/* 3.2 Peak Ordering Hours */}
      {peakHours && peakHours.length === 24 && (
        <PeakHoursChart buckets={peakHours} peakHourSummary={peakHourSummary} />
      )}

      {/* 2.3 กราฟช่องทางการชำระเงิน และ ประเภทการรับอาหาร */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* Payment Methods */}
        <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold text-zinc-900">ช่องทางการชำระเงิน (Payment Methods)</h4>
              <p className="mt-0.5 text-xs text-zinc-500">แสดงจำนวนออเดอร์ เปอร์เซ็นต์ และยอดเงินรวมของแต่ละช่องทาง</p>
            </div>
          </div>
          <Donut segments={payments} total={paymentTotal} label="การชำระเงิน" />
        </article>

        {/* Dining Type */}
        <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h4 className="text-lg font-bold text-zinc-900">ประเภทการรับอาหาร (Dining Type)</h4>
            <p className="mt-0.5 text-xs text-zinc-500">สัดส่วนลูกค้ารับประทานที่ร้าน vs สั่งกลับบ้าน</p>
          </div>
          <Donut segments={dining} total={diningTotal} label="ประเภทการรับอาหาร" />
        </article>
      </div>
    </section>
  );
}
