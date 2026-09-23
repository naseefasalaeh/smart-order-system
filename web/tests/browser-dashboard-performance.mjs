// Isolated HTTP fixtures only. Next may load .env.local, but the child environment
// overrides every Supabase URL/key used by this app before Next starts.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startMock } from './helpers/dashboard-mock.mjs';
import { resolve } from 'node:path';
import { checkLiveDashboard } from './helpers/dashboard-live-checks.mjs';

const phase = process.argv[2] || 'after';
const mode = process.argv[3] || 'dev';
const liveOnly = process.argv[4] === 'live-only';
const dir = `.test-artifacts/dashboard-performance/${process.env.PERF_RUN_LABEL || phase}-${mode}${liveOnly ? '-live-only' : ''}`;
const rounds = Number(process.env.PERF_ROUNDS || 1);
const addonOnly = process.env.PERF_ADDON_ONLY === '1';
mkdirSync(dir, { recursive: true });
const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:4401', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-fixture-key', SUPABASE_SERVICE_ROLE_KEY: 'local-fixture-service-key', NEXT_TELEMETRY_DISABLED: '1', PERF_LOG: '1' };
const mock = await startMock();
const log = createWriteStream(`${dir}/server.log`);
function launch(args) {
  const child = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), ...args], { cwd: process.env.PERF_APP_DIR || process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  return child;
}
let app, browser;
const results = { phase, mode, fixtureLatencyMs: mock.state.delay, actions: [], checks: [] };
try {
  if (mode === 'production' && process.env.PERF_SKIP_BUILD !== '1') {
    const build = launch(['build']);
    assert.equal(await new Promise(resolve => build.on('exit', resolve)), 0, 'build');
  }
  app = launch([mode === 'production' ? 'start' : 'dev', '-p', '4400']);
  let ready = false;
  for (let i=0;i<120;i++) {
    assert.equal(app.exitCode, null, 'fixture app must stay running');
    try { if ((await fetch('http://localhost:4400/login', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'fixture app ready on port 4400');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    return ['localhost', '127.0.0.1'].includes(host) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('dialog', d => d.accept());
  async function goto(path) { await page.goto(`http://localhost:4400${path}`); await page.waitForTimeout(650); }
  async function serveIfRequired() {
    if (phase !== 'after') return;
    await goto('/dashboard/ready');
    await page.getByRole('button', { name: /^(เสิร์ฟแล้ว|ส่งมอบแล้ว)$/ }).click();
    await page.locator('article').waitFor({ state: 'hidden' });
  }
  async function measure(name, click, done) {
    mock.state.requests.length = 0;
    await page.evaluate(name => {
      window.__resultObserver?.disconnect();
      window.__resultMutation = null;
      const action = name.replace(/^mobile\./, '');
      const initialTableButton = [...document.querySelectorAll('button')].find(b => ['เปิดใช้งาน', 'ปิดใช้งาน'].includes(b.textContent.trim()))?.textContent.trim();
      window.__resultObserver = new MutationObserver(() => {
        if (window.__actionClick == null) return;
        const buttons = [...document.querySelectorAll('button')].map(b => b.textContent.trim());
        const text = document.body.innerText;
        const complete = action === 'login' ? location.pathname.startsWith('/dashboard') && !!document.querySelector('main h2')
          : action === 'kitchen.start' ? buttons.includes('อาหารพร้อมเสิร์ฟ')
          : action === 'kitchen.ready' ? text.includes('อาหารพร้อมเสิร์ฟ รอพนักงาน') || text.includes('อาหารพร้อมเสิร์ฟ กรุณารับชำระเงิน')
          : action === 'orders.payment' ? !document.querySelector('article')
          : action === 'ingredient.save' ? location.pathname === '/dashboard/ingredients' && !!document.querySelector('main h2')
          : action === 'menu.save' ? text.includes('บันทึกข้อมูลเมนูแล้ว')
          : action === 'addon.save' ? text.includes('บันทึกตัวเลือกเสริมกลางแล้ว')
          : action === 'table.toggle' ? buttons.includes(initialTableButton === 'เปิดใช้งาน' ? 'ปิดใช้งาน' : 'เปิดใช้งาน')
          : action === 'user.save' ? text.includes('บันทึกเรียบร้อย')
          : action === 'user.password' ? text.includes('ตั้งรหัสผ่านใหม่แล้ว') : false;
        if (complete) { window.__resultMutation = performance.now() - window.__actionClick; window.__resultObserver.disconnect(); }
      });
      window.__resultObserver.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
    }, name);
    await page.evaluate(() => {
      window.__actionClick = null; window.__actionFeedback = null;
      document.addEventListener('click', event => {
        window.__actionClick = performance.now();
        window.__actionEpoch = performance.timeOrigin + window.__actionClick;
        const button = event.target.closest('button');
        const observer = new MutationObserver(() => {
          if (button?.disabled && button.textContent.includes('กำลังดำเนินการ')) {
            window.__actionFeedback = performance.now()-window.__actionClick;
            observer.disconnect();
          }
        });
        observer.observe(document.body, { subtree: true, attributes: true, childList: true, characterData: true });
        setTimeout(() => observer.disconnect(), 5000);
      }, { once: true, capture: true });
    });
    const requests = [];
    const listener = req => { if (['fetch','xhr'].includes(req.resourceType())) requests.push({ method: req.method(), path: new URL(req.url()).pathname, startedMs: Math.round(performance.now()-start) }); };
    const responses = [];
    const responseListener = res => { if (['fetch','xhr'].includes(res.request().resourceType())) responses.push({ path: new URL(res.url()).pathname, completedMs: Math.round(performance.now()-start), status: res.status() }); };
    page.on('request', listener);
    page.on('response', responseListener);
    const start = performance.now();
    await click();
    const pendingButton = page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).first();
    const feedback = await pendingButton.count() > 0 && await pendingButton.isDisabled();
    const clickDelay = await page.evaluate(() => performance.now()-window.__actionClick);
    const setupMs = Math.round(performance.now()-start-clickDelay);
    await done();
    const ms = await page.evaluate(() => Math.round(performance.now()-window.__actionClick));
    const feedbackMs = await page.evaluate(() => window.__actionFeedback == null ? null : Math.round(window.__actionFeedback));
    if (phase === 'after') {
      assert.ok(feedback, `${name}: button disables while pending`);
      assert.notEqual(feedbackMs, null, `${name}: pending text observed`);
    }
    await page.waitForTimeout(400);
    page.off('request', listener);
    page.off('response', responseListener);
    const clickEpochMs = await page.evaluate(() => window.__actionEpoch);
    const uiMutationMs = await page.evaluate(() => window.__resultMutation);
    results.actions.push({ name, ms, uiMutationMs, setupMs, clickEpochMs, viewport: page.viewportSize().width, feedback, feedbackMs, requests, responses, backend: [...mock.state.requests] });
    console.log(name, ms);
  }
  if (addonOnly) {
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-'+Buffer.from(JSON.stringify(mock.session())).toString('base64url'), domain: 'localhost', path: '/' }]);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      for (let round = 0; round < rounds; round++) {
        await goto('/dashboard/addons');
        await page.getByText('+ เพิ่มตัวเลือกเสริม', { exact: true }).click();
        const form = page.locator('form').filter({ has: page.locator('input[name="max_quantity"]') });
        await form.locator('[name=category]').selectOption('topping');
        await form.locator('[name=name]').fill(`TEST addon ${round}`);
        await form.locator('[name=is_available]').uncheck();
        await measure(width === 375 ? 'mobile.addon.save' : 'addon.save',
          () => form.getByRole('button', { name: 'บันทึกตัวเลือกเสริม', exact: true }).evaluate(b => b.click()),
          () => page.getByText('บันทึกตัวเลือกเสริมกลางแล้ว', { exact: true }).waitFor());
      }
    }
    results.checks.push('Repeated desktop/mobile Add-on saves');
  } else if (liveOnly) {
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-'+Buffer.from(JSON.stringify(mock.session())).toString('base64url'), domain: 'localhost', path: '/' }]);
    await checkLiveDashboard({ context, page, mock, results, mode });
  } else {
  for (let round = 0; round < rounds; round++) {
  mock.state.status = 'confirmed'; mock.state.updatedAt = new Date().toISOString();
  await context.clearCookies();
  await goto('/login');
  await page.locator('#email').fill('admin@example.invalid'); await page.locator('#password').fill('test-password-only');
  await measure('login', () => page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click(), () => page.waitForURL('**/dashboard'));
  await goto('/dashboard/kitchen');
  await page.getByRole('heading', { name: 'คิวครัว' }).waitFor();
  await measure('kitchen.start', () => page.getByRole('button', { name: 'เริ่มทำอาหาร' }).click(), () => page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).waitFor());
  await measure('kitchen.ready', () => page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).click(), () => page.getByText(/อาหารพร้อมเสิร์ฟ (รอพนักงาน|กรุณารับชำระเงิน)/).waitFor());
  await serveIfRequired();
  await goto('/dashboard/orders');
  await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
  await measure('orders.payment', () => page.getByRole('button', { name: 'เงินสด', exact: true }).click(), () => page.locator('article').waitFor({ state: 'hidden' }));
  await goto('/dashboard/ingredients/1/edit');
  await measure('ingredient.save', () => page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click(), () => page.waitForURL('**/dashboard/ingredients'));
  await goto('/dashboard/menus/1/edit');
  await measure('menu.save', () => page.getByRole('button', { name: 'บันทึกข้อมูลเมนู', exact: true }).click(), () => page.getByText('บันทึกข้อมูลเมนูแล้ว', { exact: true }).waitFor());
  await goto('/dashboard/tables');
  const tableBefore = round % 2 ? 'เปิดใช้งาน' : 'ปิดใช้งาน';
  const tableAfter = round % 2 ? 'ปิดใช้งาน' : 'เปิดใช้งาน';
  await measure('table.toggle', () => page.getByRole('button', { name: tableBefore, exact: true }).click(), () => page.getByRole('button', { name: tableAfter, exact: true }).waitFor());
  await goto('/dashboard/users');
  const editor = page.locator('article').last();
  await editor.locator('input').first().fill('TEST edited');
  await measure('user.save', () => editor.getByRole('button', { name: 'บันทึก', exact: true }).click(), () => page.getByText('บันทึกเรียบร้อย', { exact: true }).waitFor());
  }
  // Demonstrate whether transient profile failures are incorrectly treated as missing routes.
  mock.state.profileError = true;
  await goto('/dashboard/kitchen');
  results.profileFailure = { statusText: await page.locator('body').innerText() };
  mock.state.profileError = false;
  if (phase === 'after') {
    assert.match(results.profileFailure.statusText, /โหลดข้อมูลไม่สำเร็จชั่วคราว/);
    await page.getByRole('button', { name: 'ลองใหม่', exact: true }).click();
    await page.getByRole('heading', { name: 'คิวครัว' }).waitFor();
    results.checks.push('profile 503 shows retry, session retained, retry recovers');
    for (const role of ['admin', 'kitchen_staff']) {
      mock.state.role = role;
      await goto('/dashboard/kitchen');
      await page.getByRole('heading', { name: 'คิวครัว' }).waitFor();
      await page.reload();
      await page.getByRole('heading', { name: 'คิวครัว' }).waitFor();
      results.checks.push(`${role}: direct URL + refresh`);
    }
    mock.state.role = 'staff';
    await goto('/dashboard/kitchen');
    assert.equal(new URL(page.url()).pathname, '/access-denied');
    mock.state.role = 'admin'; mock.state.active = false;
    await goto('/dashboard/kitchen');
    assert.equal(new URL(page.url()).pathname, '/access-denied');
    mock.state.active = true;
    results.checks.push('staff and inactive accounts redirect to access-denied, no 404');
    mock.state.authError = true;
    await goto('/dashboard/kitchen');
    await page.getByText('โหลดข้อมูลไม่สำเร็จชั่วคราว', { exact: true }).waitFor();
    mock.state.authError = false;
    await goto('/dashboard/kitchen');
    results.checks.push('temporary Auth 503 retains session and recovers');
    for (const resource of ['menus', 'ingredients']) {
      mock.state.queryError = resource;
      await goto(`/dashboard/${resource}/1/edit`);
      await page.getByText('โหลดข้อมูลไม่สำเร็จชั่วคราว', { exact: true }).waitFor();
      mock.state.queryError = '';
      await goto(`/dashboard/${resource}/999/edit`);
      assert.match(await page.locator('body').innerText(), /404/);
    }
    results.checks.push('all remaining notFound calls: absent record only, query 503 is retryable');
    mock.state.status = 'ready';
    await goto('/dashboard/ready');
    await page.getByRole('heading', { name: 'พร้อมเสิร์ฟ', exact: true }).waitFor();
    await page.waitForTimeout(6000); // Establish the lightweight polling version.
    mock.state.requests.length = 0;
    await page.waitForTimeout(11000);
    assert.equal(mock.state.requests.filter(r => r.path === '/auth/v1/user').length, 0);
    results.checks.push('ready page idle: no full-page/auth reload while unchanged (11 seconds)');
    mock.state.status = 'confirmed'; mock.state.updatedAt = new Date().toISOString();
    await goto('/dashboard/kitchen');
    mock.state.failWrite = true;
    const startButton = page.getByRole('button', { name: 'เริ่มทำอาหาร', exact: true });
    await startButton.click();
    await page.getByText('เปลี่ยนสถานะไม่สำเร็จ กรุณาลองใหม่', { exact: false }).waitFor();
    assert.equal(await startButton.isEnabled(), true);
    mock.state.failWrite = false;
    results.checks.push('failed order RPC shows Thai error and restores button');
    await context.clearCookies();
    await goto('/dashboard/kitchen');
    assert.equal(new URL(page.url()).pathname, '/login');
    // Expired SSR cookie must be refreshed by Proxy and persisted back to browser.
    const expired = mock.session();
    const parts = expired.access_token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: expired.user.id, role: 'authenticated', exp: Math.floor(Date.now()/1000)-120 })).toString('base64url');
    expired.access_token = parts.join('.'); expired.expires_at = Math.floor(Date.now()/1000)-120;
    await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-'+Buffer.from(JSON.stringify(expired)).toString('base64url'), domain: 'localhost', path: '/' }]);
    mock.state.requests.length = 0;
    await goto('/dashboard/kitchen');
    await page.getByRole('heading', { name: 'คิวครัว' }).waitFor();
    assert.ok(mock.state.requests.some(r => r.path === '/auth/v1/token'));
    assert.ok((await context.cookies()).some(c => c.name.startsWith('sb-127-auth-token') && c.value !== 'base64-'+Buffer.from(JSON.stringify(expired)).toString('base64url')));
    results.checks.push('missing session goes to login; expired session refreshes and writes cookie');
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await goto('/dashboard/kitchen');
  {
    mock.state.status = 'confirmed'; await goto('/dashboard/kitchen');
    await measure('mobile.kitchen.start', () => page.getByRole('button', { name: 'เริ่มทำอาหาร' }).click(), () => page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).waitFor());
    await measure('mobile.kitchen.ready', () => page.getByRole('button', { name: 'อาหารพร้อมเสิร์ฟ', exact: true }).click(), () => page.getByText(/อาหารพร้อมเสิร์ฟ (รอพนักงาน|กรุณารับชำระเงิน)/).waitFor());
    await serveIfRequired();
    await goto('/dashboard/orders'); await page.getByRole('button', { name: 'รับชำระเงิน', exact: true }).click();
    await measure('mobile.orders.payment', () => page.getByRole('button', { name: 'เงินสด', exact: true }).click(), () => page.locator('article').waitFor({ state: 'hidden' }));
    await goto('/dashboard/ingredients/1/edit');
    await measure('mobile.ingredient.save', () => page.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click(), () => page.waitForURL('**/dashboard/ingredients'));
    await goto('/dashboard/menus/1/edit');
    await measure('mobile.menu.save', () => page.getByRole('button', { name: 'บันทึกข้อมูลเมนู', exact: true }).click(), () => page.getByText('บันทึกข้อมูลเมนูแล้ว', { exact: true }).waitFor());
    await goto('/dashboard/tables');
    await measure('mobile.table.toggle', () => page.getByRole('button', { name: 'เปิดใช้งาน', exact: true }).click(), () => page.getByRole('button', { name: 'ปิดใช้งาน', exact: true }).waitFor());
    await goto('/dashboard/users');
    {
      const editor = page.locator('article').last();
      await editor.getByRole('button', { name: 'ตั้งรหัสผ่านใหม่', exact: true }).click();
      await editor.locator('input[type=password]').nth(0).fill('test-password-only');
      await editor.locator('input[type=password]').nth(1).fill('test-password-only');
      await measure('mobile.user.password', () => editor.getByRole('button', { name: 'บันทึกรหัสผ่านใหม่', exact: true }).click(), () => page.getByText('ตั้งรหัสผ่านใหม่แล้ว', { exact: true }).waitFor());
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1), 'mobile fits viewport');
    results.checks.push('mobile order/menu/ingredient/table/user actions');
  }
  await goto('/dashboard/kitchen');
  await page.screenshot({ path: `${dir}/kitchen-mobile.png`, fullPage: true });
  if (phase === 'after') {
    await context.clearCookies();
    await goto('/login');
    await page.locator('#email').fill('admin@example.invalid');
    await page.locator('#password').fill('test-password-only');
    mock.state.failWrite = true;
    await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
    await page.getByText('ระบบเข้าสู่ระบบไม่พร้อมชั่วคราว กรุณาลองใหม่', { exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).isEnabled());
    mock.state.failWrite = false;
    await measure('mobile.login', () => page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click(), () => page.waitForURL('**/dashboard'));
    results.checks.push('mobile login: Auth failure restores button, retry succeeds');
  }
  if (phase === 'after') await checkLiveDashboard({ context, page, mock, results, mode });
  }
  results.checks.push('isolated fixture actions complete');
} catch (error) {
  results.error = String(error.stack || error);
  if (browser) {
    const failedPage = browser.contexts()[0]?.pages()[0];
    if (failedPage) {
      results.failurePage = { url: failedPage.url(), text: await failedPage.locator('body').innerText().catch(() => '') };
      await failedPage.screenshot({ path: `${dir}/failure.png`, fullPage: true }).catch(() => {});
    }
  }
  console.error(error); process.exitCode = 1;
} finally {
  writeFileSync(`${dir}/results.json`, JSON.stringify(results, null, 2));
  await browser?.close();
  app?.kill();
  await mock.close(); log.end();
}
