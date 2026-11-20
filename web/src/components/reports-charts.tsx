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

export type PeakHourBucket = {
  hour: number;
  label: string;
  orders: number;
  sales: number;
};

export type HorizontalBarItem = {
  label: string;
  count: number;
  percentage: number; // 0..100
  amount?: number;
  color?: string;
  rank?: number;
  sublabel?: string;
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

  // Average daily benchmark for sales
  const avgDaily = buckets.length > 0 ? primaryTotal / buckets.length : 0;

  const left = 60,
    right = 784,
    top = 22,
    bottom = 175;
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
    <div className="mt-4 rounded-xl bg-zinc-50 p-2 sm:p-4 print:bg-white print:p-0 print:mt-1">
      {/* Header controls: Totals, Compare tags, and Bar/Line toggle */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 print:mb-0.5 print:px-0">
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold sm:text-sm print:gap-2.5 print:text-[8.5pt]">
          <div className="flex items-center gap-2 print:gap-1">
            <span className="h-3 w-3 rounded-full bg-orange-500 shadow-xs print:h-2 print:w-2" />
            <span className="text-zinc-800">{primaryLabel || "ช่วงเวลาหลัก"}:</span>
            <span className="font-bold text-orange-600">
              {isSales ? money(primaryTotal) : `${primaryTotal.toLocaleString("th-TH")} ออเดอร์`}
            </span>
          </div>

          {/* Daily average indicator for sales */}
          {isSales && avgDaily > 0 && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200/60 px-2 py-0.5 text-xs text-amber-800 print:text-[7.5pt] print:py-0">
              <span className="text-amber-600 font-bold">---</span>
              <span>เฉลี่ย: <strong>{money(avgDaily)}</strong> / วัน</span>
            </div>
          )}

          {compareMode && (
            <div className="flex items-center gap-2 print:gap-1">
              <span className="h-3 w-3 rounded-full border-2 border-zinc-600 bg-zinc-300 shadow-xs print:h-2 print:w-2" />
              <span className="text-zinc-600">{compareLabel || "ช่วงเวลาเปรียบเทียบ"}:</span>
              <span className="font-bold text-zinc-700">
                {isSales ? money(compareTotal) : `${compareTotal.toLocaleString("th-TH")} ออเดอร์`}
              </span>
            </div>
          )}
        </div>

        {/* View toggle for sales: Bar Chart or Line Chart (Hidden during print) */}
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
      <div className="no-print mb-2 min-h-[36px] px-2 text-xs sm:text-sm">
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
          viewBox="0 0 800 215"
          role="img"
          aria-label={`${isSales ? "ยอดขาย" : "จำนวนออเดอร์"}`}
          className="h-auto min-w-[580px] w-full print-chart-svg"
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

          {/* Average daily line for sales */}
          {isSales && avgDaily > 0 && avgDaily <= maximum && (
            <g>
              <line
                x1={left}
                x2={right}
                y1={y(avgDaily)}
                y2={y(avgDaily)}
                stroke="#d97706"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.8"
              />
              <text
                x={right}
                y={y(avgDaily) - 5}
                textAnchor="end"
                fill="#d97706"
                fontSize="10"
                fontWeight="bold"
              >
                เฉลี่ย {money(avgDaily)}/วัน
              </text>
            </g>
          )}

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

                  {/* Number label on top of bar (when there is space or hovered) */}
                  {(isHovered || buckets.length <= 14) && primaryVal > 0 && (
                    <text
                      x={cx}
                      y={bottom - height - 5}
                      textAnchor="middle"
                      fill={isHovered ? "#ea580c" : "#71717a"}
                      fontSize="9"
                      fontWeight="bold"
                    >
                      {isSales ? (primaryVal >= 1000 ? `${Math.round(primaryVal / 1000)}k` : `${primaryVal}`) : primaryVal}
                    </text>
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
                y="198"
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

export function PeakHoursChart({
  buckets,
  peakHourSummary,
}: {
  buckets: PeakHourBucket[];
  peakHourSummary?: {
    hourLabel: string;
    orderCount: number;
    salesAmount: number;
    isTie?: boolean;
    tiedHours?: { hour: number; label: string; orders: number; sales: number }[];
  };
}) {
  const [hoverHour, setHoverHour] = useState<number | null>(null);

  const maxOrders = Math.max(0, ...buckets.map((b) => b.orders));
  const scale = Math.max(1, maxOrders);

  const left = 45,
    right = 784,
    top = 18,
    bottom = 145;
  const slotWidth = (right - left) / 24;

  const activeBucket = hoverHour !== null && buckets[hoverHour] ? buckets[hoverHour] : null;

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 print-break-inside-avoid print:p-2.5 print:rounded-xl">
      {/* 3.3 Prominent Summary Banner for Peak Ordering Hour */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 pb-4 print:pb-1.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700 print:text-[8pt] print:py-0">
              ⚡ ช่วงเวลาสั่งอาหาร (Peak Ordering Hours)
            </span>
          </div>
          <h4 className="mt-1 text-lg font-bold text-zinc-900 print:text-sm">
            การกระจายตัวของออเดอร์ตามช่วงเวลา (00:00 – 23:59 น.)
          </h4>
          <p className="mt-0.5 text-xs text-zinc-500 print:text-[8pt]">
            วิเคราะห์ช่วงเวลาที่ลูกค้าสั่งอาหารมากที่สุด เพื่อเตรียมสต็อกและจัดกะพนักงาน
          </p>
        </div>

        {peakHourSummary && peakHourSummary.orderCount > 0 ? (
          <div className="rounded-2xl border-2 border-orange-300 bg-orange-50/90 px-4 py-2.5 text-left sm:text-right shadow-xs print:rounded-xl print:py-1 print:px-2.5">
            <p className="text-xs font-bold uppercase tracking-wider text-orange-600 print:text-[7pt]">
              {peakHourSummary.isTie
                ? `🔥 ช่วงเวลาที่ลูกค้าสั่งมากที่สุด (${peakHourSummary.tiedHours?.length ?? 0} ช่วงพีคเท่ากัน)`
                : "🔥 ช่วงเวลาที่ลูกค้าสั่งมากที่สุด"}
            </p>
            <p className="mt-0.5 text-sm font-extrabold text-zinc-900 sm:text-base print:text-[8pt] print:leading-tight">
              {peakHourSummary.hourLabel}{" "}
              <span className="text-orange-600">
                {peakHourSummary.isTie
                  ? `(ช่วงละ ${peakHourSummary.orderCount} ออเดอร์)`
                  : `จำนวน ${peakHourSummary.orderCount} ออเดอร์`}
              </span>
            </p>
            <p className="text-xs font-semibold text-zinc-600 print:text-[7.5pt]">
              {peakHourSummary.isTie ? "ยอดขายรวมช่วงพีค " : "ยอดขายรวม "}
              <span className="text-orange-600 font-bold">{money(peakHourSummary.salesAmount)}</span>
              {peakHourSummary.isTie && peakHourSummary.tiedHours && (
                <span className="text-zinc-500 font-normal ml-1">
                  ({peakHourSummary.tiedHours.map((h) => `${String(h.hour).padStart(2, "0")}:00: ${money(h.sales)}`).join(", ")})
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 print:text-xs">
            ยังไม่มีออเดอร์ในช่วงเวลานี้
          </div>
        )}
      </div>

      {/* Tooltip info */}
      <div className="no-print mt-3 min-h-[30px] text-xs">
        {activeBucket ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-orange-100/90 px-3 py-1 font-semibold text-zinc-900 shadow-xs">
            <span>⏰ ช่วงเวลา {activeBucket.label}:</span>
            <span className="text-orange-600 font-bold">{activeBucket.orders} ออเดอร์</span>
            <span>· ยอดขาย {money(activeBucket.sales)}</span>
          </span>
        ) : (
          <span className="text-zinc-400 italic">
            ชี้หรือแตะแท่งชั่วโมงเพื่อดูจำนวนออเดอร์และยอดขาย (แท่งสีส้มคือช่วงพีคสูงสุด)
          </span>
        )}
      </div>

      <div className="mt-2 overflow-x-auto print:mt-1">
        <svg
          viewBox="0 0 800 180"
          role="img"
          aria-label="กราฟวิเคราะห์ช่วงเวลาออเดอร์สูงสุด"
          className="h-auto min-w-[580px] w-full print-chart-svg"
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

          {/* 24 Hour Bars: Peak hour = Orange (#ea580c), others = neutral Gray (#e4e4e7) */}
          {buckets.map((b, h) => {
            const cx = left + h * slotWidth + slotWidth / 2;
            const barWidth = Math.max(4, slotWidth * 0.68);
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
                  fill={isPeak ? "#ea580c" : isHovered ? "#fb923c" : "#e4e4e7"}
                  opacity={b.orders === 0 ? 0.35 : 1}
                />

                {/* Peak Crown or Badge */}
                {isPeak && maxOrders > 0 && (
                  <g>
                    <text x={cx} y={bottom - height - 12} textAnchor="middle" fontSize="11" fill="#ea580c">
                      ⭐
                    </text>
                    <text x={cx} y={bottom - height - 2} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#ea580c">
                      {b.orders}
                    </text>
                  </g>
                )}

                {/* Non-peak value on bar */}
                {!isPeak && b.orders > 0 && (
                  <text x={cx} y={bottom - height - 2} textAnchor="middle" fontSize="8" fill="#71717a">
                    {b.orders}
                  </text>
                )}

                {/* Hour Labels */}
                {h % 2 === 0 && (
                  <text x={cx} y="165" textAnchor="middle" fill={isPeak ? "#ea580c" : "#71717a"} fontWeight={isPeak ? "bold" : "normal"} fontSize="10">
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

// 3.4 & 3.5 Horizontal Bar Chart for Payment Methods & Dining Type
export function HorizontalBarList({
  title,
  subtitle,
  items,
  totalCount,
  totalAmount,
  unit = "รายการ",
  footerNote,
  emptyMessage,
}: {
  title: string;
  subtitle: string;
  items: HorizontalBarItem[];
  totalCount: number;
  totalAmount?: number;
  unit?: string;
  footerNote?: string;
  emptyMessage: string;
}) {
  if (items.length === 0 || totalCount === 0) {
    return (
      <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 print-break-inside-avoid print:p-3">
        <h4 className="text-lg font-bold text-zinc-900">{title}</h4>
        <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          {emptyMessage}
        </p>
      </article>
    );
  }

  return (
    <article className="min-w-0 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 print-break-inside-avoid print:p-2.5 print:rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-3 print:pb-1.5">
        <div>
          <h4 className="text-lg font-bold text-zinc-900 print:text-sm">{title}</h4>
          <p className="mt-0.5 text-xs text-zinc-500 print:text-[8pt]">{subtitle}</p>
        </div>
        <div className="text-right text-xs font-semibold text-zinc-600 print:text-[8pt]">
          <span>รวม {totalCount.toLocaleString("th-TH")} {unit}</span>
          {totalAmount !== undefined && (
            <span className="ml-2 font-bold text-orange-600">({money(totalAmount)})</span>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3.5 print:mt-2 print:space-y-2">
        {items.map((item) => {
          const pct = Math.max(0, Math.min(100, item.percentage));
          return (
            <div key={item.label} className="group">
              {/* Row Header: Label, Count, Percent, Amount */}
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm print:mb-0.5 print:text-[8.5pt]">
                <div className="flex items-center gap-2 font-semibold text-zinc-900 print:gap-1.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full print:h-2 print:w-2"
                    style={{ backgroundColor: item.color || "#f97316" }}
                  />
                  <span>{item.label}</span>
                </div>
                <div className="text-right text-xs font-medium text-zinc-700 print:text-[8pt]">
                  <span className="font-bold text-zinc-900">{item.count.toLocaleString("th-TH")} {unit}</span>
                  <span className="text-zinc-500"> ({pct.toFixed(0)}%)</span>
                  {item.amount !== undefined && (
                    <span className="ml-1.5 font-bold text-orange-600">รวม {money(item.amount)}</span>
                  )}
                </div>
              </div>

              {/* Horizontal Bar Track */}
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100 print:h-2">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: item.color || "#f97316",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {footerNote && (
        <p className="mt-3 text-[11px] text-zinc-500 print:mt-1 print:text-[7pt] border-t border-zinc-100 pt-2 print:pt-1">
          {footerNote}
        </p>
      )}
    </article>
  );
}

// 3.6 Best Selling Items (Horizontal Bar Chart + Table)
export function BestSellingSection({
  menus,
  maxDisplay = 10,
}: {
  menus: { rank: number; name: string; quantity: number; revenue: number }[];
  maxDisplay?: number;
}) {
  const [showAll, setShowAll] = useState(false);

  if (menus.length === 0) {
    return (
      <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid print:p-3">
        <h3 className="text-xl font-bold text-zinc-900">เมนูขายดีที่สุด (Best Selling Items)</h3>
        <p className="mt-1 text-xs text-zinc-500">เรียงตามจำนวนที่ขายได้มากที่สุด</p>
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          ยังไม่มีข้อมูลเมนูที่ขายในช่วงเวลานี้
        </p>
      </section>
    );
  }

  const topMenus = menus.slice(0, 5);
  const maxQty = Math.max(1, ...menus.map((m) => m.quantity));
  const displayedTableMenus = showAll ? menus : menus.slice(0, maxDisplay);

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid print:p-2.5 print:rounded-xl print:mt-1">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-4 print:pb-1.5">
        <div>
          <span className="rounded-md bg-orange-100 px-2.5 py-0.5 text-xs font-bold text-orange-700 print:text-[8pt] print:py-0">
            🏆 จัดอันดับเมนู
          </span>
          <h3 className="mt-1.5 text-xl font-bold text-zinc-900 print:text-sm print:mt-0.5">
            เมนูขายดีที่สุด (Best Selling Items)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 print:text-[8pt]">
            กราฟแท่งแนวนอน Top 5 และตารางอันดับเมนูเรียงจากจำนวนขายมากไปน้อย (เฉพาะออเดอร์สำเร็จ)
          </p>
        </div>
        <span className="text-xs font-semibold text-zinc-500 print:text-[8pt]">
          ทั้งหมด {menus.length} เมนู
        </span>
      </div>

      {/* 3.6 Horizontal Bar Chart for Top 5 Menus */}
      <div className="mt-5 rounded-xl bg-orange-50/50 border border-orange-100 p-4 print:bg-white print:mt-1.5 print:p-2 print:border-zinc-200 print:rounded-lg">
        <h4 className="text-sm font-bold text-zinc-800 mb-3 flex items-center gap-1.5 print:mb-1.5 print:text-xs">
          <span>📊</span>
          <span>กราฟแท่งแนวนอน 5 อันดับแรก (Top 5 Best Sellers)</span>
        </h4>
        <div className="space-y-3 print:space-y-1.5">
          {topMenus.map((menu, index) => {
            const ratio = (menu.quantity / maxQty) * 100;
            return (
              <div key={menu.name} className="group">
                <div className="mb-1 flex items-center justify-between text-xs sm:text-sm print:mb-0.5 print:text-[8.5pt]">
                  <div className="flex items-center gap-2 print:gap-1.5">
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold print:h-4 print:w-4 print:text-[7pt] ${
                        index === 0
                          ? "bg-amber-400 text-amber-950"
                          : index === 1
                          ? "bg-zinc-300 text-zinc-900"
                          : index === 2
                          ? "bg-amber-600 text-white"
                          : "bg-zinc-200 text-zinc-700"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span className="font-semibold text-zinc-900">{menu.name}</span>
                  </div>
                  <div className="text-right print:text-[8pt]">
                    <span className="font-bold text-zinc-900">{menu.quantity.toLocaleString("th-TH")} จาน</span>
                    <span className="ml-2 font-bold text-orange-600">{money(menu.revenue)}</span>
                  </div>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-200/80 print:h-1.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-300"
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Table */}
      <div className="mt-6 overflow-x-auto print:mt-2">
        <table className="w-full text-left text-sm print:text-xs">
          <thead>
            <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500 print:text-[8pt]">
              <th className="py-2.5 px-3 text-center w-16 print:py-1 print:px-1.5 print:w-10">อันดับ</th>
              <th className="py-2.5 px-3 print:py-1 print:px-1.5">ชื่อเมนู</th>
              <th className="py-2.5 px-3 text-right print:py-1 print:px-1.5">จำนวนที่ขายได้</th>
              <th className="py-2.5 px-3 text-right print:py-1 print:px-1.5">ยอดขายรวม</th>
              <th className="py-2.5 px-3 w-36 print:py-1 print:px-1.5 print:w-28">สัดส่วน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {displayedTableMenus.map((menu, index) => {
              const isTop3 = index < 3;
              const ratio = (menu.quantity / maxQty) * 100;
              return (
                <tr key={menu.name} className="hover:bg-orange-50/40 transition">
                  <td className="py-2.5 px-3 text-center print:py-1 print:px-1.5">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold print:h-4 print:w-4 print:text-[7pt] ${
                        index === 0
                          ? "bg-amber-400 text-amber-950"
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
                  <td className="py-2.5 px-3 print:py-1 print:px-1.5">
                    <span className={`font-semibold ${isTop3 ? "text-zinc-900 font-bold" : "text-zinc-800"}`}>
                      {menu.name}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-bold text-zinc-900 print:py-1 print:px-1.5 print:text-[8.5pt]">
                    {menu.quantity.toLocaleString("th-TH")}{" "}
                    <span className="text-xs font-normal text-zinc-500 print:text-[7.5pt]">จาน</span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-extrabold text-orange-600 print:py-1 print:px-1.5 print:text-[8.5pt]">
                    {money(menu.revenue)}
                  </td>
                  <td className="py-2.5 px-3 print:py-1 print:px-1.5">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 print:h-1.5">
                      <div
                        className="h-full rounded-full bg-orange-500"
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

      {menus.length > maxDisplay && (
        <div className="no-print mt-4 text-center">
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50"
          >
            {showAll ? "ย่อรายการเหลือ 10 อันดับ" : `ดูทั้งหมด ${menus.length} รายการ`}
          </button>
        </div>
      )}
    </section>
  );
}

// 3.8 Customer Demographics Table with interactive filters
export function DemographicsSection({
  data,
  completedOrderCount,
}: {
  data: {
    customer_group: string;
    gender: string;
    age_range: string;
    menu_name: string;
    quantity: number;
  }[];
  completedOrderCount?: number;
}) {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [genderFilter, setGenderFilter] = useState<string>("all");

  const filtered = data.filter((row) => {
    if (groupFilter !== "all" && row.customer_group !== groupFilter) return false;
    if (genderFilter !== "all" && row.gender !== genderFilter) return false;
    return true;
  });

  const totalQuantity = filtered.reduce((sum, r) => sum + Number(r.quantity || 0), 0);

  return (
    <section className="mt-6 mb-6 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm print-break-inside-avoid print:p-2.5 print:mt-1 print:mb-0 print:rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-4 print:pb-1.5">
        <div>
          <span className="rounded-md bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 print:text-[8pt] print:py-0">
            👥 ข้อมูลกลุ่มลูกค้า
          </span>
          <h3 className="mt-1.5 text-xl font-bold text-zinc-900 print:text-sm print:mt-0.5">
            สถิติเมนูตามกลุ่มลูกค้า (Customer Demographics)
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500 print:text-[8pt]">
            จำแนกพฤติกรรมการสั่งอาหาร (หน่วยเป็น <strong className="text-zinc-700">จาน/รายการ</strong> ไม่ใช่จำนวนออเดอร์) รวมทั้งหมด {totalQuantity.toLocaleString("th-TH")} จาน{completedOrderCount !== undefined ? ` จาก ${completedOrderCount.toLocaleString("th-TH")} ออเดอร์ที่สำเร็จ` : ""}
          </p>
        </div>
        <div className="text-right text-xs font-semibold text-zinc-600 print:text-[8pt]">
          <span>รวม {totalQuantity.toLocaleString("th-TH")} จาน (Dishes)</span>
        </div>
      </div>

      {/* Interactive Filters (Web only) */}
      <div className="no-print mt-4 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-zinc-600">กลุ่มลูกค้า:</span>
          {["all", "member", "guest"].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupFilter(g)}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                groupFilter === g ? "bg-orange-500 text-white shadow-xs" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {g === "all" ? "ทั้งหมด" : g === "member" ? "สมาชิก" : "ลูกค้าทั่วไป"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-zinc-600">เพศ:</span>
          {[
            { id: "all", label: "ทั้งหมด" },
            { id: "female", label: "หญิง" },
            { id: "male", label: "ชาย" },
            { id: "unspecified", label: "ไม่ระบุ" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGenderFilter(item.id)}
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                genderFilter === item.id ? "bg-orange-500 text-white shadow-xs" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">
          ไม่มีข้อมูลตามเงื่อนไขที่เลือก
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500 print:text-[8pt]">
                <th className="py-2.5 px-3 print:py-1 print:px-2">กลุ่มลูกค้า</th>
                <th className="py-2.5 px-3 print:py-1 print:px-2">เพศ</th>
                <th className="py-2.5 px-3 print:py-1 print:px-2">ช่วงอายุ</th>
                <th className="py-2.5 px-3 print:py-1 print:px-2">เมนู</th>
                <th className="py-2.5 px-3 text-right print:py-1 print:px-2">จำนวนจานที่สั่ง (Dishes)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((row, index) => (
                <tr key={index} className="hover:bg-zinc-50">
                  <td className="py-2.5 px-3 print:py-1 print:px-2">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold print:text-[7.5pt] print:py-0 ${
                        row.customer_group === "guest"
                          ? "bg-zinc-100 text-zinc-700"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {row.customer_group === "guest" ? "ลูกค้าทั่วไป" : "สมาชิก"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 print:py-1 print:px-2 print:text-[8.5pt]">
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
                  <td className="py-2.5 px-3 print:py-1 print:px-2 print:text-[8.5pt]">
                    {row.age_range === "unspecified"
                      ? "ไม่ระบุ"
                      : row.age_range === "under18"
                      ? "ต่ำกว่า 18"
                      : row.age_range === "55plus"
                      ? "55 ขึ้นไป"
                      : row.age_range}
                  </td>
                  <td className="py-2.5 px-3 font-medium text-zinc-900 print:py-1 print:px-2 print:text-[8.5pt]">{row.menu_name}</td>
                  <td className="py-2.5 px-3 text-right font-bold text-orange-600 print:py-1 print:px-2 print:text-[8.5pt]">{row.quantity} จาน</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export type ReportsChartsProps = {
  days: ChartBucket[];
  menus?: (Menu & { revenue?: number })[];
  payments: HorizontalBarItem[];
  dining: HorizontalBarItem[];
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
    isTie?: boolean;
    tiedHours?: { hour: number; label: string; orders: number; sales: number }[];
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
  const paymentTotalCount = payments.reduce((sum, item) => sum + item.count, 0);
  const paymentTotalAmount = payments.reduce((sum, item) => sum + (item.amount || 0), 0);
  const diningTotalCount = dining.reduce((sum, item) => sum + item.count, 0);

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

      {/* 3.1 กราฟยอดขาย (Sales Chart) */}
      <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 print-break-inside-avoid print:p-3">
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

      {/* 3.2 กราฟจำนวนออเดอร์ (Orders Chart) */}
      <article className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 print-break-inside-avoid print:p-3">
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

      {/* Page 2 in Print: Ordering Behavior & Payment Methods */}
      <div id="report-page-2" className="print-page-break-before print:pt-2 space-y-6 print:space-y-4">
        <div className="hidden print:block border-b-2 border-orange-500 pb-1 mb-2">
          <h3 className="text-sm font-bold text-zinc-900 uppercase">
            ส่วนที่ 2: พฤติกรรมการสั่งซื้อและช่องทางการชำระเงิน (Ordering & Payments)
          </h3>
        </div>

        {/* 3.3 Peak Ordering Hours */}
        {peakHours && peakHours.length === 24 && (
          <PeakHoursChart buckets={peakHours} peakHourSummary={peakHourSummary} />
        )}

        {/* 3.4 & 3.5 Horizontal Bar Charts: Payment Methods & Dining Type */}
        <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
          {/* Payment Methods */}
          <HorizontalBarList
            title="ช่องทางการชำระเงิน (Payment Methods)"
            subtitle="เปรียบเทียบจำนวนรายการชำระเงิน (Transactions) สัดส่วน และยอดเงินรวมของแต่ละช่องทาง"
            items={payments}
            totalCount={paymentTotalCount}
            totalAmount={paymentTotalAmount}
            unit="รายการชำระ"
            footerNote={`* อ้างอิงตามรายการธุรกรรมชำระเงินจริง (Transaction) รองรับการแยกจ่ายรายเมนู (${paymentTotalCount} รายการชำระ จาก ${diningTotalCount} ออเดอร์สำเร็จ)`}
            emptyMessage="ยังไม่มีข้อมูลการชำระเงินในช่วงเวลานี้"
          />

          {/* Dining Type */}
          <HorizontalBarList
            title="ประเภทการรับอาหาร (Dining Type)"
            subtitle="สัดส่วนลูกค้ารับประทานที่ร้าน vs สั่งกลับบ้าน (เฉพาะออเดอร์สำเร็จ)"
            items={dining}
            totalCount={diningTotalCount}
            unit="ออเดอร์"
            emptyMessage="ยังไม่มีข้อมูลประเภทการรับอาหารในช่วงเวลานี้"
          />
        </div>
      </div>
    </section>
  );
}
