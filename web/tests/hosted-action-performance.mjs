// Explicit live TEST-only runner. Never runs migrations or mutates existing rows.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

process.loadEnvFile('.env.local');
const mode = process.argv[2] ?? 'dev';
const label = process.argv[3] ?? 'before';
const comparisonOnly = process.argv[5] === 'comparison';
assert.ok(['dev', 'production'].includes(mode));
assert.match(label, /^[a-z0-9-]+$/);
const run = `${label}-${mode}-${Date.now()}`;
const dir = resolve('.test-artifacts/hosted-performance', run);
mkdirSync(dir, { recursive: true });
const prefix = `TEST-perf-${randomBytes(5).toString('hex')}`;
const password = randomBytes(24).toString('base64url') + 'aA1!';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const publicClient = () => createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, options);
const registry = { prefix, users: [], rows: [] };
const result = { run, mode, label, prefix, actions: [], checks: [], errors: [] };
const save = () => {
  writeFileSync(`${dir}/registry.json`, JSON.stringify(registry, null, 2));
  writeFileSync(`${dir}/results.json`, JSON.stringify(result, null, 2));
};
const checked = async promise => { const r = await promise; if (r.error) throw Error(r.error.message); return r.data; };
const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
const hash = x => createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
async function fingerprint() {
  const response = await fetch(`${url}/rest/v1/`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` } });
  assert.ok(response.ok, 'schema inventory');
  const schema = await response.json();
  const tables = Object.keys(schema.paths).filter(p => /^\/\w+$/.test(p)).map(p => p.slice(1));
  const snapshot = {};
  for (const table of tables.sort()) {
    const properties = schema.definitions?.[table]?.properties ?? {};
    const primaryKeys = Object.entries(properties).filter(([, v]) => v.description?.includes('<pk/>')).map(([k]) => k);
    // Views have no PK metadata; order every scalar column for stable pagination.
    const keys = primaryKeys.length ? primaryKeys : Object.entries(properties).filter(([, v]) => ['integer','number','string','boolean'].includes(v.type)).map(([k]) => k);
    assert.ok(keys.length, `pagination requires primary key: ${table}`);
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      let q = db.from(table).select('*');
      for (const key of keys) q = q.order(key);
      const page = await checked(q.range(offset, offset + 499));
      rows.push(...page);
      if (page.length < 500) break;
    }
    snapshot[table] = { count: rows.length, sha256: hash(rows.map(canonical).map(x => JSON.stringify(x)).sort()) };
  }
  const users = [];
  for (let page = 1; ; page++) {
    const data = await checked(db.auth.admin.listUsers({ page, perPage: 500 }));
    users.push(...data.users);
    if (data.users.length < 500) break;
  }
  snapshot.authUsers = { count: users.length, sha256: hash(users.sort((a,b) => a.id.localeCompare(b.id))) };
  return snapshot;
}
async function insert(table, values) {
  const row = await checked(db.from(table).insert(values).select('id').single());
  registry.rows.push({ table, id: row.id }); save(); return row.id;
}
let app, browser, before;
const apps = [];
let variant = 0;
const serverEvents = [];
let serverLog = '';
function launch(args, cwd) {
  const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), ...args], {
    cwd, env: { ...process.env, PERF_LOG: '1', NEXT_TELEMETRY_DISABLED: '1' }, windowsHide: true, stdio: ['ignore','pipe','pipe'],
  });
  let pending = '';
  const collect = chunk => {
    const s = String(chunk); serverLog += s; pending += s;
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      const match = line.match(/\[perf\] supabase (\{.*\})/);
      if (match) serverEvents.push({ end: Date.now(), ...JSON.parse(match[1]) });
      const api = line.match(/\[perf\] admin.users.api (\d+)ms/);
      if (api) serverEvents.push({ end: Date.now(), path: 'admin.users.api', ms: Number(api[1]) });
    }
  };
  child.stdout.on('data', collect); child.stderr.on('data', collect); return child;
}
try {
  before = await fingerprint(); result.before = before; save();
  console.log(JSON.stringify({ run, preflightTables: Object.keys(before).length }));
  const admins = await checked(db.from('profiles').select('id').eq('role', 'admin').eq('is_active', true).limit(1));
  assert.ok(admins.length, 'existing administrator required for TEST provisioning');
  for (const role of ['admin','staff','kitchen_staff']) {
    const email = `${prefix}-${role}@example.invalid`.toLowerCase();
    const data = await checked(db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `${prefix} ${role}` } }));
    registry.users.push({ id: data.user.id, email, role }); save();
    await checked(db.rpc('manage_staff_profile', { p_actor_id: admins[0].id, p_target_id: data.user.id, p_role: role, p_is_active: true, p_full_name: `${prefix} ${role}` }));
  }
  const category = await insert('categories', { name: prefix });
  const ingredient = await insert('ingredients', { name: prefix, unit: 'TEST', stock_quantity: 10, minimum_stock: 0 });
  const menu = await insert('menus', { name: prefix, category_id: category, price: 1, is_available: false });
  const table = await insert('restaurant_tables', { table_number: prefix, qr_code: prefix, status: 'inactive' });
  // Separate source/build directory preserves all existing dev/build files.
  const source = process.argv[4] ?? process.env.PERF_SOURCE_DIR ?? '.';
  const sources = [source, ...(comparisonOnly ? process.argv.slice(6) : [])];
  result.variants = sources;
  for (const [index, variantSource] of sources.entries()) {
  const appDir = `${dir}/${index ? `app-${index}` : 'app'}`; mkdirSync(appDir);
  const source = variantSource;
  result.source = Object.fromEntries(['src/app/login/page.tsx', 'src/app/api/admin/users/route.ts', 'src/lib/dashboard-auth.ts', 'src/lib/supabase/verified-profile.ts'].filter(name => existsSync(`${source}/${name}`)).map(name => [name, hash(readFileSync(`${source}/${name}`, 'utf8'))]));
  for (const name of ['src','public','package.json','tsconfig.json','next-env.d.ts','postcss.config.mjs']) if (existsSync(`${source}/${name}`)) cpSync(`${source}/${name}`, `${appDir}/${name}`, { recursive: true });
  writeFileSync(`${appDir}/next.config.mjs`, `export default { turbopack: { root: ${JSON.stringify(process.cwd())} } };\n`);
  if (mode === 'production') {
    const build = launch(['build'], appDir);
    assert.equal(await new Promise(r => build.on('exit', r)), 0, 'production build');
  }
  app = launch([mode === 'production' ? 'start' : 'dev', '-p', String(4410+index)], appDir);
  apps.push(app);
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(app.exitCode, null, 'app running');
    try { if ((await fetch(`http://localhost:${4410+index}/login`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'app ready');
  }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  const goto = async path => { await page.goto(`http://localhost:${4410+variant}${path}`); await page.waitForTimeout(500); };
  async function measure(name, button, done, double = false) {
    const requests = []; const map = new Map();
    const onRequest = req => {
      if (!['fetch','xhr'].includes(req.resourceType())) return;
      const u = new URL(req.url());
      const item = { path: u.pathname, method: req.method(), start: Date.now(), backend: u.origin === new URL(url).origin };
      requests.push(item); map.set(req, item);
    };
    const onFinished = req => { const item = map.get(req); if (item) item.end = Date.now(); };
    const onResponse = res => { const item = map.get(res.request()); if (item) { item.headersAt = Date.now(); item.status = res.status(); } };
    page.on('request', onRequest); page.on('requestfinished', onFinished); page.on('response', onResponse);
    const initialButtonText = await button.innerText();
    await page.evaluate(({ name, prefix, initialButtonText }) => {
      window.__perfClick = null; window.__perfUI = null;
      document.addEventListener('click', () => {
        window.__perfClick ??= Date.now();
        const observer = new MutationObserver(() => {
          let done = false;
          if (name === 'login') done = location.pathname.startsWith('/dashboard') && !!document.querySelector('main h2');
          if (name === 'ingredient.save') done = location.pathname === '/dashboard/ingredients' && !!document.querySelector('main h2');
          if (name === 'menu.save') done = document.body.innerText.includes('บันทึกข้อมูลเมนูแล้ว');
          if (name === 'user.save') done = [...document.querySelectorAll('[role=status]')].some(e => e.textContent.includes('บันทึกเรียบร้อย'));
          if (name === 'table.toggle') done = [...document.querySelectorAll('article')].filter(e => e.textContent.includes(prefix)).some(e => [...e.querySelectorAll('button')].some(b => b.textContent.trim() === (initialButtonText.trim() === 'เปิดใช้งาน' ? 'ปิดใช้งาน' : 'เปิดใช้งาน')));
          if (done) { window.__perfUI = Date.now(); observer.disconnect(); }
        });
        observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
        setTimeout(() => observer.disconnect(), 30000);
      }, { capture: true, once: true });
    }, { name, prefix, initialButtonText });
    const eventStart = serverEvents.length;
    if (double) await button.evaluate(b => { b.click(); b.click(); }); else await button.click();
    await done();
    const end = Date.now(); const { start, ui } = await page.evaluate(() => ({ start: window.__perfClick, ui: window.__perfUI }));
    assert.ok(start, 'click recorded');
    await page.waitForTimeout(250);
    page.off('request', onRequest); page.off('requestfinished', onFinished); page.off('response', onResponse);
    const backend = serverEvents.slice(eventStart).filter(e => e.end <= end + 50);
    const responseEnd = Math.max(start, ...requests.filter(r => !r.backend && r.end && r.end <= end).map(r => r.end));
    const action = { name, variant, double, start, end, ms: end-start, uiMutationMs: ui ? ui-start : null, uiAfterLastResponseMs: end-responseEnd, requests, backend };
    result.actions.push(action); save(); console.log(JSON.stringify({ name, ms: action.ms }));
    if (double) assert.equal(requests.filter(r => r.method === (name === 'user.save' ? 'PATCH' : 'POST') && !r.backend).length, 1, `${name}: one submitted request`);
    return action;
  }
  async function login(user, measured = false) {
    await context.clearCookies(); await goto('/login');
    await page.locator('#email').fill(user.email); await page.locator('#password').fill(password);
    const done = async () => { await page.waitForURL(`**${user.role === 'kitchen_staff' ? '/dashboard/kitchen' : '/dashboard'}`); await page.locator('h1').first().waitFor(); };
    if (measured) await measure('login', page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }), done);
    else { await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click(); await done(); }
  }
  const admin = registry.users[0], target = registry.users[1];
  if (sources.length > 1) {
    for (let round = 0; round < 9; round++) {
      const order = [...sources.keys()]; if (round % 2) order.reverse();
      for (const index of order) {
        variant = index;
        await login(admin, true);
        await goto('/dashboard/users');
        const editor = page.locator('article').filter({ hasText: target.email });
        await editor.locator('input').first().fill(`${prefix} staff ${round}-${index}`);
        await measure('user.save', editor.getByRole('button', { name: 'บันทึก', exact: true }), () => page.getByRole('status').filter({ hasText: 'บันทึกเรียบร้อย' }).waitFor());
      }
    }
    result.checks.push('Nine rounds per version with alternating version order, same TEST account/database/browser');
  } else {
  for (let i = 0; i < 7; i++) await login(admin, true);
  for (let i = 0; i < 7; i++) {
    await goto('/dashboard/users');
    const editor = page.locator('article').filter({ hasText: target.email });
    await editor.locator('input').first().fill(`${prefix} staff ${i}`);
    await measure('user.save', editor.getByRole('button', { name: 'บันทึก', exact: true }), () => page.getByRole('status').filter({ hasText: 'บันทึกเรียบร้อย' }).waitFor(), i === 6 && !comparisonOnly);
    if (comparisonOnly) continue;
    await goto(`/dashboard/ingredients/${ingredient}/edit`);
    await page.locator('[name=minimum_stock]').fill(String(i));
    await measure('ingredient.save', page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }), async () => { await page.waitForURL('**/dashboard/ingredients'); await page.locator('main h2').first().waitFor(); }, i === 6);
    await goto(`/dashboard/menus/${menu}/edit`);
    await page.locator('[name=price]').fill(String(i + 1));
    await measure('menu.save', page.getByRole('button', { name: 'บันทึกข้อมูลเมนู', exact: true }), () => page.getByText('บันทึกข้อมูลเมนูแล้ว', { exact: true }).waitFor(), i === 6);
    await goto('/dashboard/tables');
    const card = page.locator('article').filter({ hasText: prefix });
    await measure('table.toggle', card.getByRole('button', { name: i % 2 ? 'ปิดใช้งาน' : 'เปิดใช้งาน', exact: true }), () => card.getByRole('button', { name: i % 2 ? 'เปิดใช้งาน' : 'ปิดใช้งาน', exact: true }).waitFor(), i === 6);
  }
  result.checks.push(comparisonOnly ? 'Historical login/user comparison only; seven single-click samples each' : 'Seven samples per action, final write sample double-clicked');
  }
  if (!comparisonOnly) {
  for (const user of registry.users) {
    await login(user);
    for (const route of ['users','menus','ingredients','tables']) {
      await goto(`/dashboard/${route}`);
      assert.equal(new URL(page.url()).pathname, user.role === 'admin' ? `/dashboard/${route}` : '/access-denied');
    }
    if (user.role !== 'admin') {
      const status = await page.evaluate(async id => (await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: 'update', role: 'staff', fullName: 'TEST forbidden', isActive: true }) })).status, target.id);
      assert.equal(status, 403);
      const deniedClient = publicClient();
      await checked(deniedClient.auth.signInWithPassword({ email: user.email, password }));
      const deniedIngredient = await deniedClient.from('ingredients').update({ minimum_stock: 999 }).eq('id', ingredient).select('id');
      assert.ok(deniedIngredient.error || deniedIngredient.data.length === 0, 'ingredient RLS denies non-admin write');
      const deniedTable = await deniedClient.rpc('manage_restaurant_table', { p_id: table, p_number: prefix, p_active: false });
      assert.ok(deniedTable.error, 'table RPC denies non-admin');
      const deniedMenu = await deniedClient.rpc('save_menu_with_addons', { p_id: menu, p_addon_ids: [], p_values: { name: prefix, category_id: category, price: 999, is_available: false } });
      assert.ok(deniedMenu.error, 'menu transaction denies non-admin');
      await deniedClient.auth.signOut({ scope: 'local' });
      const cookieParts = (await context.cookies()).filter(c => /-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b) => a.name.localeCompare(b.name));
      const cookieSession = JSON.parse(Buffer.from(cookieParts.map(c => c.value).join('').slice(7), 'base64url').toString());
      cookieSession.user = { ...cookieSession.user, id: admin.id, role: 'admin' };
      await context.clearCookies();
      await context.addCookies([{ name: cookieParts[0].name.replace(/\.\d+$/, ''), value: 'base64-'+Buffer.from(JSON.stringify(cookieSession)).toString('base64url'), domain: 'localhost', path: '/' }]);
      await goto('/dashboard/users');
      assert.equal(new URL(page.url()).pathname, '/access-denied', 'forged cookie user cannot grant admin access');
    }
    result.checks.push(`${user.role}: four admin routes and unauthorized user write guarded`);
  }
  await login(admin);
  await goto('/dashboard/users');
  await context.route('**/api/admin/users', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'TEST retry' }) }) : route.continue());
  const editor = page.locator('article').filter({ hasText: target.email });
  await editor.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'เชื่อมต่อระบบไม่สำเร็จ' }).waitFor();
  await context.unroute('**/api/admin/users');
  await editor.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'บันทึกเรียบร้อย' }).waitFor();
  result.checks.push('User API failure unlocks; retry succeeds against hosted Supabase');
  for (const [path, buttonName, success] of [
    [`/dashboard/ingredients/${ingredient}/edit`, 'บันทึกการแก้ไข', '/dashboard/ingredients'],
    [`/dashboard/menus/${menu}/edit`, 'บันทึกข้อมูลเมนู', 'บันทึกข้อมูลเมนูแล้ว'],
  ]) {
    await goto(path);
    await context.route(`**${path}`, route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'ดำเนินการไม่สำเร็จ' }).waitFor();
    await context.unroute(`**${path}`);
    await page.getByRole('button', { name: buttonName, exact: true }).click();
    if (success.startsWith('/')) await page.waitForURL(`**${success}`);
    else await page.getByText(success, { exact: true }).waitFor();
  }
  await goto('/dashboard/tables');
  const testCard = page.locator('article').filter({ hasText: prefix });
  await context.route('**/dashboard/tables', route => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await testCard.getByRole('button', { name: 'ปิดใช้งาน', exact: true }).click();
  await testCard.getByRole('alert').waitFor();
  await context.unroute('**/dashboard/tables');
  await testCard.getByRole('button', { name: 'ปิดใช้งาน', exact: true }).click();
  await testCard.getByRole('button', { name: 'เปิดใช้งาน', exact: true }).waitFor();
  // Restore this TEST table for the isolated Realtime order below.
  await testCard.getByRole('button', { name: 'เปิดใช้งาน', exact: true }).click();
  await testCard.getByRole('button', { name: 'ปิดใช้งาน', exact: true }).waitFor();
  result.checks.push('Ingredient/menu/table network failure unlocks; retry commits successfully');
  await context.clearCookies(); await goto('/dashboard/users');
  assert.equal(new URL(page.url()).pathname, '/login');
  result.checks.push('Missing session redirects to login');
  await login(admin);
  // Force the SDK expiry boundary using a real refresh token. No JWT signature is forged.
  async function expireCookie() {
    const cookies = (await context.cookies()).filter(c => /-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b) => a.name.localeCompare(b.name));
    assert.ok(cookies.length, 'SSR session cookie');
    const encoded = cookies.map(c => c.value).join('');
    const session = JSON.parse(Buffer.from(encoded.slice('base64-'.length), 'base64url').toString());
    session.expires_at = Math.floor(Date.now()/1000)-120;
    const value = 'base64-'+Buffer.from(JSON.stringify(session)).toString('base64url');
    const baseName = cookies[0].name.replace(/\.\d+$/, '');
    await context.clearCookies();
    await context.addCookies([{ name: baseName, value, domain: 'localhost', path: '/' }]);
    return { session, value };
  }
  const expired = await expireCookie();
  await goto('/dashboard/users');
  assert.equal(new URL(page.url()).pathname, '/dashboard/users');
  assert.notEqual((await context.cookies()).filter(c => c.name.includes('-auth-token')).map(c => c.value).join(''), expired.value);
  result.checks.push('Forced SDK expiry with genuine hosted refresh token refreshes and persists cookie');
  const revoked = await expireCookie();
  await checked(db.auth.admin.signOut(revoked.session.access_token, 'global'));
  await goto('/dashboard/users');
  assert.equal(new URL(page.url()).pathname, '/login');
  result.checks.push('Revoked hosted refresh token at expiry redirects to login');
  await login(admin);
  const order = await insert('orders', { table_id: table, dining_type: 'dine_in', status: 'confirmed', total_amount: 0, note: prefix });
  await goto('/dashboard/kitchen');
  await page.getByText(`หมายเหตุออเดอร์: ${prefix}`, { exact: true }).waitFor();
  let postgresFrame = false;
  // Observe genuine server frames; the existing poll alone cannot pass this assertion.
  page.on('websocket', socket => socket.on('framereceived', event => { if (String(event.payload).includes('postgres_changes') && String(event.payload).includes(String(order))) postgresFrame = true; }));
  await page.reload(); await page.getByText(`หมายเหตุออเดอร์: ${prefix}`, { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  await checked(db.from('orders').update({ note: `${prefix} realtime`, updated_at: new Date().toISOString() }).eq('id', order));
  await page.getByText(`หมายเหตุออเดอร์: ${prefix} realtime`, { exact: true }).waitFor();
  assert.ok(postgresFrame, 'hosted postgres_changes frame observed');
  result.checks.push('Hosted Realtime postgres_changes updates TEST order in kitchen UI');
  }
  save();
} catch (error) {
  result.errors.push(String(error.stack ?? error)); console.error(String(error.message)); process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of apps) if (child.exitCode === null) { child.kill(); await new Promise(r => { child.once('exit', r); setTimeout(r, 3000); }); }
  writeFileSync(`${dir}/server.log`, serverLog);
  // Delete only IDs created and persisted by this invocation, checking ownership first.
  for (const row of [...registry.rows].reverse()) {
    try {
      const current = await checked(db.from(row.table).select('*').eq('id', row.id).single());
      if (row.table === 'orders') assert.ok([prefix, `${prefix} realtime`].includes(current.note), 'TEST order ownership');
      else assert.equal(current.name ?? current.table_number, prefix, 'TEST ownership');
      if (row.table === 'restaurant_tables') await checked(db.from('restaurant_table_aliases').delete().eq('table_id', row.id).eq('table_number', prefix));
      await checked(db.from(row.table).delete().eq('id', row.id));
    } catch (e) { result.errors.push(`cleanup ${row.table}: ${e.message}`); process.exitCode = 1; }
  }
  for (const user of [...registry.users].reverse()) {
    try {
      const current = await checked(db.auth.admin.getUserById(user.id));
      assert.equal(current.user.email, user.email, 'TEST ownership');
      await checked(db.auth.admin.deleteUser(user.id));
    } catch (e) { result.errors.push(`cleanup user: ${e.message}`); process.exitCode = 1; }
  }
  if (before) {
    try {
      result.after = await fingerprint();
      result.fingerprintChanges = Object.keys(before).filter(k => JSON.stringify(before[k]) !== JSON.stringify(result.after[k]));
      assert.deepEqual(result.fingerprintChanges, [], 'existing data fingerprint unchanged');
    } catch (e) { result.errors.push(`fingerprint: ${e.message}`); process.exitCode = 1; }
  }
  save(); console.log(JSON.stringify({ run, actions: result.actions.length, errors: result.errors.length, fingerprintChanges: result.fingerprintChanges }));
}
