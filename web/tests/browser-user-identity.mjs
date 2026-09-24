// Isolated app + HTTP/Phoenix fixtures. No hosted database writes or migrations.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, createWriteStream, cpSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startMock } from './helpers/dashboard-mock.mjs';
import { checkLiveDashboard } from './helpers/dashboard-live-checks.mjs';
import { checkSidebarNavigation } from './helpers/sidebar-navigation-checks.mjs';

const navigationOnly = process.argv.includes('--navigation-only');
const dir = navigationOnly ? '.test-artifacts/sidebar-navigation' : '.test-artifacts/user-identity';
const appDir = resolve(`${dir}/app-${Date.now()}`);
mkdirSync(appDir, { recursive: true });
for (const file of ['src', 'public', 'package.json', 'package-lock.json', 'tsconfig.json', 'next-env.d.ts', 'next.config.ts', 'postcss.config.mjs']) {
  cpSync(file, resolve(appDir, file), { recursive: true });
}
const mock = await startMock();
mock.state.delay = 10;
const log = createWriteStream(`${dir}/server.log`);
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4401', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-fixture-key', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-service-key', NEXT_TELEMETRY_DISABLED: '1' };
const app = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '-p', '4400'], { cwd: appDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
app.stdout.pipe(log); app.stderr.pipe(log);
const results = { checks: [] };
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    assert.equal(app.exitCode, null);
    try { if ((await fetch('http://localhost:4400/login', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'isolated app ready');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  await context.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(mock.session())).toString('base64url'), domain: 'localhost', path: '/' }]);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', dialog => dialog.accept());
  if (navigationOnly) {
    await checkSidebarNavigation({ page, context, mock, results, dir });
    console.log('PASS sidebar navigation, active state and permissions on desktop/mobile');
  } else {
  const routes = [
    ['/dashboard', ['admin', 'staff']], ['/dashboard/orders', ['admin', 'staff']],
    ['/dashboard/ready', ['admin', 'staff']], ['/dashboard/kitchen', ['admin', 'kitchen_staff']],
    ...['menus', 'menus/new', 'menus/1/edit', 'menus/1/edit?tab=recipe', 'ingredients', 'ingredients/new', 'ingredients/1/edit', 'ingredients/categories', 'tables', 'addons', 'reports', 'users'].map(p => [`/dashboard/${p}`, ['admin']]),
  ];
  const labels = { admin: 'Admin', staff: 'Staff', kitchen_staff: 'Kitchen Staff' };
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const role of Object.keys(labels)) {
      mock.state.role = role;
      mock.state.fullName = `ชื่อจากโปรไฟล์ ${labels[role]}`;
      for (const [route, allowed] of routes) {
        await page.goto(`http://localhost:4400${route}`);
        if (!allowed.includes(role)) {
          assert.equal(new URL(page.url()).pathname, '/access-denied', `${role} ${route}`);
          assert.equal(await page.locator('aside').count(), 0);
          continue;
        }
        const identity = page.getByLabel('ผู้ใช้งานปัจจุบัน', { exact: true });
        await identity.waitFor();
        assert.deepEqual(await identity.locator('p').allTextContents(), [mock.state.fullName, role], `${role} ${route}`);
        assert.equal(await identity.count(), 1, 'identity appears only once');
        assert.equal(await identity.locator('svg').count(), 1, 'avatar is present');
        const box = await identity.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1, `${route}: identity fits viewport`);
        const navBox = await page.getByRole('navigation', { name: 'เมนูแดชบอร์ด' }).boundingBox();
        const logoutBox = await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).boundingBox();
        assert.ok(box.y >= navBox.y + navBox.height, 'identity follows navigation');
        assert.ok(box.y + box.height <= logoutBox.y, 'identity is above logout');
      }
      results.checks.push(`${width}px ${role}: identity and access on all 16 routes`);
      console.log(results.checks.at(-1));
    }
  }
  mock.state.role = 'admin';
  mock.state.fullName = 'ชื่อยาว'.repeat(40);
  await page.goto('http://localhost:4400/dashboard');
  const overflow = await page.getByLabel('ผู้ใช้งานปัจจุบัน').evaluate(el => el.scrollWidth > el.clientWidth);
  assert.equal(overflow, false, 'long Thai name wraps');
  await page.screenshot({ path: `${dir}/mobile-long-name.png`, fullPage: true });
  mock.state.fullName = null;
  await page.goto('http://localhost:4400/dashboard');
  assert.deepEqual(await page.getByLabel('ผู้ใช้งานปัจจุบัน').locator('p').allTextContents(), ['ผู้ใช้งาน', 'admin']);
  mock.state.fullName = 'Naseefa';
  mock.state.catalog = {
    addons: [{ id: 7, name: 'ไก่กลาง', category: 'meat', additional_price: 10, is_available: true, max_quantity: 1 }],
    menu_options: [{ addon_id: 7, is_available: true }, { addon_id: null, is_available: true }],
    menu_option_groups: [{ kind: 'meat', is_required: true }],
  };
  for (const route of ['/dashboard/menus/1/edit?tab=options', '/dashboard/menus/1/options']) {
    await page.goto(`http://localhost:4400${route}`);
    const tabs = page.getByRole('navigation', { name: 'ส่วนแก้ไขเมนู' });
    assert.equal(await tabs.getByRole('link').count(), 2);
    assert.equal(await page.getByText('กลุ่มตัวเลือก', { exact: true }).count(), 0);
    await page.locator('input[name="name"]').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'ตัวเลือกเนื้อสัตว์', exact: true }).waitFor();
    assert.ok(await page.locator('input[name="addon_ids"][value="7"]').isChecked());
    assert.ok(await page.locator('input[name="meat_required"]').isChecked());
  }
  assert.equal(mock.state.requests.some(r => r.path === '/rest/v1/menu_option_ingredients'), false, 'custom recipes no longer fetched by editor');
  await page.screenshot({ path: `${dir}/mobile-menu.png`, fullPage: true });
  await page.getByRole('button', { name: 'บันทึกข้อมูลเมนู', exact: true }).click();
  await page.getByText('บันทึกข้อมูลเมนูแล้ว', { exact: true }).waitFor();
  const saved = mock.state.rpcCalls.findLast(c => c.path.endsWith('/save_menu_with_addons'));
  assert.deepEqual(saved.body.p_addon_ids, [7]);
  assert.equal(saved.body.p_values.meat_required, true);
  mock.state.catalog = {};
  results.checks.push('long/missing profile names; old option URLs show info; two tabs; central Add-on picker retained');
  mock.state.profileError = true;
  await page.goto('http://localhost:4400/dashboard');
  assert.equal(await page.getByLabel('ผู้ใช้งานปัจจุบัน').count(), 0, 'profile failure must not show previous identity');
  mock.state.profileError = false;
  // This copy is isolated from the workspace; skip the helper's workspace HMR edit.
  await checkLiveDashboard({ context, page, mock, results, mode: 'fixture' });
  console.log('PASS identity, menu UI, roles and live dashboard regression');
  }
} catch (error) {
  results.error = String(error.stack || error);
  console.error(error);
  process.exitCode = 1;
} finally {
  writeFileSync(`${dir}/results.json`, JSON.stringify(results, null, 2));
  await browser?.close();
  app.kill();
  await mock.close();
  log.end();
}
