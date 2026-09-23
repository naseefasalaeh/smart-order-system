import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// Browser-only Phoenix fixture. It never opens a connection to a real Realtime server.
export async function checkLiveDashboard({ context, page, mock, results, mode }) {
  const channels = new Set();
  await context.routeWebSocket('**/realtime/v1/websocket**', socket => {
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw));
      const [joinRef, ref, topic, event, payload] = message;
      if (event === 'phx_join') {
        const binding = { socket, topic, joinRef };
        channels.add(binding);
        socket.onClose(() => channels.delete(binding));
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', {
          status: 'ok', response: { postgres_changes: (payload.config.postgres_changes || []).map((filter, id) => ({ ...filter, id: id + 1 })) },
        }]));
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        socket.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
        if (event === 'phx_leave') for (const binding of channels) if (binding.socket === socket && binding.topic === topic) channels.delete(binding);
      }
    });
  });
  const emit = () => {
    mock.state.updatedAt = new Date().toISOString();
    for (const { socket, topic, joinRef } of channels) socket.send(JSON.stringify([joinRef, null, topic, 'postgres_changes', {
      ids: [1], data: { schema: 'public', table: 'orders', type: 'UPDATE', columns: [], record: {}, old_record: {}, commit_timestamp: mock.state.updatedAt, errors: null },
    }]));
  };
  async function until(predicate, label) {
    for (let i = 0; i < 100; i++) {
      if (await predicate()) return;
      await page.waitForTimeout(100);
    }
    assert.fail(label);
  }
  async function goto(path) {
    await page.goto(`http://localhost:4400${path}`);
    await page.waitForTimeout(800);
  }

  // A failed initial order query is retryable on every live view, without a 404.
  for (const route of ['kitchen', 'orders', 'ready']) {
    mock.state.queryError = 'orders';
    await goto(`/dashboard/${route}`);
    await page.getByRole('alert').filter({ hasText: /โหลด/ }).first().waitFor();
    assert.doesNotMatch(await page.locator('body').innerText(), /This page could not be found/);
    mock.state.queryError = '';
    await page.getByRole('button', { name: 'ลองใหม่', exact: true }).first().click();
    await until(async () => await page.getByRole('button', { name: 'ลองใหม่', exact: true }).count() === 0, `${route}: query retry recovers`);
  }
  results.checks.push('kitchen/orders/ready: initial query 503 has manual retry and recovers without navigation');

  // Roles use direct navigations so a previous user's Router Cache cannot mask a guard.
  for (const role of ['admin', 'staff', 'kitchen_staff']) {
    mock.state.role = role;
    for (const [route, allowed] of [
      ['/dashboard', ['admin', 'staff']], ['/dashboard/orders', ['admin', 'staff']],
      ['/dashboard/ready', ['admin', 'staff']], ['/dashboard/kitchen', ['admin', 'kitchen_staff']],
      ['/dashboard/users', ['admin']], ['/dashboard/menus', ['admin']],
      ['/dashboard/ingredients', ['admin']], ['/dashboard/tables', ['admin']],
      ['/dashboard/addons', ['admin']], ['/dashboard/reports', ['admin']],
    ]) {
      await goto(route);
      assert.equal(new URL(page.url()).pathname, allowed.includes(role) ? route : '/access-denied', `${role} ${route}`);
      assert.doesNotMatch(await page.locator('body').innerText(), /This page could not be found|โหลดข้อมูลไม่สำเร็จชั่วคราว/);
    }
    results.checks.push(`${role}: all 10 dashboard routes enforce access`);
    if (role !== 'admin') {
      const forbidden = await page.evaluate(async () => {
        const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_password', id: '00000000-0000-4000-8000-000000000092', password: 'test-password-only', confirmPassword: 'test-password-only' }) });
        return response.status;
      });
      assert.equal(forbidden, 403);
    }
  }
  mock.state.role = 'staff'; mock.state.status = 'confirmed';
  await goto('/dashboard/orders');
  assert.equal(await page.getByRole('button', { name: 'เริ่มทำอาหาร', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).waitFor();
  mock.state.status = 'served'; emit();
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).waitFor();
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await page.getByRole('button', { name: 'เงินสด', exact: true }).click();
  await page.locator('article').waitFor({ state: 'hidden' });
  results.checks.push('staff: no kitchen controls; realtime payment succeeds; admin API denied');

  mock.state.status = 'confirmed';
  await goto('/dashboard/orders');
  mock.state.failWrite = true;
  await page.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).click();
  await page.getByText('ยกเลิกออเดอร์ไม่สำเร็จชั่วคราว กรุณาตรวจสถานะก่อนลองใหม่', { exact: false }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).isEnabled());
  assert.equal(mock.state.status, 'confirmed');
  mock.state.failWrite = false;
  await page.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).click();
  await page.locator('article').waitFor({ state: 'hidden' });
  assert.equal(mock.state.status, 'cancelled');
  results.checks.push('cancel API: transient RPC failure is Thai retryable error, button unlocks, retry succeeds');

  mock.state.role = 'kitchen_staff'; mock.state.status = 'confirmed';
  await goto('/dashboard/kitchen');
  await page.getByRole('button', { name: 'เริ่มทำอาหาร', exact: true }).waitFor();
  mock.state.requests.length = 0;
  // Same-task duplicate clicks exercise the ref lock before React renders disabled.
  await page.getByRole('button', { name: 'เริ่มทำอาหาร', exact: true }).evaluate(button => { button.click(); button.click(); });
  await page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).waitFor();
  assert.equal(mock.state.requests.filter(r => r.path.endsWith('/advance_order_status')).length, 1);
  assert.equal(await page.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).click();
  await page.getByText('อาหารพร้อมเสิร์ฟ รอพนักงาน', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).count(), 0);
  results.checks.push('kitchen_staff: start/ready succeeds, double click = one RPC, no cancel/payment controls');

  mock.state.role = 'admin'; mock.state.status = 'confirmed';
  await goto('/dashboard/orders');
  await until(() => channels.size > 0, 'Realtime joined');
  mock.state.requests.length = 0;
  mock.state.status = 'preparing'; emit(); emit(); emit();
  await page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).waitFor();
  await page.waitForTimeout(500);
  assert.equal(mock.state.requests.filter(r => r.path === '/rest/v1/orders').length, 1, 'burst coalesces into one order read');
  assert.equal(mock.state.requests.filter(r => r.path === '/auth/v1/user').length, 0);
  results.checks.push('Realtime joined: burst coalesced, UI updated without full-page/auth reload');

  // Hold a real browser response after the server snapshot, then send a newer event.
  let release, captured = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/rest/v1/orders?**', async route => {
    const response = await route.fetch();
    captured = true; await gate; await route.fulfill({ response });
  }, { times: 1 });
  emit(); await until(() => captured, 'in-flight order snapshot captured');
  mock.state.status = 'served'; emit();
  release();
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).waitFor();
  results.checks.push('Realtime arriving during an in-flight snapshot is replayed, newer state wins');

  // A subscribed hosted socket can miss an event: keep the socket open and
  // change the fixture without emit(), so only the lightweight backstop helps.
  mock.state.status = 'confirmed'; mock.state.updatedAt = new Date().toISOString();
  await page.getByRole('button', { name: 'เริ่มทำอาหาร', exact: true }).waitFor({ timeout: 15000 });
  results.checks.push('subscribed socket missing an event: lightweight polling recovers the order');

  mock.state.profileError = true; emit();
  await page.getByRole('alert').filter({ hasText: 'โหลดข้อมูลล่าสุดไม่สำเร็จชั่วคราว' }).waitFor();
  mock.state.profileError = false;
  const normalDelay = mock.state.delay;
  mock.state.delay = 700; // Hold the retry response while asserting transient feedback.
  try {
    await page.getByRole('button', { name: 'ลองใหม่', exact: true }).evaluate(button => button.click());
    await page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).isDisabled());
  } finally { mock.state.delay = normalDelay; }
  await page.getByRole('alert').filter({ hasText: 'โหลดข้อมูลล่าสุดไม่สำเร็จชั่วคราว' }).waitFor({ state: 'hidden' });
  mock.state.role = 'staff'; emit();
  await until(async () => !(await page.getByRole('link', { name: 'จัดการผู้ใช้งาน', exact: true }).count()), 'role controls refreshed');
  mock.state.active = false; emit();
  await page.waitForURL('**/access-denied');
  mock.state.active = true; mock.state.role = 'admin';
  results.checks.push('live profile failure recovers; role change and inactive account enforced');

  mock.state.status = 'ready';
  await goto('/dashboard/ready');
  await page.locator('article').waitFor();
  // Socket closes; polling must recover the missed change without a browser reload.
  for (const { socket } of channels) socket.close({ code: 1011, reason: 'fixture disconnect' });
  channels.clear();
  mock.state.status = 'completed'; mock.state.updatedAt = new Date().toISOString();
  await page.locator('article').waitFor({ state: 'hidden', timeout: 20000 });
  results.checks.push('socket disconnect: polling recovers missed order event');

  await goto('/dashboard/tables');
  const tableButton = page.locator('article form button[type=submit]').first();
  mock.state.failWrite = true;
  await tableButton.click();
  await page.getByRole('status').filter({ hasText: 'บันทึกโต๊ะไม่สำเร็จ กรุณาลองใหม่' }).waitFor();
  await until(() => tableButton.isEnabled(), 'table form unlocks after failure');
  mock.state.failWrite = false; mock.state.requests.length = 0;
  const oldLabel = await tableButton.innerText();
  await tableButton.evaluate(button => { button.click(); button.click(); });
  await until(async () => (await tableButton.innerText()) !== oldLabel && await tableButton.isEnabled(), 'table retry updates UI');
  assert.equal(mock.state.requests.filter(r => r.path.endsWith('/manage_restaurant_table')).length, 1);
  results.checks.push('Server Action form: failure unlocks, retry works, double submit = one transaction');

  await goto('/dashboard/menus');
  mock.state.requests.length = 0;
  await page.getByRole('button', { name: 'ปิดขาย', exact: true }).evaluate(button => { button.click(); button.click(); });
  assert.ok(await page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).first().isDisabled());
  await page.getByRole('button', { name: 'เปิดขาย', exact: true }).waitFor();
  assert.equal(mock.state.requests.filter(r => r.path === '/rest/v1/menus' && r.method === 'PATCH').length, 1);
  results.checks.push('menu availability: immediate pending, one write, refreshed through Server Action');

  await goto('/dashboard/addons');
  await page.getByText('+ เพิ่มตัวเลือกเสริม', { exact: true }).click();
  // Identify the form by a stable field: its submit label changes while pending.
  const addonForm = page.locator('form').filter({ has: page.locator('input[name="max_quantity"]') });
  await addonForm.locator('[name=category]').selectOption('topping');
  await addonForm.locator('[name=name]').fill('TEST isolated addon');
  await addonForm.locator('[name=is_available]').uncheck();
  // Hold the response while observing pending; Playwright click can wait for
  // Server Action navigation until the transient pending state has finished.
  mock.state.delay = 700;
  try {
    await addonForm.getByRole('button', { name: 'บันทึกตัวเลือกเสริม', exact: true }).evaluate(button => { button.click(); button.click(); });
    await addonForm.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).waitFor();
    assert.ok(await addonForm.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).isDisabled());
  } finally { mock.state.delay = normalDelay; }
  await page.getByText('บันทึกตัวเลือกเสริมกลางแล้ว', { exact: true }).waitFor();
  results.checks.push('addon save: pending and successful Server Action result');

  if (mode === 'dev') {
    mock.state.status = 'confirmed';
    await goto('/dashboard/kitchen');
    const path = 'src/app/dashboard/kitchen/page.tsx';
    const original = readFileSync(path, 'utf8');
    const marker = '\n// Isolated dashboard HMR regression check.\n';
    const refreshes = [];
    const listener = message => { if (/Fast Refresh/.test(message.text())) refreshes.push(message.text()); };
    page.on('console', listener);
    try {
      writeFileSync(path, original + marker);
      await until(() => refreshes.length > 0, 'dev Fast Refresh observed');
      await page.getByRole('heading', { name: 'คิวครัว', exact: true }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'คิวครัว', exact: true }).waitFor();
      results.checks.push('dev source edit triggers Fast Refresh; kitchen survives HMR and reload');
    } finally {
      page.off('console', listener);
      const current = readFileSync(path, 'utf8');
      if (current === original + marker) writeFileSync(path, original);
    }
  }
  mock.state.role = 'admin'; mock.state.status = 'confirmed';
}
