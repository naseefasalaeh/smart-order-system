// Live account lifecycle. No email is sent and no test password is written to disk.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

assert.ok(process.argv.includes('--remote-test'), 'Requires --remote-test');
process.loadEnvFile('.env.local');
const base = process.env.USER_LIFECYCLE_BASE_URL ?? 'http://localhost:3103';
const root = '.test-artifacts/user-lifecycle-live';
mkdirSync(root, { recursive: true });
const registry = `${root}/registry.json`;
const state = existsSync(registry) ? JSON.parse(readFileSync(registry, 'utf8')) : {
  prefix: `TEST_USERS_${Date.now()}_${randomBytes(3).toString('hex')}`, users: [], checks: [],
};
const save = () => writeFileSync(registry, JSON.stringify(state, null, 2));
const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const data = async query => { const result = await query; assert.ifError(result.error); return result.data; };
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
      const batch = await data(query.range(offset, offset + 999));
      all.push(...batch);
      if (batch.length < 1000) break;
    }
    result[table] = { count: all.length, hash: createHash('sha256').update(JSON.stringify(all)).digest('hex') };
  }
  return result;
}

async function registerCreated(email) {
  for (let page = 1;; page++) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert.ifError(listed.error);
    for (const user of listed.data.users.filter(user => user.email === email)) {
      if (!state.users.some(item => item.id === user.id)) { state.users.push({ id: user.id, email }); save(); }
    }
    if (listed.data.users.length < 100) break;
  }
}

async function cleanup() {
  assert.match(state.prefix, /^TEST_USERS_\d+_[a-f0-9]{6}$/);
  assert.ok(state.before);
  const managedEmail = `${state.prefix.toLowerCase()}_managed@example.invalid`;
  await registerCreated(managedEmail);
  for (const user of state.users) {
    assert.ok(user.email.startsWith(state.prefix.toLowerCase()));
    const found = await service.auth.admin.getUserById(user.id);
    if (found.error?.status === 404) continue;
    assert.ifError(found.error);
    assert.equal(found.data.user.email, user.email);
    assert.ifError((await service.auth.admin.deleteUser(user.id)).error);
  }
  state.after = await fingerprint();
  assert.deepEqual(state.after, state.before, 'Original table fingerprints changed');
  state.cleaned = true; save();
  pass('registered TEST users removed and 20 table fingerprints restored');
}

async function verify() {
  assert.equal(state.cleaned, true);
  assert.deepEqual(await fingerprint(), state.after);
  for (let page = 1;; page++) {
    const listed = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert.ifError(listed.error);
    assert.ok(!listed.data.users.some(user => user.email?.startsWith(state.prefix.toLowerCase())));
    if (listed.data.users.length < 100) break;
  }
  console.log('PASS cleanup verified; no run TEST Auth users remain');
}

async function run() {
  assert.ok(!state.before && !state.users.length, 'Use cleanup for the existing run');
  state.before = await fingerprint(); save();
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const contexts = [];
  async function makeRole(role) {
    const email = `${state.prefix.toLowerCase()}_${role}@example.invalid`;
    const password = randomBytes(24).toString('base64url');
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    state.users.push({ id: created.data.user.id, email }); save();
    await data(service.from('profiles').update({ role, is_active: true, full_name: `${state.prefix}_${role}` })
      .eq('id', created.data.user.id));
    return { id: created.data.user.id, email, password };
  }
  async function login(user, target) {
    const context = await browser.newContext(); contexts.push(context);
    const page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.goto(`${base}/login`);
    await page.getByLabel('อีเมล', { exact: true }).fill(user.email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.waitForURL(`**${target}`);
    await page.locator('aside nav').waitFor();
    return { context, page };
  }
  async function api(context, method, body) {
    const response = await context.request.fetch(`${base}/api/admin/users`, {
      method, data: body, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    });
    return { status: response.status(), body: await response.json() };
  }
  try {
    const adminUser = await makeRole('admin');
    const staffUser = await makeRole('staff');
    const kitchenUser = await makeRole('kitchen_staff');
    const admin = await login(adminUser, '/dashboard');
    await admin.page.goto(`${base}/dashboard/users`);
    await admin.page.getByRole('heading', { name: 'เพิ่มผู้ใช้งาน' }).waitFor();
    const staff = await login(staffUser, '/dashboard');
    const kitchen = await login(kitchenUser, '/dashboard/kitchen');
    for (const entry of [staff, kitchen]) {
      for (const method of ['GET','POST','PATCH','DELETE']) {
        assert.equal((await api(entry.context, method, method === 'GET' ? undefined : {})).status, 403, method);
      }
      assert.equal((await entry.page.goto(`${base}/dashboard/users`)).status(), 404);
    }
    pass('Staff and Kitchen Staff denied all user API methods and user page');

    const managedEmail = `${state.prefix.toLowerCase()}_managed@example.invalid`;
    const initialPassword = randomBytes(24).toString('base64url');
    const createForm = admin.page.locator('form').filter({ has: admin.page.getByRole('heading', { name: 'เพิ่มผู้ใช้งาน' }) });
    await createForm.getByLabel('Email').fill(managedEmail);
    await createForm.getByLabel('ชื่อ').fill(`${state.prefix}_managed`);
    await createForm.getByLabel('Role').selectOption('staff');
    await createForm.getByLabel('รหัสผ่าน', { exact: true }).fill(initialPassword);
    await createForm.getByLabel('ยืนยันรหัสผ่าน').fill(initialPassword);
    const createdResponse = admin.page.waitForResponse(response =>
      response.url().endsWith('/api/admin/users') && response.request().method() === 'POST');
    await createForm.getByRole('button', { name: 'เพิ่มผู้ใช้งาน' }).click();
    const creation = await createdResponse;
    assert.equal(creation.status(), 201, await creation.text());
    const created = await creation.json();
    state.users.push({ id: created.id, email: managedEmail }); save();
    const credentials = admin.page.getByRole('region', { name: 'ข้อมูลเข้าสู่ระบบครั้งเดียว' });
    await credentials.getByText(managedEmail).waitFor();
    await credentials.getByText(initialPassword).waitFor();
    assert.equal(await admin.page.evaluate(secret => Object.values(localStorage).some(value => value.includes(secret)), initialPassword), false);
    const listed = await api(admin.context, 'GET');
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.body).includes(initialPassword), false);
    const profile = await data(service.from('profiles').select('*').eq('id', created.id).single());
    assert.equal(profile.is_active, true);
    assert.equal(profile.role, 'staff');
    assert.equal(JSON.stringify(profile).includes(initialPassword), false);
    const auth = await service.auth.admin.getUserById(created.id);
    assert.ifError(auth.error);
    assert.ok(auth.data.user.email_confirmed_at);
    assert.equal(JSON.stringify(auth.data.user.user_metadata).includes(initialPassword), false);
    pass('Admin created confirmed active user; credentials displayed once and absent from profile, metadata, GET and localStorage');

    const managed = await login({ email: managedEmail, password: initialPassword }, '/dashboard');
    assert.equal(managed.page.url().endsWith('/dashboard'), true);
    await admin.page.reload();
    assert.equal(await admin.page.getByRole('region', { name: 'ข้อมูลเข้าสู่ระบบครั้งเดียว' }).count(), 0);
    pass('new user logged in immediately without email; one-time credentials disappeared on reload');

    const editor = admin.page.locator('article').filter({ hasText: managedEmail });
    await editor.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่' }).click();
    const nextPassword = randomBytes(24).toString('base64url');
    await editor.getByLabel('รหัสผ่านใหม่', { exact: true }).fill(nextPassword);
    await editor.getByLabel('ยืนยันรหัสผ่านใหม่').fill(nextPassword);
    const changedResponse = admin.page.waitForResponse(response =>
      response.url().endsWith('/api/admin/users') && response.request().method() === 'PATCH');
    await editor.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่' }).click();
    assert.equal((await changedResponse).status(), 200);
    assert.ok((await publicClient().auth.signInWithPassword({ email: managedEmail, password: initialPassword })).error);
    assert.ifError((await publicClient().auth.signInWithPassword({ email: managedEmail, password: nextPassword })).error);
    const freshLogin = await login({ email: managedEmail, password: nextPassword }, '/dashboard');
    assert.equal(freshLogin.page.url().endsWith('/dashboard'), true);
    pass('Admin set new password; old password rejected and new password logged in immediately');

    assert.equal((await api(admin.context, 'DELETE', { id: adminUser.id, confirmationEmail: adminUser.email })).status, 403);
    assert.equal((await api(admin.context, 'DELETE', { id: created.id, confirmationEmail: 'wrong@example.invalid' })).status, 400);
    await editor.getByRole('button', { name: 'ลบผู้ใช้' }).click();
    const confirm = editor.getByLabel('Email ยืนยัน');
    await confirm.fill('wrong@example.invalid');
    assert.equal(await editor.getByRole('button', { name: 'ยืนยันลบผู้ใช้' }).isDisabled(), true);
    await confirm.fill(managedEmail);
    const deletedResponse = admin.page.waitForResponse(response =>
      response.url().endsWith('/api/admin/users') && response.request().method() === 'DELETE');
    await editor.getByRole('button', { name: 'ยืนยันลบผู้ใช้' }).click();
    assert.equal((await deletedResponse).status(), 200);
    assert.ok((await publicClient().auth.signInWithPassword({ email: managedEmail, password: nextPassword })).error);
    assert.deepEqual(await data(service.from('profiles').select('id').eq('id', created.id)), []);
    assert.deepEqual(await data(publicClient().from('profiles').select('id').eq('id', created.id)), []);
    pass('wrong confirmation and self-delete blocked; typed Email deleted user and login failed');
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
    await cleanup();
  }
}

try {
  if (process.argv[2] === 'run') await run();
  else if (process.argv[2] === 'cleanup') await cleanup();
  else if (process.argv[2] === 'verify') await verify();
  else throw new Error('Expected run, cleanup or verify');
} catch (error) { save(); console.error(error); process.exitCode = 1; }
