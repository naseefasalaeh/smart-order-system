import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const bangkokExports = {};
vm.runInNewContext(
  ts.transpileModule(readFileSync("src/lib/bangkok-date.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  { exports: bangkokExports, Date, Intl }
);

test("1. All 5 report period types resolve exact Bangkok timezone boundaries", () => {
  // Daily: 2026-11-07
  const daily = bangkokExports.bangkokDayRange("2026-11-07");
  assert.deepEqual({ ...daily }, {
    start: "2026-11-06T17:00:00.000Z",
    end: "2026-11-07T17:00:00.000Z",
  });

  // Weekly: 2026-11-07 (Saturday) -> Week is Mon 2026-11-02 to Sun 2026-11-08
  const weekly = bangkokExports.bangkokWeekRange("2026-11-07");
  assert.equal(weekly.startDay, "2026-11-02");
  assert.equal(weekly.endDay, "2026-11-08");
  assert.equal(weekly.start, "2026-11-01T17:00:00.000Z");
  assert.equal(weekly.end, "2026-11-08T17:00:00.000Z");

  // Monthly: 2026-11
  const monthly = bangkokExports.bangkokMonthRange("2026-11");
  assert.deepEqual({ ...monthly }, {
    start: "2026-10-31T17:00:00.000Z",
    end: "2026-11-30T17:00:00.000Z",
  });

  // Yearly: 2026
  const yearly = bangkokExports.bangkokYearRange(2026);
  assert.deepEqual({ ...yearly }, {
    start: "2025-12-31T17:00:00.000Z",
    end: "2026-12-31T17:00:00.000Z",
    year: 2026,
  });

  // Custom: 2026-01-01 to 2026-05-31 (151 days in non-leap year 2026)
  const custom = bangkokExports.bangkokCustomRange("2026-01-01", "2026-05-31");
  assert.equal(custom.startDay, "2026-01-01");
  assert.equal(custom.endDay, "2026-05-31");
  assert.equal(custom.dayCount, 151);
  assert.equal(custom.start, "2025-12-31T17:00:00.000Z");
  assert.equal(custom.end, "2026-05-31T17:00:00.000Z");
});

test("2. Custom range prevents start date after end date", () => {
  assert.equal(bangkokExports.bangkokCustomRange("2026-05-31", "2026-01-01"), null);
  assert.equal(bangkokExports.bangkokCustomRange("2026-11-08", "2026-11-07"), null);
});

test("3. Comparison previous periods and Buddhist Era (พ.ศ.) formatting", () => {
  assert.equal(bangkokExports.getPreviousDay("2026-01-01"), "2025-12-31");
  assert.equal(bangkokExports.getPreviousWeekDate("2026-11-07"), "2026-10-31");
  assert.equal(bangkokExports.getPreviousMonth("2026-01"), "2025-12");
  assert.equal(bangkokExports.getPreviousYear(2026), 2025);

  const prevCustom = bangkokExports.getPreviousCustomRange("2026-05-01", "2026-05-10");
  assert.deepEqual({ ...prevCustom }, {
    prevStartDay: "2026-04-21",
    prevEndDay: "2026-04-30",
  });

  // Buddhist year
  assert.equal(bangkokExports.formatThaiYear(2026), "2569");
  assert.equal(bangkokExports.formatThaiYear(2025), "2568");
});

test("4. Reports page and components implement all required features without mock data", () => {
  const pageContent = readFileSync("src/app/dashboard/reports/page.tsx", "utf8");
  const selectorContent = readFileSync("src/components/reports-period-selector.tsx", "utf8");
  const chartsContent = readFileSync("src/components/reports-charts.tsx", "utf8");

  // All 5 report types supported
  for (const type of ["daily", "weekly", "monthly", "yearly", "custom"]) {
    assert.ok(pageContent.includes(`"${type}"`), `page.tsx must support ${type}`);
    assert.ok(selectorContent.includes(`"${type}"`), `selector must support ${type}`);
  }

  // Yearly report splits into 12 months
  assert.ok(pageContent.includes("for (let m = 0; m < 12; m++)"), "Yearly report must split into 12 months");
  assert.ok(pageContent.includes("THAI_MONTH_NAMES"), "Yearly report must use Thai month names");

  // Comparison mode calculations
  assert.ok(pageContent.includes("calcPctChange"), "Must calculate percentage change for comparison");
  assert.ok(pageContent.includes("salesComparison"), "Must compare total sales");
  assert.ok(pageContent.includes("ordersComparison"), "Must compare paid order count");

  // Real database queries used
  assert.ok(pageContent.includes('.from("orders")'), "Must query real orders table");
  assert.ok(pageContent.includes('.from("payments")'), "Must query real payments table");
  assert.ok(pageContent.includes('.rpc("member_menu_statistics"'), "Must query member_menu_statistics RPC");

  // Charts support comparison and empty states
  assert.ok(chartsContent.includes("compareMode"), "Charts must support comparison mode");
  assert.ok(chartsContent.includes("ยังไม่มีข้อมูล"), "Charts must display message when no data");
});

test("5. Reports dashboard supports Sales Bar Chart, Peak Hours, Cancellation Rate, and Quick Presets", () => {
  const pageContent = readFileSync("src/app/dashboard/reports/page.tsx", "utf8");
  const selectorContent = readFileSync("src/components/reports-period-selector.tsx", "utf8");
  const chartsContent = readFileSync("src/components/reports-charts.tsx", "utf8");

  // 1. Sales Bar Chart & Orders Chart
  assert.ok(chartsContent.includes('chartType === "bar"'), "Must support Bar Chart view for sales");
  assert.ok(chartsContent.includes("setChartType"), "Must support toggling between Bar and Line chart");
  assert.ok(chartsContent.includes("sales-bar-grad"), "Must define gradients for sales bars");
  assert.ok(chartsContent.includes("hoverIndex"), "Must support hover tooltips on chart bars");

  // 2. Peak Ordering Hours (00:00 - 23:59 น.)
  assert.ok(pageContent.includes("peakHourBuckets"), "Must compute 24-hour peak order buckets");
  assert.ok(pageContent.includes("maxPeakHour"), "Must identify the peak ordering hour");
  assert.ok(chartsContent.includes("PeakHoursChart"), "Must render PeakHoursChart component");

  // 3. Cancellation Rate & Summary
  assert.ok(pageContent.includes("cancellationRate"), "Must compute cancellation rate percentage");
  assert.ok(pageContent.includes("cancelledCount"), "Must track cancelled orders");

  // 4. Quick Presets & Export Actions
  assert.ok(selectorContent.includes("selectPreset"), "Selector must implement preset selection");
  assert.ok(selectorContent.includes("7 วันล่าสุด"), "Selector must provide 7 วันล่าสุด preset");
  assert.ok(selectorContent.includes("30 วันล่าสุด"), "Selector must provide 30 วันล่าสุด preset");
  assert.ok(selectorContent.includes("เดือนนี้"), "Selector must provide เดือนนี้ preset");
  assert.ok(selectorContent.includes("เดือนก่อน"), "Selector must provide เดือนก่อน preset");
  assert.ok(selectorContent.includes("handleExportCsv"), "Selector must support CSV export");
  assert.ok(selectorContent.includes("\\uFEFF"), "CSV export must include UTF-8 BOM for Thai Excel");
  assert.ok(selectorContent.includes("window.print()"), "Selector must support printing to PDF");
});

test("6. Horizontal bar charts, Data consistency, and A4 PDF Print specifications", () => {
  const pageContent = readFileSync("src/app/dashboard/reports/page.tsx", "utf8");
  const chartsContent = readFileSync("src/components/reports-charts.tsx", "utf8");
  const cssContent = readFileSync("src/app/globals.css", "utf8");

  // 1. Horizontal Bar Charts for Payment Methods and Dining Type
  assert.ok(chartsContent.includes("HorizontalBarList"), "Must export HorizontalBarList component");
  assert.ok(pageContent.includes("paymentHorizontalBars"), "Must define paymentHorizontalBars");
  assert.ok(pageContent.includes("diningHorizontalBars"), "Must define diningHorizontalBars");

  // 2. Best Selling Items Horizontal Bar Chart + Table
  assert.ok(chartsContent.includes("BestSellingSection"), "Must export BestSellingSection component");
  assert.ok(pageContent.includes("<BestSellingSection"), "Must render BestSellingSection in page");

  // 3. Customer Demographics with client-side interactive filters
  assert.ok(chartsContent.includes("DemographicsSection"), "Must export DemographicsSection component");
  assert.ok(pageContent.includes("<DemographicsSection"), "Must render DemographicsSection in page");

  // 4. Data Consistency: Completed Orders & Dining Type
  assert.ok(pageContent.includes("completedDineInCount"), "Must calculate completed dine-in count");
  assert.ok(pageContent.includes("completedTakeawayCount"), "Must calculate completed takeaway count");
  assert.ok(pageContent.includes("dining_type"), "Must select dining_type for completed orders");

  // 5. A4 Print & PDF styles
  assert.ok(cssContent.includes("@page"), "Must define @page rule for PDF/Print");
  assert.ok(cssContent.includes("A4 portrait"), "Must specify A4 portrait");
  assert.ok(cssContent.includes("break-inside: avoid"), "Must prevent breaking cards and charts across pages");
  assert.ok(pageContent.includes("print:block"), "Must render corporate print letterhead");
});

test("7. PDF Export fixes: Total orders consistency, Peak hour revenue, Demographics units, and Balanced A4 layout", () => {
  const pageContent = readFileSync("src/app/dashboard/reports/page.tsx", "utf8");
  const chartsContent = readFileSync("src/components/reports-charts.tsx", "utf8");

  // 1. Order count & cancellation rate consistency (Problem 1)
  assert.ok(
    pageContent.includes('order.status === "completed"') && pageContent.includes('order.status === "cancelled"'),
    "Must partition completed and cancelled orders from the same period orders query"
  );
  assert.ok(
    pageContent.includes("cancellationRate") && pageContent.includes("(primaryData.cancelledCount / primaryData.totalOrdersCount) * 100"),
    "Must calculate cancellation rate strictly against total period orders"
  );

  // 2. Peak ordering hours revenue alignment (Problem 2)
  assert.ok(
    pageContent.includes("peakHourBuckets[h].sales += Number(o.total_amount ?? 0)"),
    "Must calculate peak hour revenue directly from completed orders to prevent ฿0 revenue"
  );

  // 3. Customer Demographics dish units (Problem 3)
  assert.ok(
    chartsContent.includes("จำนวนจานที่สั่ง (Dishes)"),
    "Must explicitly label Demographics column as dishes/items ordered"
  );
  assert.ok(
    chartsContent.includes("completedOrderCount"),
    "DemographicsSection must accept completedOrderCount to provide clear context against orders"
  );

  // 4. Balanced A4 PDF layout (Problem 4)
  assert.ok(
    chartsContent.includes("print:grid-cols-2"),
    "Payment Methods and Dining Type must display side-by-side in print"
  );
  assert.ok(
    pageContent.includes("print-page-break-before"),
    "Must use print-page-break-before to eliminate unbalanced single-item pages in A4 PDF export"
  );
});



