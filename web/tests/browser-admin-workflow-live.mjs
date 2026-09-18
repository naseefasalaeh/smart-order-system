// Explicit live integration test. Every write is scoped to this run's TEST prefix.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

assert.ok(process.argv.includes('--remote-test'), 'Requires --remote-test');
process.loadEnvFile('.env.local');
const base = process.env.ADMIN_FLOW_BASE_URL ?? 'http://localhost:3103';
const root = '.test-artifacts/admin-workflow-live';
mkdirSync(root, { recursive: true });
const registry = `${root}/registry.json`;
const previous = existsSync(registry) ? JSON.parse(readFileSync(registry, 'utf8')) : null;
const run = previous && !previous.cleaned ? previous : {
  prefix: `TEST_ADMIN_FLOW_${Date.now()}`, users: [], orders: [], checks: [],
};
const save = () => writeFileSync(registry, JSON.stringify(run, null, 2));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const data = async (query) => { const result = await query; if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`); return result.data; };
const pass = (label) => { run.checks.push(label); save(); console.log(`PASS ${label}`); };
const tables = ['menus','ingredients','menu_ingredients','menu_options','menu_option_groups','menu_option_ingredients','addons','addon_ingredients','orders','order_items','order_item_options','order_ingredient_usages','restaurant_tables','restaurant_table_aliases','dining_sessions','profiles','payments'];
async function fingerprint() {
  const result = {};
  for (const table of tables) {
    const rows = await data(db.from(table).select('*').limit(10000));
    result[table] = createHash('sha256').update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest('hex');
  }
  return result;
}
async function setup() {
  assert.ok(!run.before && !run.table, 'Existing test registry must be cleaned first');
  run.before = await fingerprint(); save();
  for (const role of ['admin', 'staff', 'kitchen_staff']) {
    const email = `${run.prefix.toLowerCase()}_${role}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const created = await db.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    run.users.push({ id: created.data.user.id, email, password, role }); save();
    await data(db.from('profiles').update({ role }).eq('id', created.data.user.id));
  }
  const category = (await data(db.from('categories').select('id').limit(1)))[0];
  const ingredientCategory = (await data(db.from('ingredient_categories').select('id').limit(1)))[0];
  assert.ok(category && ingredientCategory);
  run.ingredient = await data(db.from('ingredients').insert({ name: `${run.prefix}_stock`, unit: 'กรัม', stock_quantity: 1000, minimum_stock: 0, category_id: ingredientCategory.id }).select().single()); save();
  run.menu = await data(db.from('menus').insert({ name: `${run.prefix}_menu`, category_id: category.id, price: 50, is_available: false }).select().single()); save();
  await data(db.from('menu_ingredients').insert({ menu_id: run.menu.id, ingredient_id: run.ingredient.id, quantity_required: 100 }));
  await data(db.from('menus').update({ is_available: true }).eq('id', run.menu.id));
  run.table = await data(db.from('restaurant_tables').insert({ table_number: String(800000 + Math.floor(Math.random() * 90000)), qr_code: run.prefix, status: 'available' }).select().single()); save();
  await data(db.from('restaurant_table_aliases').insert({ table_number: run.table.table_number, table_id: run.table.id }));
  pass('isolated TEST table, menu, stock and role accounts created');
}
async function prepareExistingTable() {
  assert.ok(run.table && run.prefix.startsWith('TEST_ADMIN_FLOW_') && !run.orders.length);
  const table = await data(db.from('restaurant_tables').select('qr_code,table_number').eq('id', run.table.id).single());
  assert.equal(table.qr_code, run.prefix);
  const alias = await data(db.from('restaurant_table_aliases').select('table_id').eq('table_number', table.table_number).maybeSingle());
  if (!alias) await data(db.from('restaurant_table_aliases').insert({ table_number: table.table_number, table_id: run.table.id }));
  else assert.equal(alias.table_id, run.table.id);
  pass('TEST table QR alias prepared');
}
async function probeStaffProfile() {
  const user = run.users.find(item => item.role === 'staff');
  assert.ok(user);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const login = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  assert.ifError(login.error);
  const result = await client.from('profiles').select('role').eq('id', user.id).maybeSingle();
  console.log(JSON.stringify({ role: result.data?.role ?? null, code: result.error?.code ?? null }));
}
async function runBrowser() {
  assert.ok(run.table && !run.cleaned);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const customerContext = await browser.newContext();
  const customer = await customerContext.newPage(); customer.setDefaultTimeout(20000);
  const rolePages = [];
  const stock = async () => Number((await data(db.from('ingredients').select('stock_quantity').eq('id', run.ingredient.id).single())).stock_quantity);
  async function login(role) {
    const user = run.users.find(item => item.role === role);
    const context = await browser.newContext();
    const page = await context.newPage(); page.setDefaultTimeout(20000); rolePages.push(context);
    await page.goto(`${base}/login`);
    await page.getByLabel('อีเมล', { exact: true }).fill(user.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.waitForURL(role === 'kitchen_staff' ? '**/dashboard/kitchen' : '**/dashboard');
    return { page, context, user };
  }
  async function orderFood() {
    await customer.goto(`${base}/table/${run.table.table_number}`);
    const card = customer.locator('article').filter({ has: customer.getByRole('heading', { name: run.menu.name, exact: true }) });
    await card.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
    await customer.getByRole('button', { name: /^เพิ่มลงตะกร้า/ }).click();
    await customer.getByRole('button', { name: 'ดูตะกร้า', exact: true }).click();
    const responsePromise = customer.waitForResponse(response => response.url().endsWith('/api/orders') && response.request().method() === 'POST');
    await customer.getByRole('button', { name: 'ยืนยันการสั่งอาหาร', exact: true }).click();
    const response = await responsePromise; assert.equal(response.status(), 201, await response.text());
    const order = (await response.json()).order; run.orders.push(order); save();
    await customer.waitForURL('**/orders');
    run.customerToken = await customer.evaluate((id) => window.localStorage.getItem(`smart-order-session-id-${id}`), run.table.id); save();
    assert.ok(run.customerToken);
    assert.equal((await data(db.from('orders').select('status').eq('id', order.id).single())).status, 'confirmed');
    return order;
  }
  try {
    assert.equal(await stock(), 1000);
    const first = await orderFood(); assert.equal(await stock(), 900);
    customer.once('dialog', dialog => dialog.accept());
    await customer.getByRole('button', { name: 'ยกเลิกออเดอร์', exact: true }).click();
    await customer.getByText('ยกเลิกออเดอร์สำเร็จ คืนสต็อกแล้ว').waitFor();
    assert.equal(await stock(), 1000);
    assert.equal((await data(db.from('orders').select('status').eq('id', first.id).single())).status, 'cancelled');
    const repeatedCancel = await customerContext.request.post(`${base}/api/orders/${first.id}/cancel`, { data: { tableId: run.table.id, sessionToken: run.customerToken } });
    assert.ok([403, 409].includes(repeatedCancel.status()));
    assert.equal(await stock(), 1000);
    pass('browser customer order → confirmed → cancel; stock restored exactly once');

    const second = await orderFood(); assert.equal(await stock(), 900);
    const otherSession = await browser.newContext();
    try {
      const forbidden = await otherSession.request.post(`${base}/api/orders/${second.id}/cancel`, { data: { tableId: run.table.id, sessionToken: randomUUID() } });
      assert.equal(forbidden.status(), 403, await forbidden.text());
      const guest = await otherSession.newPage();
      await guest.goto(`${base}/dashboard/kitchen`);
      assert.match(guest.url(), /\/login(?:\?|$)/);
    } finally { await otherSession.close(); }
    const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const forgedStatus = await anonymous.from('orders').update({ status: 'ready' }).eq('id', second.id).select('id');
    assert.ok(forgedStatus.error || forgedStatus.data.length === 0);
    assert.equal((await data(db.from('orders').select('status').eq('id', second.id).single())).status, 'confirmed');
    const staff = await login('staff');
    await staff.page.goto(`${base}/dashboard/orders`);
    let card = staff.page.locator('article').filter({ hasText: `ออเดอร์ #${second.order_number}` });
    await card.waitFor();
    assert.equal(await card.getByRole('button', { name: 'เริ่มทำอาหาร' }).count(), 0);
    assert.equal(await staff.page.locator('aside a[href="/dashboard/kitchen"]').count(), 0);
    assert.equal(await staff.page.locator('aside a[href="/dashboard/menus"]').count(), 0);
    const staffClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    assert.ifError((await staffClient.auth.signInWithPassword({ email: staff.user.email, password: staff.user.password })).error);
    assert.ok((await staffClient.rpc('advance_order_status', { p_order_id: second.id, p_expected: 'confirmed', p_next: 'preparing' })).error);
    pass('customer cannot cancel another session; staff cannot see or call kitchen transition');

    const kitchen = await login('kitchen_staff');
    await kitchen.page.goto(`${base}/dashboard/kitchen`);
    assert.equal(await kitchen.page.locator('aside a[href="/dashboard/orders"]').count(), 0);
    assert.equal(await kitchen.page.locator('aside a[href="/dashboard/menus"]').count(), 0);
    const forbiddenPage = await kitchen.page.goto(`${base}/dashboard/menus`);
    assert.equal(forbiddenPage.status(), 404);
    await kitchen.page.goto(`${base}/dashboard/kitchen`);
    card = kitchen.page.locator('article').filter({ hasText: `ออเดอร์ #${second.order_number}` });
    await card.getByRole('button', { name: 'เริ่มทำอาหาร' }).click();
    await kitchen.page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ' }).waitFor();
    assert.equal((await data(db.from('orders').select('status').eq('id', second.id).single())).status, 'preparing');
    await customer.reload();
    await customer.getByText('ร้านเริ่มทำอาหารแล้ว ไม่สามารถยกเลิกได้').waitFor();
    const blocked = await customerContext.request.post(`${base}/api/orders/${second.id}/cancel`, { data: { tableId: run.table.id, sessionToken: run.customerToken } });
    assert.equal(blocked.status(), 409, await blocked.text());
    pass('kitchen staff starts food; preparing order cannot be cancelled');

    const kitchenClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    assert.ifError((await kitchenClient.auth.signInWithPassword({ email: kitchen.user.email, password: kitchen.user.password })).error);
    assert.ok((await kitchenClient.rpc('complete_order_payment', { p_order_id: second.id, p_payment_method: 'cash' })).error);
    const forgedMenu = await kitchenClient.from('menus').update({ name: 'FORGED' }).eq('id', run.menu.id).select('id');
    assert.ok(forgedMenu.error || forgedMenu.data.length === 0);
    const forgedStock = await kitchenClient.from('ingredients').update({ stock_quantity: 1 }).eq('id', run.ingredient.id).select('id');
    assert.ok(forgedStock.error || forgedStock.data.length === 0);
    assert.ok((await kitchenClient.rpc('manage_restaurant_table', { p_id: run.table.id, p_number: 'FORGED', p_active: true })).error);
    assert.ok((await kitchenClient.rpc('save_addon', { p_id: null, p_name: 'FORGED', p_price: 1, p_available: true, p_max_quantity: 1, p_recipe: [], p_category: 'topping', p_display_order: 0 })).error);
    card = kitchen.page.locator('article').filter({ hasText: `ออเดอร์ #${second.order_number}` });
    await card.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ' }).click();
    await kitchen.page.getByText('อาหารพร้อมเสิร์ฟ กรุณารับชำระเงิน', { exact: false }).waitFor();
    assert.equal((await data(db.from('orders').select('status').eq('id', second.id).single())).status, 'ready');
    assert.ok((await kitchenClient.rpc('complete_order_payment', { p_order_id: second.id, p_payment_method: 'cash' })).error);
    pass('kitchen staff marks ready but cannot receive payment or edit catalog and tables');

    const admin = await login('admin');
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    assert.ifError((await adminClient.auth.signInWithPassword({ email: admin.user.email, password: admin.user.password })).error);
    assert.equal(await admin.page.locator('aside a[href="/dashboard/menus"]').count(), 1);
    await staff.page.goto(`${base}/dashboard/ready`);
    await staff.page.getByText(`ออเดอร์ #${second.order_number}`, { exact: false }).waitFor();
    await staff.page.goto(`${base}/dashboard/orders`);
    card = staff.page.locator('article').filter({ hasText: `ออเดอร์ #${second.order_number}` });
    await card.getByRole('button', { name: 'รับชำระเงิน' }).click();
    await card.getByRole('button', { name: 'เงินสด' }).click();
    assert.equal((await data(db.from('orders').select('status').eq('id', second.id).single())).status, 'completed');
    assert.equal(await stock(), 900);
    pass('ready page displays order; staff payment completes without extra stock deduction');

    const third = await orderFood(); assert.equal(await stock(), 800);
    await staff.page.goto(`${base}/dashboard/orders`);
    card = staff.page.locator('article').filter({ hasText: `ออเดอร์ #${third.order_number}` });
    staff.page.once('dialog', dialog => dialog.accept());
    await card.getByRole('button', { name: 'ยกเลิกออเดอร์' }).click();
    await staff.page.waitForTimeout(500);
    assert.equal((await data(db.from('orders').select('status').eq('id', third.id).single())).status, 'cancelled');
    assert.equal(await stock(), 900);
    pass('staff cancels confirmed order and restores stock once');

    const fourth = await orderFood(); assert.equal(await stock(), 800);
    assert.ifError((await adminClient.rpc('advance_order_status', { p_order_id: fourth.id, p_expected: 'confirmed', p_next: 'preparing' })).error);
    assert.ifError((await adminClient.rpc('advance_order_status', { p_order_id: fourth.id, p_expected: 'preparing', p_next: 'ready' })).error);
    assert.ifError((await adminClient.rpc('complete_order_payment', { p_order_id: fourth.id, p_payment_method: 'cash' })).error);
    assert.equal((await data(db.from('orders').select('status').eq('id', fourth.id).single())).status, 'completed');
    assert.equal(await stock(), 800);
    pass('admin can advance both kitchen transitions and receive payment');
  } catch (error) {
    console.error('Browser failure page:', customer.url(), (await customer.locator('body').innerText()).slice(0, 800));
    await customer.screenshot({ path: `${root}/failure.png` });
    throw error;
  } finally {
    await customerContext.close();
    for (const context of rolePages) await context.close();
    await browser.close();
  }
}
async function uiSmoke() {
  assert.ok(run.table && run.menu && !run.cleaned);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const contexts = [];
  async function login(role) {
    const user = run.users.find(item => item.role === role);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    await page.goto(`${base}/login`);
    await page.getByLabel('อีเมล', { exact: true }).fill(user.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.waitForURL(role === 'kitchen_staff' ? '**/dashboard/kitchen' : '**/dashboard');
    return page;
  }
  try {
    const admin = await login('admin');
    await admin.goto(`${base}/dashboard/tables`);
    const original = admin.locator('article').filter({ hasText: `โต๊ะ ${run.table.table_number}` });
    await original.locator('img[alt^="QR Code"]').waitFor();
    const qrBefore = await original.locator('img[alt^="QR Code"]').getAttribute('src');
    await original.getByRole('button', { name: 'แก้ไขโต๊ะ' }).click();
    const dialog = admin.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'หมายเลขหรือชื่อโต๊ะ' }).fill(`${run.prefix}_renamed`);
    await dialog.getByRole('button', { name: 'บันทึกโต๊ะ' }).click();
    await admin.waitForURL('**/dashboard/tables?success=*');
    const renamed = admin.locator('article').filter({ hasText: `โต๊ะ ${run.prefix}_renamed` });
    await renamed.locator('img[alt^="QR Code"]').waitFor();
    assert.equal(await renamed.locator('img[alt^="QR Code"]').getAttribute('src'), qrBefore);
    assert.equal(await renamed.getByRole('link', { name: 'เปิดหน้าสั่งอาหาร' }).getAttribute('href'), `/table/id-${run.table.id}`);
    await renamed.getByRole('button', { name: 'ปิดใช้งาน' }).click();
    await admin.getByText('ปิดใช้งาน', { exact: true }).first().waitFor();
    await admin.locator('article').filter({ hasText: `โต๊ะ ${run.prefix}_renamed` }).getByRole('button', { name: 'เปิดใช้งาน' }).click();
    await admin.locator('article').filter({ hasText: `โต๊ะ ${run.prefix}_renamed` }).getByRole('button', { name: 'ปิดใช้งาน' }).waitFor();
    await admin.getByRole('searchbox', { name: 'ค้นหาโต๊ะ' }).fill(run.prefix);
    assert.equal(await admin.locator('section[aria-label="รายการโต๊ะ"] article').count(), 1);
    await admin.getByRole('combobox', { name: 'กรองสถานะโต๊ะ' }).selectOption('inactive');
    await admin.getByText('ไม่พบโต๊ะที่ตรงกับการค้นหา').waitFor();
    await admin.getByRole('combobox', { name: 'กรองสถานะโต๊ะ' }).selectOption('all');
    await admin.getByRole('searchbox', { name: 'ค้นหาโต๊ะ' }).fill('');
    run.uiTableName = `${run.prefix}_new`; save();
    await admin.getByRole('button', { name: '+ เพิ่มโต๊ะ' }).click();
    await dialog.getByRole('textbox', { name: 'หมายเลขหรือชื่อโต๊ะ' }).fill(`${run.prefix}_renamed`);
    await dialog.getByRole('button', { name: 'เพิ่มโต๊ะ' }).click();
    await dialog.getByText('หมายเลขหรือชื่อโต๊ะนี้ถูกใช้แล้ว').waitFor();
    await dialog.getByRole('textbox', { name: 'หมายเลขหรือชื่อโต๊ะ' }).fill(run.uiTableName);
    await dialog.getByRole('button', { name: 'เพิ่มโต๊ะ' }).click();
    await admin.getByRole('heading', { name: `โต๊ะ ${run.uiTableName}` }).waitFor();
    const added = await data(db.from('restaurant_tables').select('id,qr_code,table_number').eq('table_number', run.uiTableName).single());
    run.uiTables = [added]; save();
    pass('tables: add, duplicate validation, edit, toggle, search, filter and stable QR target');

    await admin.goto(`${base}/dashboard/menus?q=${encodeURIComponent(run.menu.name)}`);
    let row = admin.getByRole('row').filter({ has: admin.getByText(run.menu.name, { exact: true }) });
    const actions = row.locator('[aria-label^="จัดการเมนู"]');
    assert.equal(await actions.getByRole('link', { name: 'แก้ไข' }).count(), 1);
    assert.ok(Number.parseFloat(await actions.evaluate((element) => getComputedStyle(element).gap)) >= 8);
    await actions.getByRole('button', { name: 'ปิดขาย' }).click();
    await actions.getByRole('button', { name: 'เปิดขาย' }).waitFor();
    assert.equal((await data(db.from('menus').select('is_available').eq('id', run.menu.id).single())).is_available, false);
    await actions.getByRole('button', { name: 'เปิดขาย' }).click();
    await actions.getByRole('button', { name: 'ปิดขาย' }).waitFor();
    assert.equal((await data(db.from('menus').select('is_available').eq('id', run.menu.id).single())).is_available, true);
    await actions.getByRole('link', { name: 'แก้ไข' }).click();
    await admin.waitForURL(`**/dashboard/menus/${run.menu.id}/edit`);
    await admin.goto(`${base}/dashboard/menus?q=${encodeURIComponent(run.menu.name)}`);
    row = admin.getByRole('row').filter({ has: admin.getByText(run.menu.name, { exact: true }) });
    await row.getByRole('button', { name: 'ลบเมนู' }).click();
    await admin.getByRole('dialog').getByRole('button', { name: 'ยกเลิก' }).click();
    pass('menus: action spacing, edit route, availability toggle and delete confirmation');

    const staff = await login('staff');
    await staff.goto(`${base}/dashboard/ready`);
    assert.equal(await staff.locator('aside a[aria-current="page"]').getAttribute('href'), '/dashboard/ready');
    assert.equal(await staff.locator('aside a[href="/dashboard/kitchen"]').count(), 0);
    assert.equal(await staff.locator('aside a[href="/dashboard/menus"]').count(), 0);
    const kitchen = await login('kitchen_staff');
    assert.equal(await kitchen.locator('aside a[href="/dashboard/ready"]').count(), 0);
    assert.equal((await kitchen.goto(`${base}/dashboard/ready`)).status(), 404);
    pass('ready: shared active sidebar, staff access and kitchen staff server denial');

    await admin.goto(`${base}/dashboard/reports?month=2099-02`);
    await admin.getByRole('heading', { name: 'ภาพรวมแบบกราฟ' }).waitFor();
    assert.equal(await admin.locator('[aria-label^="2099-02-"]').count(), 56);
    await admin.getByText('ยังไม่มีข้อมูลการชำระเงิน').first().waitFor();
    await admin.locator('input[name="month"]').fill('2026-08');
    await admin.getByRole('button', { name: 'ดูรายงาน' }).click();
    await admin.waitForURL('**/dashboard/reports?month=2026-08');
    assert.equal(await admin.locator('[aria-label^="2026-08-"]').count(), 62);
    pass('reports: selected month changes daily charts and empty month renders safely');

    for (const width of [375, 768, 1440]) {
      await admin.setViewportSize({ width, height: 900 });
      for (const route of ['/dashboard/ready', '/dashboard/menus', '/dashboard/tables', '/dashboard/reports?month=2026-08']) {
        await admin.goto(base + route);
        assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${route} overflows at ${width}px`);
      }
      await admin.screenshot({ path: `${root}/ui-${width}.png`, fullPage: true });
    }
    pass('mobile, tablet and desktop layouts stay within the viewport');
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
async function cleanup() {
  assert.ok(run.prefix.startsWith('TEST_ADMIN_FLOW_') && run.before && !run.cleaned);
  if (run.table) {
    const table = await data(db.from('restaurant_tables').select('qr_code').eq('id', run.table.id).single());
    assert.equal(table.qr_code, run.prefix);
  }
  if (run.uiTableName && !(run.uiTables ?? []).length) {
    const pending = await data(db.from('restaurant_tables').select('id,qr_code,table_number').eq('table_number', run.uiTableName));
    run.uiTables = pending; save();
  }
  const orders = run.table ? await data(db.from('orders').select('id,status,stock_deducted').eq('table_id', run.table.id)) : [];
  for (const order of orders) {
    assert.ok(run.orders.some(item => item.id === order.id));
    if (order.stock_deducted && order.status === 'confirmed') await data(db.rpc('cancel_order_and_restore_stock', { p_order_id: order.id, p_current_status: 'confirmed' }));
    await data(db.from('orders').delete().eq('id', order.id).eq('table_id', run.table.id));
  }
  if (run.table) {
    await data(db.from('dining_sessions').delete().eq('table_id', run.table.id));
    await data(db.from('restaurant_table_aliases').delete().eq('table_id', run.table.id));
    await data(db.from('restaurant_tables').delete().eq('id', run.table.id).eq('qr_code', run.prefix));
  }
  for (const table of run.uiTables ?? []) {
    const found = await data(db.from('restaurant_tables').select('qr_code').eq('id', table.id).single());
    assert.equal(found.qr_code, table.qr_code);
    await data(db.from('restaurant_table_aliases').delete().eq('table_id', table.id));
    await data(db.from('restaurant_tables').delete().eq('id', table.id).eq('qr_code', table.qr_code));
  }
  if (run.menu) await data(db.from('menus').delete().eq('id', run.menu.id).eq('name', run.menu.name));
  if (run.ingredient) await data(db.from('ingredients').delete().eq('id', run.ingredient.id).eq('name', run.ingredient.name));
  for (const user of run.users) {
    const found = await db.auth.admin.getUserById(user.id); assert.ifError(found.error); assert.equal(found.data.user.email, user.email);
    assert.ifError((await db.auth.admin.deleteUser(user.id)).error);
  }
  run.after = await fingerprint();
  assert.deepEqual(run.after, run.before, 'Existing table fingerprints changed');
  run.cleaned = true; run.users.forEach(user => delete user.password); save();
  pass('only registered TEST data removed; all original table fingerprints match');
}
const command = process.argv[2];
try {
  if (command === 'setup') await setup();
  else if (command === 'prepare') await prepareExistingTable();
  else if (command === 'probe') await probeStaffProfile();
  else if (command === 'run') await runBrowser();
  else if (command === 'ui') await uiSmoke();
  else if (command === 'cleanup') await cleanup();
  else throw new Error('Expected setup, run, or cleanup');
} catch (error) { save(); console.error(error); process.exitCode = 1; }
