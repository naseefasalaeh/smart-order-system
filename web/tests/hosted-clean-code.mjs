// Explicitly authorized hosted integration test. No migrations or deployment.
// Creates only registered TEST resources; never advances an original order.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { capture, compare } from '../scripts/served-order-baseline.mjs';
import { checkHostedRealtime } from './helpers/hosted-realtime-checks.mjs';

const prefix = `TEST-clean-${randomBytes(5).toString('hex')}`;
const dir = resolve(`.test-artifacts/clean-code-hosted/${prefix}`);
mkdirSync(dir, { recursive: true });
const realtimeOnly = process.argv.includes('--realtime');
const baseline = realtimeOnly ? await capture() : JSON.parse(readFileSync('.test-artifacts/clean-code-before-apply.json', 'utf8'));
if (!realtimeOnly) {
  assert.equal(baseline.tables.reviews.count, 0);
  delete baseline.tables.reviews; // The only deliberately removed data relation.
}
writeFileSync(`${dir}/before.json`, JSON.stringify(baseline, null, 2));
const registry = { prefix, users: [], rows: [], orders: [], sessions: [], items: [], cleaned: false };
const result = { prefix, suite: realtimeOnly ? 'realtime-recovery' : 'workflow', checks: [], errors: [],
  realtime: [], wildcardRealtime: [], browserRealtime: [], skipped: [] };
const save = () => {
  writeFileSync(`${dir}/registry.json`, JSON.stringify(registry, null, 2));
  writeFileSync(`${dir}/results.json`, JSON.stringify(result, null, 2));
};
const pass = label => { result.checks.push(label); save(); console.log(`PASS ${label}`); };
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const publicClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const checked = async request => { const response = await request; if (response.error) throw Error(response.error.message); return response.data; };
const clients = {};
const password = `${randomBytes(24).toString('base64url')}aA1!`;
let app, browser, serverLog = '', ingredient, menu, table;
const streams = [], channels = [];
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(predicate, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(250); }
  throw Error(`Timeout: ${label}`);
}
function excluded(name, row) {
  if (name === 'authUsers' || name === 'profiles') return registry.users.some(user => user.id === row.id);
  if (registry.rows.some(record => record.table === name && record.id === row.id)) return true;
  if (name === 'orders') return registry.orders.includes(row.id);
  if (name === 'dining_sessions') return registry.sessions.includes(row.id);
  if (['order_items', 'order_ingredient_usages', 'payments'].includes(name)) return registry.orders.includes(row.order_id);
  if (['order_item_options', 'order_plate_services'].includes(name)) return registry.items.includes(row.order_item_id);
  if (menu !== undefined && ['menu_ingredients', 'menu_stock_availability', 'effective_menu_options'].includes(name)) return row.menu_id === menu;
  if (name === 'restaurant_table_aliases') return row.table_id === table;
  return false;
}
async function originals(label) {
  const snapshot = await capture(baseline, excluded);
  writeFileSync(`${dir}/${label}.json`, JSON.stringify(snapshot, null, 2));
  compare(baseline, snapshot);
  assert.deepEqual(Object.keys(snapshot.tables).sort(), Object.keys(baseline.tables).sort());
  pass(`${label}: all 23 original tables/views and original Auth fingerprints unchanged`);
}
async function insert(name, values, client = db) {
  const row = await checked(client.from(name).insert(values).select('id').single());
  registry.rows.push({ table: name, id: row.id }); save(); return row.id;
}
async function denied(client, name, args, pattern) {
  const response = await client.rpc(name, args);
  assert.ok(response.error, `${name} must be denied`);
  if (pattern) assert.match(response.error.message, pattern);
}
const orderRow = id => checked(db.from('orders').select('*').eq('id', id).single());
const stock = async () => Number((await checked(db.from('ingredients').select('stock_quantity').eq('id', ingredient).single())).stock_quantity);
const args = order => ({ p_order_id: order.id });
const plateArgs = (order, plate) => ({ p_item_id: order.item.id, p_plate: plate });
async function createOrder(label, quantity = 1, diningType = 'dine_in') {
  await checked(clients.admin.from('menus').update({ is_available: true }).eq('id', menu));
  const payload = { tableId: String(table), sessionToken: randomUUID(), requestId: randomUUID(), diningType,
    note: `${prefix} ${label}`, items: [{ menuId: menu, quantity, optionSelections: [] }] };
  // Save the request identity before submitting, so cleanup can recover a lost response.
  registry.requests ??= []; registry.requests.push(payload); save();
  try {
    const response = await fetch('http://localhost:4422/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    const order = body.order;
    registry.orders.push(order.id); registry.sessions.push(order.session_id); save();
    const items = await checked(db.from('order_items').select('*').eq('order_id', order.id));
    registry.items.push(...items.map(item => item.id)); save();
    assert.equal(items.length, 1);
    assert.equal(order.status, 'confirmed'); assert.equal(order.stock_deducted, true);
    return { ...order, item: items[0], payload };
  } finally {
    await checked(clients.admin.from('menus').update({ is_available: false }).eq('id', menu));
  }
}
async function start(order) {
  const active = await checked(db.from('orders').select('id').in('status', ['confirmed', 'preparing']));
  assert.ok(active.every(row => registry.orders.includes(row.id)), 'Never advance past an original active order');
  await checked(clients.kitchen_staff.rpc('advance_order_status', { ...args(order), p_expected: 'confirmed', p_next: 'preparing' }));
}
async function completePlate(order, plate) {
  await checked(clients.kitchen_staff.rpc('set_kitchen_plate', { ...plateArgs(order, plate), p_completed: true }));
}
async function servePlate(order, plate) {
  await checked(clients.staff.rpc('serve_order_plate', plateArgs(order, plate)));
}
async function pay(order, method) {
  await checked(clients.staff.rpc('complete_order_payment', { ...args(order), p_payment_method: method }));
  assert.equal((await orderRow(order.id)).status, 'completed');
  const payments = await checked(db.from('payments').select('*').eq('order_id', order.id));
  assert.equal(payments.length, 1); assert.equal(Number(payments[0].amount), 37 * order.item.quantity);
}
async function watchOrder(order) {
  const channel = clients.staff.channel(`clean-code-${randomUUID()}`).on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}`,
  }, payload => { result.realtime.push({ id: payload.new.id, status: payload.new.status }); save(); });
  channels.push(channel);
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(Error('Hosted Realtime subscription timed out')), 20000);
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') { clearTimeout(timer); done(); }
      else if (['CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) { clearTimeout(timer); reject(Error(`Hosted Realtime: ${status}`)); }
    });
  });
  const wildcard = clients.staff.channel(`clean-code-wildcard-${randomUUID()}`).on('postgres_changes', {
    event: '*', schema: 'public', table: 'orders',
  }, payload => { if (payload.new.id === order.id) { result.wildcardRealtime.push(payload.eventType); save(); } });
  channels.push(wildcard);
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(Error('Wildcard subscription timed out')), 20000);
    wildcard.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); done(); } });
  });
}
async function customerStream(order) {
  const controller = new AbortController(); streams.push(controller);
  const events = [];
  const response = await fetch('http://localhost:4422/api/customer-orders/events', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
    body: JSON.stringify({ tableId: table, sessionToken: order.payload.sessionToken }),
  });
  assert.equal(response.status, 200);
  const task = (async () => {
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '';
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n'); pending = lines.pop();
        for (const line of lines) if (line) events.push(JSON.parse(line).type);
      }
    } catch (error) { if (!controller.signal.aborted) result.errors.push(error.message); }
  })();
  controller.task = task;
  await until(() => events.includes('ready'), 'private customer stream connected');
  return events;
}
const pages = {}, contexts = {};
async function login(role) {
  const context = await browser.newContext(); contexts[role] = context;
  const page = await context.newPage(); pages[role] = page; page.setDefaultTimeout(30000);
  page.on('websocket', socket => {
    if (!socket.url().includes('/realtime/v1/websocket')) return;
    socket.on('framereceived', frame => {
      try {
        const [, , topic, event, payload] = JSON.parse(String(frame.payload));
        if (['system', 'phx_reply', 'postgres_changes'].includes(event)) {
          result.browserRealtime.push({ role, topic, event, status: payload.status, message: payload.message,
            bindings: payload.response?.postgres_changes?.length }); save();
        }
      } catch { /* Non-JSON transport frame. */ }
    });
  });
  const user = registry.users.find(user => user.role === role);
  await page.goto('http://localhost:4422/login');
  await page.locator('input[type=email]').fill(user.email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  const home = { admin: '/dashboard', staff: '/dashboard/orders', kitchen_staff: '/dashboard/kitchen' }[role];
  await page.waitForURL(`**${home}`);
}
async function setup() {
  await originals('after-migrations-before-tests');
  const active = await checked(db.from('orders').select('id').in('status', ['confirmed', 'preparing']));
  assert.equal(active.length, 0, 'Original queue must be idle before hosted FCFS testing');
  const actor = await checked(db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1).single());
  for (const role of ['admin', 'staff', 'kitchen_staff']) {
    const email = `${prefix}-${role}@example.invalid`.toLowerCase();
    const data = await checked(db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${prefix} ${role}` } }));
    registry.users.push({ id: data.user.id, email, role }); save();
    await checked(db.rpc('manage_staff_profile', { p_actor_id: actor.id, p_target_id: data.user.id, p_role: role, p_is_active: true, p_full_name: `${prefix} ${role}` }));
    clients[role] = publicClient(); await checked(clients[role].auth.signInWithPassword({ email, password }));
  }
  // Categories are read-only for authenticated roles in the existing schema.
  const category = await insert('categories', { name: prefix });
  ingredient = await checked(clients.admin.rpc('save_ingredient', { p_id: null, p_values: {
    name: prefix, unit: 'TEST', stock_quantity: 100, minimum_stock: 0, category_id: null,
    reset_every_days: null, reset_start_date: null, reset_time: null,
  } }));
  registry.rows.push({ table: 'ingredients', id: ingredient }); save();
  menu = await checked(clients.admin.rpc('create_menu_complete', { p_values: {
    name: prefix, price: 37, category_id: category, is_available: false, meat_required: false,
  }, p_recipe: [{ ingredient_id: ingredient, quantity_required: 2 }], p_addon_ids: [] }));
  registry.rows.push({ table: 'menus', id: menu }); save();
  table = await checked(clients.admin.rpc('manage_restaurant_table', { p_id: null, p_number: prefix, p_active: true }));
  registry.rows.push({ table: 'restaurant_tables', id: table }); save();
  await originals('after-test-provision');
  const appDir = `${dir}/app`; mkdirSync(appDir);
  for (const name of ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs']) cpSync(name, `${appDir}/${name}`, { recursive: true });
  app = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '-p', '4422'], {
    cwd: appDir, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', chunk => { serverLog += chunk; }); app.stderr.on('data', chunk => { serverLog += chunk; });
  await until(async () => { assert.equal(app.exitCode, null); try { return (await fetch('http://localhost:4422/login')).ok; } catch { return false; } }, 'local app ready', 90000);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const role of ['admin', 'staff', 'kitchen_staff']) await login(role);
}

try {
  await setup();
  if (realtimeOnly) {
    await checkHostedRealtime({ db, clients, pages, contexts, registry, result, dir, ingredient, table,
      createOrder, start, completePlate, servePlate, stock, pass, originals, save,
      closeBrowser: async () => { await browser.close(); browser = null; },
      openBrowser: async () => { browser = await chromium.launch({ channel: 'msedge', headless: true }); return browser; },
    });
  } else {
  // Check every role against actual server guards; no response interception.
  for (const role of ['admin', 'staff', 'kitchen_staff']) {
    const allowed = { '/dashboard': ['admin'], '/dashboard/users': ['admin'], '/dashboard/menus': ['admin'],
      '/dashboard/ingredients': ['admin'], '/dashboard/tables': ['admin'], '/dashboard/addons': ['admin'],
      '/dashboard/reports': ['admin'], '/dashboard/orders': ['staff'], '/dashboard/payments': ['staff'],
      '/dashboard/ready': ['staff'], '/dashboard/kitchen': ['kitchen_staff'] };
    for (const [path, roles] of Object.entries(allowed)) {
      const response = await pages[role].goto(`http://localhost:4422${path}`);
      assert.equal(response.status(), roles.includes(role) ? 200 : 403, `${role}: ${path}`);
    }
    pass(`${role}: 11 real dashboard route guards`);
  }
  for (const role of ['staff', 'kitchen_staff']) {
    await denied(clients[role], 'save_ingredient', { p_id: null, p_values: {} }, /ADMIN_REQUIRED/);
  }
  for (const name of ['deduct_ingredient_stock', 'process_order_stock']) {
    const response = await db.rpc(name, name === 'deduct_ingredient_stock' ? { required_items: [] } : { p_order_id: null, required_items: [] });
    assert.equal(response.error?.code, 'PGRST202', `${name}: absent from hosted API`);
  }
  assert.equal((await db.from('reviews').select('*').limit(1)).error?.code, 'PGRST205');
  pass('Removed table/RPCs are absent from actual PostgREST; catalog role guards remain enforced');

  const first = await createOrder('partial', 2);
  const second = await createOrder('takeaway', 1, 'takeaway');
  assert.equal(await stock(), 94);
  await denied(clients.kitchen_staff, 'advance_order_status', { ...args(second), p_expected: 'confirmed', p_next: 'preparing' }, /WAIT_PREVIOUS_ORDER/);
  for (const role of ['admin', 'staff']) await denied(clients[role], 'advance_order_status', { ...args(first), p_expected: 'confirmed', p_next: 'preparing' }, /KITCHEN_ROLE_REQUIRED/);
  await watchOrder(first);
  const customerEvents = await customerStream(first);
  await start(first);
  await denied(clients.kitchen_staff, 'advance_order_status', { ...args(first), p_expected: 'preparing', p_next: 'ready' }, /PLATES_INCOMPLETE/);
  for (const role of ['admin', 'kitchen_staff']) await denied(clients[role], 'serve_order_plate', plateArgs(first, 1), /STAFF_ROLE_REQUIRED/);
  await denied(clients.staff, 'serve_order_plate', plateArgs(first, 1), /PLATE_NOT_READY/);
  await denied(publicClient(), 'serve_order_plate', plateArgs(first, 1));
  await denied(clients.staff, 'complete_order_payment', { ...args(first), p_payment_method: 'cash' }, /ORDER_NOT_SERVED/);
  // Use the shipped refresh behavior. Dedicated SDK/SSE assertions below prove
  // genuine database push separately from the browser's polling safety net.
  await pages.staff.goto('http://localhost:4422/dashboard/ready');
  await pages.staff.bringToFront();
  assert.equal(await pages.staff.evaluate(() => document.visibilityState), 'visible');
  const card = pages.staff.locator('article').filter({ hasText: `ออเดอร์ #${first.order_number}` });
  await until(() => result.browserRealtime.some(event => event.role === 'staff'
    && event.topic.includes('staff-ready-orders') && event.event === 'system' && event.status === 'ok'), 'staff hosted Realtime subscription');
  await completePlate(first, 1);
  await card.getByRole('button', { name: 'ยืนยันเสิร์ฟ จานที่ 1', exact: true }).waitFor();
  await card.getByRole('button', { name: 'ยืนยันเสิร์ฟ จานที่ 1', exact: true }).click();
  await until(async () => (await checked(db.from('order_items').select('served_plates').eq('id', first.item.id).single())).served_plates.length === 1, 'first plate served via actual UI');
  assert.equal((await orderRow(first.id)).status, 'preparing');
  await servePlate(first, 1); // Retry must not serve a second plate or replace audit.
  assert.equal((await checked(db.from('order_plate_services').select('*').eq('order_item_id', first.item.id))).length, 1);
  await completePlate(first, 2);
  assert.equal((await orderRow(first.id)).status, 'ready');
  await start(second); // All cooked plates release FCFS before first bill is paid.
  await card.getByRole('button', { name: 'ยืนยันเสิร์ฟ จานที่ 2', exact: true }).click();
  await until(async () => (await orderRow(first.id)).status === 'served', 'all plates served');
  await pages.staff.goto('http://localhost:4422/dashboard/payments');
  const bill = pages.staff.locator('article').filter({ hasText: `ออเดอร์ #${first.order_number}` });
  await bill.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await bill.getByRole('button', { name: 'เงินสด', exact: true }).click();
  await until(async () => (await orderRow(first.id)).status === 'completed', 'cash payment committed via UI');
  const paid = await checked(db.from('payments').select('*').eq('order_id', first.id));
  assert.equal(paid.length, 1); assert.equal(Number(paid[0].amount), 74);
  for (const role of ['admin', 'kitchen_staff']) await denied(clients[role], 'complete_order_payment', { ...args(first), p_payment_method: 'cash' }, /STAFF_ROLE_REQUIRED/);
  await denied(clients.staff, 'complete_order_payment', { ...args(first), p_payment_method: 'cash' }, /ORDER_NOT_SERVED/);
  await completePlate(second, 1); await servePlate(second, 1); await pay(second, 'qr_code');
  await until(() => result.realtime.some(event => event.id === first.id && event.status === 'completed'), 'hosted postgres_changes completed');
  await until(() => customerEvents.includes('change'), 'actual private customer stream change');
  assert.equal(await stock(), 94, 'Cooking/service/payment never deduct stock twice');
  pass('Actual order API, FCFS, partial plates, real staff serve/cash UI, takeaway/QR, per-bill totals, duplicate retries and normal browser Realtime/polling refresh');
  pass(`Real customer stream ready/change and ${result.realtime.length} hosted order change callbacks`);
  await originals('after-main-workflows');

  const cancel = await createOrder('cancel', 2);
  assert.equal(await stock(), 90);
  for (const role of ['admin', 'kitchen_staff']) {
    const deniedResponse = await pages[role].request.post(`http://localhost:4422/api/orders/${cancel.id}/cancel`, { data: {} });
    assert.equal(deniedResponse.status(), 403);
  }
  const cancelled = await pages.staff.request.post(`http://localhost:4422/api/orders/${cancel.id}/cancel`, { data: {} });
  assert.equal(cancelled.status(), 200);
  assert.equal(await stock(), 94);
  const duplicateCancel = await pages.staff.request.post(`http://localhost:4422/api/orders/${cancel.id}/cancel`, { data: {} });
  assert.equal(duplicateCancel.status(), 409);
  assert.equal(await stock(), 94);
  const failedRequest = { ...cancel.payload, requestId: randomUUID(), sessionToken: randomUUID(), items: [{ menuId: menu, quantity: 100, optionSelections: [] }] };
  await checked(clients.admin.from('menus').update({ is_available: true }).eq('id', menu));
  try {
    const response = await fetch('http://localhost:4422/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(failedRequest) });
    assert.equal(response.status, 409);
  } finally { await checked(clients.admin.from('menus').update({ is_available: false }).eq('id', menu)); }
  assert.equal(await stock(), 94);
  pass('Real cancellation restores stock exactly once; insufficient stock fails without changing balance');

  // Use only the test ingredient. Let the existing cron run naturally with browsers closed.
  let item = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
  const resetAt = new Date(Math.ceil((Date.now() + 90000) / 60000) * 60000);
  const thai = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(resetAt);
  await checked(clients.admin.rpc('save_ingredient', { p_id: ingredient, p_expected_updated_at: item.updated_at, p_values: {
    name: prefix, unit: 'TEST', minimum_stock: 0, category_id: null, stock_quantity: 10,
    reset_every_days: 1, reset_start_date: thai.slice(0, 10), reset_time: thai.slice(11, 16),
  } }));
  item = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
  assert.ok(new Date(item.reset_next_at).getTime() > Date.now());
  assert.ok(Math.abs(new Date(item.reset_next_at).getTime() - resetAt.getTime()) < 1000);
  await denied(clients.admin, 'save_ingredient', { p_id: ingredient, p_expected_updated_at: '2000-01-01T00:00:00Z', p_values: { name: prefix, unit: 'TEST', minimum_stock: 0 } }, /INGREDIENT_CHANGED/);
  const unpaid = await createOrder('cron-reserved', 2);
  await start(unpaid); await completePlate(unpaid, 1); await completePlate(unpaid, 2);
  await servePlate(unpaid, 1); await servePlate(unpaid, 2);
  assert.equal(await stock(), 6);
  for (const controller of streams) controller.abort();
  await browser.close(); browser = null;
  console.log(`WAIT test ingredient cron only; due ${item.reset_next_at}`);
  await until(async () => {
    const current = await checked(db.from('ingredients').select('stock_quantity,reset_last_at').eq('id', ingredient).single());
    return Number(current.stock_quantity) === 0 && current.reset_last_at !== null;
  }, 'real cron reset with browser closed', 210000);
  const usages = await checked(db.from('order_ingredient_usages').select('*').eq('order_id', unpaid.id));
  assert.equal(usages.length, 1); assert.equal(Number(usages[0].quantity_used), 4);
  assert.equal((await orderRow(unpaid.id)).status, 'served');
  item = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
  await checked(clients.admin.rpc('save_ingredient', { p_id: ingredient, p_expected_updated_at: item.updated_at, p_values: {
    name: prefix, unit: 'TEST', minimum_stock: 0, category_id: null, stock_quantity: 7,
    reset_every_days: null, reset_start_date: null, reset_time: null,
  } }));
  await pay(unpaid, 'cash');
  assert.equal(await stock(), 7);
  pass('Existing pg_cron actually reset only the scheduled test ingredient with browser closed; unpaid order usage preserved, refill/disable and payment retained stock');
  await originals('after-cron-and-payment');
  }
} catch (error) {
  result.errors.push(error.stack ?? error.message); console.error(error.message); process.exitCode = 1;
  for (const [role, page] of Object.entries(pages)) {
    if (!page.isClosed()) writeFileSync(`${dir}/failure-${role}.txt`, await page.locator('body').innerText().catch(() => 'unavailable'));
  }
} finally {
  for (const controller of streams) controller.abort();
  await browser?.close();
  for (const client of Object.values(clients)) await client.removeAllChannels();
  if (app?.exitCode === null) { app.kill(); await sleep(1500); }
  writeFileSync(`${dir}/server.log`, serverLog);
  try {
    // Recover IDs even if an HTTP response was lost after a successful commit.
    if (table) {
      const found = await checked(db.from('orders').select('id,session_id,note').eq('table_id', table));
      for (const row of found) {
        assert.ok(row.note?.startsWith(`${prefix} `));
        if (!registry.orders.includes(row.id)) registry.orders.push(row.id);
        if (!registry.sessions.includes(row.session_id)) registry.sessions.push(row.session_id);
      }
    }
    save();
    for (const id of registry.orders) {
      const row = await orderRow(id); assert.equal(row.table_id, table); assert.ok(row.note.startsWith(`${prefix} `));
      // These deletes target only registered test IDs; never repair original data.
      const items = await checked(db.from('order_items').select('id').eq('order_id', id));
      const ids = items.map(item => item.id);
      for (const child of ['payments', 'order_ingredient_usages']) await checked(db.from(child).delete().eq('order_id', id));
      if (ids.length) {
        await checked(db.from('order_plate_services').delete().in('order_item_id', ids));
        await checked(db.from('order_item_options').delete().in('order_item_id', ids));
      }
      await checked(db.from('order_items').delete().eq('order_id', id));
      await checked(db.from('orders').delete().eq('id', id));
    }
    // Sessions from rejected attempts also belong exclusively to the test table.
    if (table) {
      await checked(db.from('dining_sessions').delete().eq('table_id', table));
      await checked(db.from('restaurant_table_aliases').delete().eq('table_id', table));
    }
    for (const row of [...registry.rows].reverse()) {
      const current = await checked(db.from(row.table).select('*').eq('id', row.id).single());
      assert.equal(current.name ?? current.table_number, prefix);
      if (row.table === 'menus') await checked(db.from('menu_ingredients').delete().eq('menu_id', row.id).eq('ingredient_id', ingredient));
      await checked(db.from(row.table).delete().eq('id', row.id));
    }
    for (const user of [...registry.users].reverse()) {
      const current = await checked(db.auth.admin.getUserById(user.id)); assert.equal(current.user.email, user.email);
      await checked(db.auth.admin.deleteUser(user.id));
    }
    const after = await capture(baseline);
    writeFileSync(`${dir}/after-cleanup.json`, JSON.stringify(after, null, 2)); compare(baseline, after);
    assert.deepEqual(Object.keys(after.tables).sort(), Object.keys(baseline.tables).sort());
    registry.cleaned = true; pass('Only registered test resources removed; final original data and Auth fingerprints match pre-migration baseline');
  } catch (error) {
    result.errors.push(`Cleanup/audit: ${error.stack ?? error.message}`); console.error(`Cleanup/audit: ${error.message}`); process.exitCode = 1;
  }
  save(); console.log(JSON.stringify({ directory: dir, checks: result.checks.length, errors: result.errors.length, cleaned: registry.cleaned }));
}
