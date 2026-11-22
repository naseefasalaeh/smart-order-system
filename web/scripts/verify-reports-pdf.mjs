import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

process.loadEnvFile(".env.local");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const outDir = ".test-artifacts/pdf-export-verification";
mkdirSync(outDir, { recursive: true });

const testEmail = `test_admin_pdf_${Date.now()}@example.invalid`;
const testPassword = `TestPass_${Date.now()}!Aa1`;

console.log("1. Creating temporary test admin user...");
const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
  email: testEmail,
  password: testPassword,
  email_confirm: true,
  user_metadata: { full_name: "PDF Verifier Admin" },
});
if (authErr) throw authErr;

const userId = authUser.user.id;
const { error: profileErr } = await supabase
  .from("profiles")
  .update({ role: "admin", is_active: true, full_name: "PDF Verifier Admin" })
  .eq("id", userId);
if (profileErr) throw profileErr;

console.log("2. Launching browser with Playwright (msedge)...");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

try {
  console.log("3. Logging in at http://localhost:3000/login...");
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.getByLabel("อีเมล", { exact: true }).fill(testEmail);
  await page.getByLabel("รหัสผ่าน", { exact: true }).fill(testPassword);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL("**/dashboard**", { timeout: 15000 });

  // -------------------------------------------------------------
  // TEST SUITE A: Last 30 Days Preset (20 Completed Orders, 21 Payments, 3 Peak Hours)
  // -------------------------------------------------------------
  console.log("\n4. Navigating to Reports page and clicking '30 วันล่าสุด' preset...");
  await page.goto("http://localhost:3000/dashboard/reports", {
    waitUntil: "networkidle",
    timeout: 20000,
  });
  await page.getByRole("button", { name: "30 วันล่าสุด", exact: true }).click();
  await page.waitForURL("**/dashboard/reports?type=custom**", { timeout: 15000 });
  await page.waitForLoadState("networkidle");

  const body30d = await page.innerText("body");
  console.log("5. Verifying Business Metrics for Last 30 Days:");
  
  assert.ok(body30d.includes("฿1,480"), "Must show Total Sales ฿1,480");
  console.log("  ✔ Total Sales = ฿1,480");

  assert.ok(body30d.includes("20 รายการ") && body30d.includes("ออเดอร์ที่สำเร็จ"), "Must show Completed Orders = 20");
  console.log("  ✔ Completed Orders = 20");

  // Payment Methods verification
  assert.ok(body30d.includes("21 รายการชำระ"), "Must show 21 รายการชำระ for Payment Methods");
  assert.ok(body30d.includes("17 รายการชำระ"), "Must show 17 รายการชำระ for Cash");
  assert.ok(body30d.includes("4 รายการชำระ"), "Must show 4 รายการชำระ for QR Code");
  assert.ok(body30d.includes("Transactions"), "Must mention Transactions in subtitle");
  assert.ok(body30d.includes("21 รายการชำระ จาก 20 ออเดอร์สำเร็จ"), "Must explain 21 payment records from 20 completed orders");
  console.log("  ✔ Payment Methods shows 21 รายการชำระ (Cash 17, QR 4) with clear transaction explanation");

  // Peak Hours verification (Tied Peak Hours: 10:00, 14:00, 15:00)
  assert.ok(body30d.includes("3 ช่วงพีคเท่ากัน"), "Must note 3 tied peak hours");
  assert.ok(body30d.includes("10:00–11:00") && body30d.includes("14:00–15:00") && body30d.includes("15:00–16:00"), "Must show all 3 tied hours in summary");
  assert.ok(body30d.includes("ช่วงละ 3 ออเดอร์"), "Must show ช่วงละ 3 ออเดอร์");
  assert.ok(body30d.includes("฿640"), "Must show total peak sales ฿640");
  console.log("  ✔ Peak Ordering Hours correctly identifies all 3 tied peak hours (10:00, 14:00, 15:00) in summary and graph");

  // Emulate print media and generate PDF
  await page.emulateMedia({ media: "print" });
  const pdf30dPath = `${outDir}/reports-last-30-days.pdf`;
  const pdf30dBuffer = await page.pdf({
    path: pdf30dPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "8mm",
      right: "10mm",
      bottom: "8mm",
      left: "10mm",
    },
  });

  const matches30d = pdf30dBuffer.toString("binary").match(/\/Type\s*\/Page\b/g);
  const pageCount30d = matches30d ? matches30d.length : 0;
  console.log(`6. Generated Last 30 Days PDF Export: ${pdf30dPath}`);
  console.log(`   --> Exact PDF Page Count: ${pageCount30d} pages`);
  assert.equal(pageCount30d, 4, `Target is exactly 4 pages, but got ${pageCount30d} pages`);
  console.log("  ✔ SUCCESS: Last 30 Days PDF has exactly 4 pages!");

  // Capture section screenshots in print mode
  await page.locator("#report-summary-cards").screenshot({ path: `${outDir}/summary-cards.png` });
  await page.locator("#report-page-2").screenshot({ path: `${outDir}/page-2-ordering-payments.png` });
  await page.locator("#report-page-3").screenshot({ path: `${outDir}/page-3-product-performance.png` });
  await page.locator("#report-page-4").screenshot({ path: `${outDir}/page-4-demographics.png` });
  await page.screenshot({ path: `${outDir}/full-report-print-30d.png`, fullPage: true });
  console.log("7. Captured section and full print screenshots!");

  // -------------------------------------------------------------
  // TEST SUITE B: October 2026 (14 Completed, 9 Cancelled, Single Peak Hour 14:00)
  // -------------------------------------------------------------
  console.log("\n8. Navigating to Reports page for October 2026...");
  await page.emulateMedia({ media: "screen" });
  await page.goto("http://localhost:3000/dashboard/reports?type=monthly&month=2026-10", {
    waitUntil: "networkidle",
    timeout: 20000,
  });

  const bodyOct = await page.innerText("body");
  assert.ok(bodyOct.includes("฿1,000"), "Oct: Total Sales ฿1,000");
  assert.ok(bodyOct.includes("14 รายการ") && bodyOct.includes("ออเดอร์ที่สำเร็จ"), "Oct: Completed Orders = 14");
  assert.ok(bodyOct.includes("9 รายการ") && bodyOct.includes("ออเดอร์ที่ยกเลิก"), "Oct: Cancelled Orders = 9");
  assert.ok(bodyOct.includes("39.1%"), "Oct: Cancellation Rate = 39.1%");
  assert.ok(bodyOct.includes("14:00 – 15:00 น.") && bodyOct.includes("3 ออเดอร์") && bodyOct.includes("฿205"), "Oct: Peak Hour = 14:00–15:00, 3 orders, ฿205");
  console.log("  ✔ October 2026 metrics verified!");

  await page.emulateMedia({ media: "print" });
  const pdfOctPath = `${outDir}/reports-october-2026.pdf`;
  const pdfOctBuffer = await page.pdf({
    path: pdfOctPath,
    format: "A4",
    printBackground: true,
    margin: {
      top: "8mm",
      right: "10mm",
      bottom: "8mm",
      left: "10mm",
    },
  });

  const matchesOct = pdfOctBuffer.toString("binary").match(/\/Type\s*\/Page\b/g);
  const pageCountOct = matchesOct ? matchesOct.length : 0;
  console.log(`9. Generated October 2026 PDF Export: ${pdfOctPath}`);
  console.log(`   --> Exact PDF Page Count: ${pageCountOct} pages`);
  assert.equal(pageCountOct, 4, `Target is exactly 4 pages, but got ${pageCountOct} pages`);
  console.log("  ✔ SUCCESS: October 2026 PDF has exactly 4 pages!");

} finally {
  await browser.close();
  console.log("\n10. Cleaning up temporary test admin user...");
  await supabase.auth.admin.deleteUser(userId);
  console.log("All verifications completed.");
}
