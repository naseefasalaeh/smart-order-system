// Live Supabase test. All mutations are limited to uniquely named TEST accounts.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

assert.ok(process.argv.includes('--remote-test'), 'Requires --remote-test');
process.loadEnvFile('.env.local');
const base = process.env.ACTIVE_ACCOUNTS_BASE_URL ?? 'http://localhost:3103';
const runName = process.env.ACTIVE_ACCOUNTS_RUN ?? 'active-accounts-live';
assert.match(runName, /^[a-zA-Z0-9_-]+$/);
const root = `.test-artifacts/${runName}`;
mkdirSync(root, { recursive: true });
const registry = `${root}/registry.json`;
const state = existsSync(registry) ? JSON.parse(readFileSync(registry, 'utf8')) : {
  prefix: `TEST_ACTIVE_${Date.now()}_${randomBytes(3).toString('hex')}`, users: [], checks: [],
};
const save = () => writeFileSync(registry, JSON.stringify(state, null, 2));
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const rows = async query => { const result = await query; assert.ifError(result.error); return result.data; };
const pass = label => { state.checks.push(label); save(); console.log(`PASS ${label}`); };
const tables = ['menus','ingredients','menu_ingredients','menu_options','menu_option_groups',
  'menu_option_ingredients','addons','addon_ingredients','orders','order_items','order_item_options',
  'order_ingredient_usages','restaurant_tables','restaurant_table_aliases','dining_sessions',
  'profiles','categories','ingredient_categories','payments','reviews'];
async function fingerprint() {
  const result = {};
  for (const table of tables) {
    const all = [];
    for (let offset = 0;; offset += 1000) {
      let query = service.from(table).select('*');
      if (table === 'menu_ingredients') query = query.order('menu_id').order('ingredient_id');
      else if (table === 'addon_ingredients') query = query.order('addon_id').order('ingredient_id');
      else if (table === 'restaurant_table_aliases') query = query.order('table_number');
      else query = query.order('id');
      const batch = await rows(query.range(offset, offset + 999));
      all.push(...batch);
      if (batch.length < 1000) break;
    }
    result[table] = { count: all.length, hash: createHash('sha256').update(JSON.stringify(all)).digest('hex') };
  }
  return result;
}
async function setup() {
  assert.ok(!state.before && !state.users.length, 'Existing run must be cleaned first');
  state.before = await fingerprint(); save();
  for (const role of ['admin','staff','kitchen_staff']) {
    const email = `${state.prefix.toLowerCase()}_${role}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    state.users.push({ id: created.data.user.id, email, password, initialRole: role }); save();
    await rows(service.from('profiles').update({ role, is_active: true, full_name: `${state.prefix}_${role}` })
      .eq('id', created.data.user.id));
  }
  pass('three isolated active TEST role accounts created');
}
async function run() {
  assert.ok(state.before && state.users.length === 3 && !state.cleaned);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const contexts = [];
  const roleUser = role => state.users.find(user => user.initialRole === role);
  async function login(role) {
    const user = roleUser(role);
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    const started = performance.now();
    await page.goto(`${base}/login`);
    await page.getByLabel('อีเมล', { exact: true }).fill(user.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.waitForURL(role === 'kitchen_staff' ? '**/dashboard/kitchen' : '**/dashboard');
    try { await page.locator('aside nav').waitFor({ timeout: 5000 }); }
    catch (error) {
      console.error('Login diagnostic', role, page.url(), (await page.locator('body').innerText()).slice(0, 350),
        'cookies', (await context.cookies()).map(cookie => cookie.name),
        'storage', await page.evaluate(() => Object.keys(localStorage)));
      const retry = await page.goto(`${base}${role === 'kitchen_staff' ? '/dashboard/kitchen' : '/dashboard'}`);
      console.error('Direct dashboard retry', retry.status(), page.url(),
        (await page.locator('body').innerText()).slice(0, 160));
      throw error;
    }
    state.timings ??= {};
    state.timings[role] = Math.round(performance.now() - started); save();
    return { context, page, user };
  }
  async function api(context, method, body) {
    const response = await context.request.fetch(`${base}/api/admin/users`, {
      method, data: body, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
    return { status: response.status(), body: await response.json() };
  }
  async function assertSidebar(page, role) {
    const links = await page.locator('aside nav a').evaluateAll(nodes => nodes.map(node => ({
      href: new URL(node.href).pathname, label: node.textContent.trim(),
    })));
    assert.equal(await page.locator('aside').count(), 1, `${role}: one shared sidebar`);
    assert.equal(links.some(link => link.href === '/dashboard/users'), role === 'admin', role);
    assert.equal(links.length, role === 'admin' ? 10 : role === 'staff' ? 3 : 1, role);
  }
  try {
    const admin = await login('admin');
    assert.equal((await admin.page.goto(`${base}/dashboard`)).status(), 200);
    await assertSidebar(admin.page, 'admin');
    assert.equal(await admin.page.getByRole('heading', { name: 'Dashboard พนักงาน' }).count(), 0);
    await admin.page.reload();
    await assertSidebar(admin.page, 'admin');
    const freshAdminPage = await admin.context.newPage();
    assert.equal((await freshAdminPage.goto(`${base}/dashboard`)).status(), 200);
    await assertSidebar(freshAdminPage, 'admin');
    await freshAdminPage.close();
    pass('admin direct dashboard, refresh and new URL show user management immediately');
    const menu = (await rows(service.from('menus').select('id').limit(1)))[0];
    const ingredient = (await rows(service.from('ingredients').select('id').limit(1)))[0];
    assert.ok(menu && ingredient);
    for (const path of ['/dashboard', '/dashboard/orders', '/dashboard/kitchen', '/dashboard/ready',
      '/dashboard/menus', '/dashboard/menus/new', `/dashboard/menus/${menu.id}/edit`,
      `/dashboard/menus/${menu.id}/options`, '/dashboard/ingredients', '/dashboard/ingredients/new',
      '/dashboard/ingredients/categories', `/dashboard/ingredients/${ingredient.id}/edit`,
      '/dashboard/tables', '/dashboard/addons', '/dashboard/reports', '/dashboard/users']) {
      assert.equal((await admin.page.goto(base + path)).status(), 200, path);
      await assertSidebar(admin.page, 'admin');
      await admin.page.setViewportSize({ width: 375, height: 812 });
      await assertSidebar(admin.page, 'admin');
      await admin.page.setViewportSize({ width: 1280, height: 800 });
    }
    pass('all admin dashboard pages share desktop and mobile sidebar');
    const usersResponse = await admin.page.goto(`${base}/dashboard/users`);
    assert.equal(usersResponse.status(), 200);
    await admin.page.getByRole('heading', { name: 'จัดการผู้ใช้งาน' }).waitFor();
    await admin.page.getByText(roleUser('staff').email).waitFor();
    assert.equal(await admin.page.locator('aside a[href="/dashboard/users"]').count(), 1);
    const list = await api(admin.context, 'GET');
    assert.equal(list.status, 200);
    assert.ok(list.body.users.some(user => user.id === roleUser('staff').id));
    await admin.page.screenshot({ path: `${root}/users-desktop.png`, fullPage: true });
    await admin.page.setViewportSize({ width: 375, height: 812 });
    await assertSidebar(admin.page, 'admin');
    assert.equal(await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await admin.page.screenshot({ path: `${root}/users-mobile.png`, fullPage: true });
    pass('admin users page, list and mobile layout');

    const staff = await login('staff');
    const kitchen = await login('kitchen_staff');
    await assertSidebar(staff.page, 'staff');
    await assertSidebar(kitchen.page, 'kitchen_staff');
    await staff.page.reload();
    await kitchen.page.reload();
    await assertSidebar(staff.page, 'staff');
    await assertSidebar(kitchen.page, 'kitchen_staff');
    await staff.page.setViewportSize({ width: 375, height: 812 });
    await kitchen.page.setViewportSize({ width: 375, height: 812 });
    await assertSidebar(staff.page, 'staff');
    await assertSidebar(kitchen.page, 'kitchen_staff');
    pass('staff and kitchen sidebar permissions persist on refresh and mobile');
    for (const [role, entry, allowed, denied] of [
      ['admin', admin, '/dashboard/users', null],
      ['staff', staff, '/dashboard/orders', '/dashboard/users'],
      ['kitchen_staff', kitchen, '/dashboard/kitchen', '/dashboard/orders'],
    ]) {
      assert.equal((await entry.page.goto(base + allowed)).status(), 200, role);
      await assertSidebar(entry.page, role);
      if (denied) assert.equal((await entry.page.goto(base + denied)).status(), 404, role);
      if (role !== 'admin') assert.equal((await api(entry.context, 'GET')).status, 403);
    }
    pass('admin, staff and kitchen staff page and API permissions');

    const staffUser = roleUser('staff');
    let updated = await api(admin.context, 'PATCH', { id: staffUser.id, action: 'update',
      role: 'kitchen_staff', isActive: true, fullName: `${state.prefix}_changed` });
    assert.equal(updated.status, 200, JSON.stringify(updated));
    assert.equal((await rows(service.from('profiles').select('role,full_name').eq('id', staffUser.id).single())).role, 'kitchen_staff');
    await staff.page.goto(`${base}/dashboard/kitchen`);
    await staff.page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await staff.page.waitForURL('**/login');
    await staff.page.getByLabel('อีเมล', { exact: true }).fill(staffUser.email);
    await staff.page.getByLabel('รหัสผ่าน', { exact: true }).fill(staffUser.password);
    await staff.page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await staff.page.waitForURL('**/dashboard/kitchen');
    await assertSidebar(staff.page, 'kitchen_staff');
    updated = await api(admin.context, 'PATCH', { id: staffUser.id, action: 'update',
      role: 'staff', isActive: true, fullName: `${state.prefix}_staff` });
    assert.equal(updated.status, 200, JSON.stringify(updated));
    await staff.page.getByRole('button', { name: 'ออกจากระบบ' }).click();
    await staff.page.waitForURL('**/login');
    await staff.page.getByLabel('อีเมล', { exact: true }).fill(staffUser.email);
    await staff.page.getByLabel('รหัสผ่าน', { exact: true }).fill(staffUser.password);
    await staff.page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await staff.page.waitForURL('**/dashboard');
    await assertSidebar(staff.page, 'staff');
    pass('sidebar follows changed role after logout and login');
    pass('role and name update through admin API');

    const editor = admin.page.locator('section[aria-label="รายชื่อผู้ใช้งาน"] article')
      .filter({ hasText: staffUser.email });
    await editor.getByRole('textbox', { name: 'ชื่อ' }).fill(`${state.prefix}_ui`);
    await editor.getByRole('combobox', { name: 'Role' }).selectOption('kitchen_staff');
    await editor.getByRole('button', { name: 'บันทึก' }).click();
    await admin.page.getByRole('status').getByText('บันทึกเรียบร้อย').waitFor();
    assert.deepEqual(await rows(service.from('profiles').select('role,full_name').eq('id', staffUser.id).single()),
      { role: 'kitchen_staff', full_name: `${state.prefix}_ui` });
    updated = await api(admin.context, 'PATCH', { id: staffUser.id, action: 'update',
      role: 'staff', isActive: true, fullName: `${state.prefix}_staff` });
    assert.equal(updated.status, 200, JSON.stringify(updated));
    pass('admin page saves role and name changes');

    const oldSession = publicClient();
    assert.ifError((await oldSession.auth.signInWithPassword({ email: staffUser.email, password: staffUser.password })).error);
    assert.ok((await rows(oldSession.from('orders').select('id').limit(1))).length >= 0);
    await editor.getByRole('combobox', { name: 'Role' }).selectOption('staff');
    await editor.getByRole('checkbox').uncheck();
    const disableResponse = admin.page.waitForResponse(response =>
      response.url().endsWith('/api/admin/users') && response.request().method() === 'PATCH');
    await editor.getByRole('button', { name: 'บันทึก' }).click();
    assert.equal((await disableResponse).status(), 200);
    assert.equal((await rows(service.from('profiles').select('is_active').eq('id', staffUser.id).single())).is_active, false);
    assert.deepEqual(await rows(oldSession.from('orders').select('id').limit(1)), []);
    assert.deepEqual(await rows(oldSession.from('profiles').select('id').eq('id', staffUser.id)), []);
    assert.ok((await oldSession.rpc('advance_order_status', {
      p_order_id: '00000000-0000-4000-8000-000000000001', p_expected: 'confirmed', p_next: 'preparing',
    })).error);
    const formerPage = await staff.page.goto(`${base}/dashboard/orders`);
    assert.ok(formerPage.status() !== 200 || !staff.page.url().includes('/dashboard/orders'));
    assert.ok((await publicClient().auth.signInWithPassword({ email: staffUser.email, password: staffUser.password })).error);
    pass('disabled account loses existing session data, RPC and dashboard access; new login blocked');

    await editor.getByRole('checkbox').check();
    const enableResponse = admin.page.waitForResponse(response =>
      response.url().endsWith('/api/admin/users') && response.request().method() === 'PATCH');
    await editor.getByRole('button', { name: 'บันทึก' }).click();
    assert.equal((await enableResponse).status(), 200);
    const recovered = publicClient();
    assert.ifError((await recovered.auth.signInWithPassword({ email: staffUser.email, password: staffUser.password })).error);
    assert.equal((await rows(recovered.from('profiles').select('role').eq('id', staffUser.id).single())).role, 'staff');
    pass('reenabled account can log in again');

    const selfDisable = await api(admin.context, 'PATCH', { id: admin.user.id, action: 'update',
      role: 'staff', isActive: false, fullName: `${state.prefix}_admin` });
    assert.equal(selfDisable.status, 403);
    const replacementPassword = randomBytes(24).toString('base64url');
    const reset = await api(admin.context, 'PATCH', { id: staffUser.id, action: 'set_password',
      password: replacementPassword, confirmPassword: replacementPassword });
    assert.equal(reset.status, 200, JSON.stringify(reset));
    pass('self demotion blocked; TEST password changed without email');

    const inviteEmail = `${state.prefix.toLowerCase()}_invite@example.invalid`;
    state.inviteEmail = inviteEmail; save();
    const accountPassword = randomBytes(24).toString('base64url');
    const invite = await api(admin.context, 'POST', { email: inviteEmail,
      role: 'staff', fullName: `${state.prefix}_invite`, password: accountPassword,
      confirmPassword: accountPassword });
    state.inviteStatus = invite.status; save();
    assert.equal(invite.status, 201, JSON.stringify(invite));
    state.users.push({ id: invite.body.id, email: inviteEmail, initialRole: 'created' }); save();
    assert.equal((await rows(service.from('profiles').select('role,is_active').eq('id', invite.body.id).single())).is_active, true);
    pass('admin creates TEST user without email');

    const guest = await browser.newContext(); contexts.push(guest);
    const publicTable = (await rows(service.from('restaurant_tables').select('id').eq('status', 'available').limit(1)))[0];
    assert.ok(publicTable);
    const qr = await guest.newPage();
    const qrResponse = await qr.goto(`${base}/table/id-${publicTable.id}`);
    assert.equal(qrResponse.status(), 200);
    await qr.locator('body').getByText('ไม่พบโต๊ะ').waitFor({ state: 'hidden' });
    pass('public QR stays available without login');
    console.log(`PERF login+dashboard ready ms: ${JSON.stringify(state.timings)}`);
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
  }
}
async function cleanup() {
  assert.match(state.prefix, /^TEST_ACTIVE_\d+_[a-f0-9]{6}$/);
  assert.ok(state.before && !state.cleaned);
  if (state.inviteEmail && !state.users.some(user => user.email === state.inviteEmail)) {
    for (let page = 1;; page++) {
      const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
      assert.ifError(listed.error);
      for (const user of listed.data.users.filter(user => user.email === state.inviteEmail)) {
        state.users.push({ id: user.id, email: user.email, initialRole: 'invite' }); save();
      }
      if (listed.data.users.length < 100) break;
    }
  }
  for (const user of state.users) {
    assert.ok(user.email.startsWith(state.prefix.toLowerCase()));
    const found = await service.auth.admin.getUserById(user.id);
    if (found.error && found.error.status === 404) continue;
    assert.ifError(found.error);
    assert.equal(found.data.user.email, user.email);
    assert.ifError((await service.auth.admin.deleteUser(user.id)).error);
  }
  state.after = await fingerprint();
  assert.deepEqual(state.after, state.before, 'Original table fingerprints changed');
  const listed = await service.auth.admin.listUsers({ page: 1, perPage: 100 });
  assert.ifError(listed.error);
  assert.ok(!listed.data.users.some(user => user.email?.startsWith(state.prefix.toLowerCase())));
  state.cleaned = true;
  state.users.forEach(user => delete user.password);
  save();
  pass('TEST accounts removed; 20 table fingerprints unchanged');
}
async function verify() {
  assert.equal(state.cleaned, true);
  assert.deepEqual(await fingerprint(), state.after, 'Current table fingerprints changed after cleanup');
  for (const [table, column] of [['menus','name'],['ingredients','name'],['addons','name'],
    ['restaurant_tables','qr_code'],['profiles','full_name']]) {
    assert.deepEqual(await rows(service.from(table).select(column).ilike(column, 'TEST%')), [], table);
  }
  for (let page = 1;; page++) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert.ifError(listed.error);
    assert.ok(!listed.data.users.some(user => /^test[_-]/i.test(user.email ?? '')));
    if (listed.data.users.length < 100) break;
  }
  console.log('PASS current fingerprints match cleanup; no TEST catalog, table, profile or Auth users');
}
try {
  if (process.argv[2] === 'setup') await setup();
  else if (process.argv[2] === 'run') await run();
  else if (process.argv[2] === 'cleanup') await cleanup();
  else if (process.argv[2] === 'verify') await verify();
  else throw new Error('Expected setup, run, cleanup or verify');
} catch (error) { save(); console.error(error); process.exitCode = 1; }
