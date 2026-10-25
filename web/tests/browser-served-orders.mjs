// Local HTTP + Phoenix fixtures only; database authorization is tested with PGlite.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, createWriteStream, cpSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startMock } from './helpers/dashboard-mock.mjs';
import { checkSidebarNavigation } from './helpers/sidebar-navigation-checks.mjs';
import { checkPendingPayments } from './helpers/pending-payment-checks.mjs';
import { checkOrderWorkload } from './helpers/order-workload-checks.mjs';
import { checkPartialPlates } from './helpers/partial-plate-checks.mjs';
import { checkIngredientResets } from './helpers/ingredient-reset-checks.mjs';
mkdirSync('.test-artifacts/served-orders', { recursive: true });
const log = createWriteStream('.test-artifacts/served-orders/browser.log');
const mock = await startMock();
const appDir = resolve(`.test-artifacts/served-orders/app-${Date.now()}`);
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
  const channels = new Set();
  await context.routeWebSocket('**/realtime/v1/websocket**', socket => {
    socket.onMessage(raw => {
      const [joinRef,ref,topic,event,payload] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        const binding = { socket,topic,joinRef }; channels.add(binding); socket.onClose(() => channels.delete(binding));
        socket.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{ status:'ok',response:{ postgres_changes:(payload.config.postgres_changes || []).map((f,i) => ({...f,id:i+1})) } }]));
      } else if (event === 'heartbeat' || event === 'phx_leave') socket.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{}}]));
    });
  });
  const emit = () => {
    mock.state.updatedAt = new Date().toISOString();
    for (const {socket,topic,joinRef} of channels) socket.send(JSON.stringify([joinRef,null,topic,'postgres_changes',{ ids:[1],data:{schema:'public',table:'orders',type:'UPDATE',columns:[],record:{},old_record:{},commit_timestamp:mock.state.updatedAt,errors:null} }]));
  };
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  await page.goto('http://localhost:4400/login');
  await page.locator('input[type=email]').fill('admin@example.invalid');
  await page.locator('input[type=password]').fill('local-test-password');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/dashboard');
  if (process.env.ORDER_BROWSER_SUITE === 'stock-reset') {
    await checkIngredientResets({ page, mock, dir: '.test-artifacts/served-orders' });
  } else if (process.env.ORDER_BROWSER_SUITE === 'partial') {
    await checkPartialPlates({ page, context, mock, emit, dir: '.test-artifacts/served-orders' });
  } else {
  for (const role of ['staff']) {
    mock.state.role = role;
    for (const dining of ['dine_in','takeaway']) {
      mock.state.diningType = dining; mock.state.status = 'ready'; mock.state.servedAt = null;
      await page.goto('http://localhost:4400/dashboard/ready');
      const label = dining === 'dine_in' ? 'ยืนยันเสิร์ฟ จานที่ 1' : 'ยืนยันส่งมอบ จานที่ 1';
      const button = page.getByRole('button',{ name:label,exact:true }); await button.waitFor();
      assert.equal(await page.getByRole('button',{name:'รับชำระเงิน',exact:true}).count(),0);
      const before = mock.state.requests.filter(r => r.path.endsWith('/serve_order_plate')).length;
      await button.evaluate(el => { el.click(); el.click(); });
      await page.locator('article').waitFor({state:'hidden'});
      assert.equal(mock.state.status,'served');
      assert.equal(mock.state.requests.filter(r => r.path.endsWith('/serve_order_plate')).length-before,1);
      await page.goto('http://localhost:4400/dashboard/payments');
      await page.locator('article').waitFor();
      assert.match(await page.locator('article').innerText(),/เสิร์ฟแล้ว รอชำระเงิน/);
      assert.ok(mock.state.servedAt);
      await page.getByRole('button',{name:'รับชำระเงิน',exact:true}).click();
      const cash = page.getByRole('button',{name:dining === 'dine_in' ? 'เงินสด' : 'QR Code',exact:true});
      const paidBefore = mock.state.requests.filter(r => r.path.endsWith('/complete_order_payment')).length;
      await cash.evaluate(el => { el.click(); el.click(); });
      await page.locator('article').waitFor({state:'hidden'});
      assert.equal(mock.state.requests.filter(r => r.path.endsWith('/complete_order_payment')).length-paidBefore,1);
      assert.equal(mock.state.status,'completed');
    }
  }
  mock.state.role = 'kitchen_staff'; mock.state.status = 'ready';
  await page.goto('http://localhost:4400/dashboard/kitchen');
  await page.locator('article').waitFor();
  assert.equal(await page.getByRole('button',{name:/^(เสิร์ฟแล้ว|ส่งมอบแล้ว|รับชำระเงิน)$/}).count(),0);
  for (const path of ['ready','orders']) {
    const response = await page.goto(`http://localhost:4400/dashboard/${path}`); assert.equal(response.status(), 403);
  }
  mock.state.role = 'staff'; mock.state.status = 'ready';
  await page.goto('http://localhost:4400/dashboard/ready'); await page.locator('article').waitFor();
  const other = await context.newPage();
  await other.goto('http://localhost:4400/dashboard/payments');
  await other.getByRole('heading',{name:'รอชำระเงิน',exact:true}).waitFor();
  const summary = await context.newPage();
  await summary.goto('http://localhost:4400/dashboard/orders?status=served');
  await summary.getByRole('navigation', { name: 'กรองสถานะออเดอร์' }).waitFor();
  assert.equal(await summary.locator('nav[aria-label="เมนูแดชบอร์ด"] a[aria-current="page"]').getAttribute('href'), '/dashboard/orders');
  await page.waitForTimeout(1000);
  mock.state.status = 'served'; mock.state.servedAt = new Date().toISOString(); emit();
  await page.locator('article').waitFor({state:'hidden'});
  await other.getByRole('button',{name:'รับชำระเงิน',exact:true}).waitFor();
  await summary.getByRole('button',{name:'รับชำระเงิน',exact:true}).waitFor();
  mock.state.status = 'completed'; emit();
  await other.locator('article').waitFor({state:'hidden'});
  await summary.locator('article').waitFor({state:'hidden'});
  await summary.close();
  // Customer status uses the existing private-session polling endpoint.
  await context.route('**/api/customer-orders', route => route.fulfill({json:{session:{status:'active'},orders:[{id:'test',order_number:'1',dining_type:'dine_in',status:'served',total_amount:50,created_at:new Date().toISOString(),order_items:[]}]}}));
  await page.evaluate(() => localStorage.setItem('smart-order-session-id-1','local-fixture-session'));
  await page.goto('http://localhost:4400/table/id-1/orders');
  await page.getByText('เสิร์ฟแล้ว กรุณาชำระเงินที่เคาน์เตอร์',{exact:true}).waitFor();
  const results = { checks: [] };
  await other.close();
  await checkPendingPayments({ page, context, mock, emit, dir: '.test-artifacts/served-orders' });
  await checkOrderWorkload({ page, mock, emit, dir: '.test-artifacts/served-orders' });
  await checkPartialPlates({ page, context, mock, emit, dir: '.test-artifacts/served-orders' });
  await checkSidebarNavigation({ page, context, mock, results, dir: '.test-artifacts/served-orders' });
  console.log('PASS: Staff dine-in/takeaway, serve/payment double click, Kitchen permissions, two-view Realtime, customer message, desktop/mobile sidebar navigation');
  }
} finally {
  await browser?.close(); app.kill(); await mock.close(); log.end();
}
