import assert from 'node:assert/strict';

export async function checkOrderWorkload({ page, mock, emit, dir }) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('smart-order-ready-plates-seen:')) sessionStorage.removeItem(key);
  });
  mock.state.role = 'staff';
  const order = (number, status, dining_type = 'dine_in') => ({
    id: `00000000-0000-4000-8000-${String(number).padStart(12,'0')}`, order_number: number,
    status, dining_type, created_at: '2026-10-25T01:00:00Z', updated_at: '2026-10-25T01:01:00Z',
    served_at: status === 'served' ? '2026-10-25T01:02:00Z' : null,
    total_amount: 50, restaurant_tables: { table_number: String(number) }, order_items: [{ id: number, quantity: 1, menu_name_snapshot: "TEST dish", completed_plates: ["ready","served","completed"].includes(status) ? [1] : [], served_plates: ["served","completed"].includes(status) ? [1] : [], order_item_options: [] }],
  });
  const confirmed = order(31,'confirmed'), preparing = order(32,'preparing'), ready = order(33,'ready');
  const served = order(34,'served'), paid = order(35,'served');
  mock.state.catalog.orders = [confirmed, preparing, ready, served, paid, ready, order(36,'completed'), order(37,'cancelled')];
  mock.state.catalog.payments = [{ order_id: paid.id, status: 'paid' }, { order_id: served.id, status: 'failed' }];
  await page.goto('http://localhost:4400/dashboard/payments');
  const nav = page.getByRole('navigation', { name: 'เมนูแดชบอร์ด' });
  const badge = name => nav.getByRole('link', { name, exact: true }).locator('span').last();
  await badge('ออเดอร์').filter({ hasText: /^4$/ }).waitFor();
  assert.equal(await badge('พร้อมเสิร์ฟ').innerText(), '1 จาน');
  assert.equal(await badge('รอชำระเงิน').innerText(), '1');
  assert.equal(await page.locator('nav[aria-label="กรองสถานะออเดอร์"]').count(), 0);
  await page.goto('http://localhost:4400/dashboard/orders?status=served');
  const tabs = page.getByRole('navigation', { name: 'กรองสถานะออเดอร์' });
  await tabs.locator('a[href$="status=confirmed"] span').filter({ hasText: /^1$/ }).waitFor();
  assert.equal(await tabs.locator('a[href$="status=preparing"] span').innerText(), '1');
  assert.equal(await page.locator('aside [aria-label="สถานะงานครัว"]').count(), 0);
  assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'), '/dashboard/orders');
  assert.equal(await page.locator('article').count(), 1, 'orders filter excludes already-paid bills just like payments page');
  const rights = await nav.locator('span[id]').evaluateAll(badges => badges.map(badge => badge.getBoundingClientRect().right));
  assert.ok(rights.every(right => Math.abs(right - rights[0]) < 1), 'desktop badges align right');
  assert.equal(await page.getByRole('status').filter({ hasText: 'พร้อมเสิร์ฟแล้ว' }).count(), 0, 'initial ready orders do not alert');
  preparing.status = 'ready'; preparing.order_items[0].completed_plates = [1]; emit();
  const toast = page.getByRole('status').filter({ hasText: /โต๊ะ 32.*TEST dish 1 จาน/ });
  await toast.waitFor();
  assert.equal(await tabs.locator('a[href$="status=preparing"] span').innerText(), '0', 'status tabs share updated sidebar snapshot');
  assert.equal(await tabs.locator('a[href$="status=ready"] span').innerText(), '2');
  assert.equal(await badge('พร้อมเสิร์ฟ').innerText(), '2 จาน');
  assert.equal(await badge('รอชำระเงิน').innerText(), '1');
  await page.setViewportSize({ width: 375, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: `${dir}/workload-mobile-toast.png`, fullPage: true });
  await toast.waitFor({ state: 'hidden', timeout: 10000 });
  emit(); await page.waitForTimeout(1200);
  assert.equal(await toast.count(), 0, 'repeated realtime events do not repeat notification');
  mock.state.catalog.orders = [...new Map(mock.state.catalog.orders.map(order => [order.id, order])).values()];
  await nav.getByRole('link', { name: 'พร้อมเสิร์ฟ', exact: true }).click();
  await page.getByRole('heading', { name: 'พร้อมเสิร์ฟ', exact: true }).waitFor();
  await badge('พร้อมเสิร์ฟ').filter({ hasText: /^2 จาน$/ }).waitFor();
  assert.equal(await page.getByRole('status').filter({ hasText: 'พร้อมเสิร์ฟแล้ว' }).count(), 0, 'navigation deduplicates alerts');
  // Polling must catch transitions even when no websocket event arrives.
  confirmed.status = 'ready'; confirmed.order_items[0].completed_plates = [1]; confirmed.dining_type = 'takeaway';
  const takeawayNotice = page.getByRole('status').filter({ hasText: /#31.*TEST dish 1 จาน/ });
  await takeawayNotice.waitFor({ timeout: 12000 });
  await takeawayNotice.getByRole('link').click();
  await page.getByRole('heading', { name: 'พร้อมเสิร์ฟ', exact: true }).waitFor();
  await badge('พร้อมเสิร์ฟ').filter({ hasText: /^3 จาน$/ }).waitFor();
  assert.equal(await takeawayNotice.count(), 0, 'clicking notification opens ready view without repeating it');
  served.status = 'completed'; emit();
  await nav.locator('a[href="/dashboard/payments"] span[id]').waitFor({ state: 'hidden' });
  mock.state.queryError = 'payments';
  mock.state.catalog.orders.push(order(38,'served')); emit();
  await page.getByText('อัปเดตจำนวนงานไม่สำเร็จ กำลังลองใหม่', { exact: true }).waitFor();
  assert.equal(await nav.locator('[aria-describedby]').count(), 0, 'read failure hides unverified counts');
  mock.state.queryError = ''; emit();
  await badge('รอชำระเงิน').filter({ hasText: /^1$/ }).waitFor();
  mock.state.role = 'kitchen_staff';
  await page.goto('http://localhost:4400/dashboard/kitchen');
  await page.getByRole('heading', { name: 'คิวครัว', exact: true }).waitFor();
  await page.waitForTimeout(1000);
  assert.equal(await nav.locator('span[id]').count(), 0, 'zero badges hidden');
  assert.equal(await nav.getByRole('link').count(), 1, 'kitchen keeps its original menu permissions');
  assert.equal(await page.getByRole('status').filter({ hasText: 'พร้อมเสิร์ฟแล้ว' }).count(), 0);
  delete mock.state.catalog.orders; delete mock.state.catalog.payments;
  console.log('PASS: workload counts, paid/duplicate exclusion, realtime, polling, toast deduplication, mobile layout, error recovery and kitchen isolation');
}
