// Local HTTP + Phoenix fixtures only; database authorization is tested with PGlite.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, createWriteStream, cpSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startMock } from './helpers/dashboard-mock.mjs';
mkdirSync('.test-artifacts/customer-cart', { recursive: true });
const log = createWriteStream('.test-artifacts/customer-cart/browser.log');
const mock = await startMock();
const appDir = resolve(`.test-artifacts/customer-cart/app-${Date.now()}`);
mkdirSync(appDir, { recursive: true });
for (const file of ['src','public','package.json','package-lock.json','tsconfig.json','next-env.d.ts','next.config.ts','postcss.config.mjs']) cpSync(file, resolve(appDir,file), { recursive:true });
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4401', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-fixture-key', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-service-key', NEXT_TELEMETRY_DISABLED: '1' };
const app = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '-p', '4400'], { cwd:appDir, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
app.stdout.pipe(log); app.stderr.pipe(log);
let browser;
try {
  for (let i=0; i<120; i++) {
    assert.equal(app.exitCode, null);
    try { if ((await fetch('http://localhost:4400/login')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => ['localhost','127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());

  mock.state.catalog.menu_stock_availability = [{ menu_id: 1, can_order: true }];
  mock.state.catalog.restaurant_table_aliases = [{ table_id: 1, table_number: '1' }];
  const oldToken = '00000000-0000-4000-8000-000000000055';
  mock.state.catalog.dining_sessions = [{ id: 1, table_id: 1, status: 'closed', access_token: oldToken }];
  mock.state.catalog.orders = [];
  const submitted = [];
  let failSubmit = false;
  let failSession = false;
  let rejectClosedOnce = false;
  const closedTokens = new Set([oldToken]);
  await context.route('**/api/customer-orders', async route => {
    if (failSession) return route.fulfill({ status: 503, json: { error: 'TEST unavailable' } });
    await route.continue();
  });
  await context.route('**/api/orders', async route => {
    submitted.push(route.request().postDataJSON());
    if (rejectClosedOnce) {
      rejectClosedOnce = false;
      closedTokens.add(submitted.at(-1).sessionToken);
      return route.fulfill({ status: 409, json: { error: 'TEST round closed' } });
    }
    await route.fulfill({ status: failSubmit ? 503 : 200, json: failSubmit ? { error: 'TEST unavailable' } : { order: { id: 1, order_number: 'TEST 1' } } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  await page.goto('http://localhost:4400/login');
  await page.locator('input[type=email]').fill('admin@example.invalid');
  await page.locator('input[type=password]').fill('local-test-password');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  await page.goto('http://localhost:4400/dashboard/tables');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'เปิดหน้าสั่งอาหาร' }).click();
  const customer = await popupPromise; customer.setDefaultTimeout(20000);
  await customer.waitForURL('**/table/id-1');
  await customer.evaluate(token => localStorage.setItem('smart-order-session-id-1', token), oldToken);
  await customer.reload();
  const preview = customer.getByRole('complementary', { name: 'รายการในตะกร้า' });
  const add = async () => {
    await customer.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
    await customer.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  };
  await add();
  await assert.doesNotReject(preview.getByText('TEST menu', { exact: true }).waitFor());
  await preview.getByRole('button', { name: 'เพิ่มจำนวน TEST menu' }).click();
  assert.match(await preview.innerText(), /100 บาท/);
  await preview.getByRole('button', { name: 'ลดจำนวน TEST menu' }).click();
  assert.match(await preview.innerText(), /50 บาท/);
  await preview.getByRole('button', { name: 'แก้ไข', exact: true }).click();
  await customer.getByRole('button', { name: /บันทึกการแก้ไข/ }).click();
  await customer.getByRole('button', { name: 'ปิดตะกร้าอาหาร', exact: true }).click();
  await customer.screenshot({ path: '.test-artifacts/customer-cart/desktop.png', fullPage: true });
  await preview.getByRole('button', { name: 'ตรวจรายการและสั่งอาหาร' }).click();
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.waitForURL('**/orders');
  assert.equal(submitted.length, 1);
  assert.notEqual(submitted[0].sessionToken, oldToken);
  assert.equal(submitted[0].items[0].quantity, 1);
  console.log('PASS Admin order link, closed round renewed, cart preserved, desktop controls');

  const activeToken = '00000000-0000-4000-8000-000000000066';
  mock.state.catalog.dining_sessions = [{ id: 2, table_id: 1, status: 'active', access_token: activeToken }];
  mock.state.catalog.orders = [{ id: 2, status: 'confirmed', created_at: new Date().toISOString(), order_items: [], total_amount: 50 }];
  await customer.goto('http://localhost:4400/table/id-1');
  await customer.evaluate(token => localStorage.setItem('smart-order-session-id-1', token), activeToken);
  await customer.setViewportSize({ width: 390, height: 844 });
  await add();
  assert.match(await preview.innerText(), /TEST menu/);
  await preview.getByRole('button', { name: 'ลบ TEST menu' }).click();
  assert.match(await preview.innerText(), /เลือกอาหาร/);
  await add();
  await customer.screenshot({ path: '.test-artifacts/customer-cart/mobile.png', fullPage: true });
  assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await customer.getByRole('button', { name: 'ดูตะกร้า', exact: true }).click();
  failSession = true;
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.getByText('ตรวจสอบรอบโต๊ะไม่สำเร็จ กรุณาลองใหม่').first().waitFor();
  assert.equal(submitted.length, 1);
  assert.equal(await customer.evaluate(() => localStorage.getItem('smart-order-session-id-1')), activeToken);
  assert.match(await preview.innerText(), /TEST menu/);
  failSession = false; failSubmit = true;
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.getByText('TEST unavailable').first().waitFor();
  assert.equal(submitted.length, 2);
  assert.equal(submitted[1].sessionToken, activeToken);
  // Another tab renewed its round while the first request's result was unknown.
  await customer.evaluate(token => localStorage.setItem('smart-order-session-id-1', token), oldToken);
  failSubmit = false;
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.waitForURL('**/orders');
  assert.equal(submitted.length, 3);
  assert.equal(submitted[2].requestId, submitted[1].requestId);
  assert.equal(submitted[2].sessionToken, activeToken);
  console.log('PASS mobile cart, active round retained, failed lookup preserves cart/token, retry retains request ID');

  await context.unroute('**/api/customer-orders');
  await context.route('**/api/customer-orders', route => {
    const { sessionToken } = route.request().postDataJSON();
    return route.fulfill({ json: { session: closedTokens.has(sessionToken) ? { status: 'closed' } : null, orders: [] } });
  });
  const setStorage = async (key, token) => {
    await customer.evaluate(({ key, token }) => {
      localStorage.removeItem('smart-order-session-id-1');
      localStorage.removeItem('smart-order-session-1');
      if (key) localStorage.setItem(key, token);
    }, { key, token });
  };
  for (const key of [null, 'smart-order-session-1']) {
    await customer.goto('http://localhost:4400/table/1');
    await setStorage(key, oldToken);
    await add();
    await customer.getByRole('button', { name: 'ดูตะกร้า', exact: true }).click();
    await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
    await customer.waitForURL('**/orders');
    assert.notEqual(submitted.at(-1).sessionToken, oldToken);
    assert.match(submitted.at(-1).sessionToken, /^[0-9a-f-]{36}$/);
    if (key) assert.equal(await customer.evaluate(key => localStorage.getItem(key), key), null);
  }
  console.log('PASS missing token and closed legacy token');

  await customer.goto('http://localhost:4400/table/id-1');
  await setStorage('smart-order-session-id-1', oldToken);
  await add();
  await customer.getByRole('button', { name: 'ดูตะกร้า', exact: true }).click();
  const other = await context.newPage();
  await other.goto('http://localhost:4400/table/id-1');
  await other.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
  await other.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  await other.getByRole('button', { name: 'ตรวจรายการและสั่งอาหาร', exact: true }).click();
  await Promise.all([
    customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click(),
    other.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click(),
  ]);
  await Promise.all([customer.waitForURL('**/orders'), other.waitForURL('**/orders')]);
  assert.equal(submitted.at(-1).sessionToken, submitted.at(-2).sessionToken);
  assert.notEqual(submitted.at(-1).sessionToken, oldToken);
  await other.close();
  console.log('PASS concurrent tabs renew a closed round once');
  await customer.goto('http://localhost:4400/table/id-1');
  await setStorage('smart-order-session-id-1', activeToken);
  await add();
  await customer.getByRole('button', { name: 'ดูตะกร้า', exact: true }).click();
  rejectClosedOnce = true;
  const beforeRace = submitted.length;
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.getByText('TEST round closed').first().waitFor();
  assert.equal(submitted.length, beforeRace + 1, 'no automatic resubmission');
  assert.match(await preview.innerText(), /TEST menu/);
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.waitForURL('**/orders');
  assert.notEqual(submitted.at(-1).sessionToken, activeToken);
  assert.notEqual(submitted.at(-1).requestId, submitted.at(-2).requestId);
  console.log('PASS round closes between lookup and submit: cart retained and explicit retry renews round');

  mock.state.catalog.menus = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, name: `TEST menu ${i + 1} with a long readable name`, price: 50, category_id: 1 }));
  mock.state.catalog.menu_stock_availability = mock.state.catalog.menus.map(menu => ({ menu_id: menu.id, can_order: true }));
  await customer.goto('http://localhost:4400/table/id-1');
  for (let i = 0; i < 5; i++) {
    await customer.getByRole('button', { name: 'เพิ่ม', exact: true }).nth(i).click();
    await customer.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  }
  assert.equal(await preview.locator('li').count(), 5);
  assert.match(await preview.innerText(), /250 บาท/);
  assert.equal(await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await customer.screenshot({ path: '.test-artifacts/customer-cart/mobile-multiple.png', fullPage: true });
  await customer.setViewportSize({ width: 1440, height: 1000 });
  await customer.screenshot({ path: '.test-artifacts/customer-cart/desktop-multiple.png', fullPage: true });
  console.log('PASS multiple long menu names, item controls and mobile/desktop layout');
  mock.state.catalog.menu_option_groups = [
    { id: 1, menu_id: 1, name: 'TEST meat', selection_type: 'single', is_required: true, min_select: 1, max_select: 1, max_total_quantity: 1, is_active: true },
    { id: 2, menu_id: 1, name: 'TEST toppings', selection_type: 'multiple', is_required: false, min_select: 0, max_select: 1, max_total_quantity: 2, is_active: true },
  ];
  mock.state.catalog.effective_menu_options = [
    { id: 1, menu_id: 1, group_id: 1, name: 'TEST chicken', additional_price: 0, max_quantity: 1, is_available: true },
    { id: 2, menu_id: 1, group_id: 1, name: 'TEST beef', additional_price: 10, max_quantity: 1, is_available: true },
    { id: 3, menu_id: 1, group_id: 2, name: 'TEST egg', additional_price: 5, max_quantity: 2, is_available: true },
  ];
  mock.state.catalog.effective_menu_option_ingredients = [1, 2, 3].map(id => ({ menu_option_id: id, ingredient_id: 1, quantity_required: 1 }));
  await customer.reload();
  await customer.getByRole('button', { name: 'เพิ่ม', exact: true }).first().click();
  await customer.getByRole('radio', { name: /TEST chicken/ }).check();
  await customer.getByRole('checkbox', { name: /TEST egg/ }).check();
  await customer.getByRole('button', { name: /เพิ่มลงตะกร้า/ }).click();
  assert.match(await preview.innerText(), /TEST chicken × 1 · TEST egg × 1/);
  assert.match(await preview.innerText(), /55 บาท/);
  await preview.getByRole('button', { name: 'ตรวจรายการและสั่งอาหาร' }).click();
  await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร' }).click();
  await customer.waitForURL('**/orders');
  assert.deepEqual(submitted.at(-1).items[0].optionSelections, [{ optionId: 1, quantity: 1 }, { optionId: 3, quantity: 1 }]);
  console.log('PASS grouped meat/topping options: preview, total and submitted selections');
} finally {
 await browser?.close(); app.kill(); await mock.close(); log.end();
}
