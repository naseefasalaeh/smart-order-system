// Local HTTP + Phoenix fixtures only; database authorization is tested with PGlite.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, createWriteStream, cpSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startMock } from './helpers/dashboard-mock.mjs';
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
  const page = await context.newPage(); page.setDefaultTimeout(20000);

  const routes = {
    admin: ['/dashboard','/dashboard/menus','/dashboard/ingredients','/dashboard/tables','/dashboard/addons','/dashboard/reports','/dashboard/users'],
    staff: ['/dashboard/orders','/dashboard/ready'],
    kitchen_staff: ['/dashboard/kitchen'],
  };
  const paths=[...new Set(Object.values(routes).flat()),'/dashboard/menus/new','/dashboard/menus/1/edit','/dashboard/menus/1/options','/dashboard/ingredients/new','/dashboard/ingredients/1/edit','/dashboard/ingredients/categories'];
  for (const role of Object.keys(routes)) {
    await context.clearCookies(); mock.state.role=role;
    await page.goto('http://localhost:4400/login');
    await page.locator('input[type=email]').fill('admin@example.invalid');
    await page.locator('input[type=password]').fill('local-test-password');
    await page.locator('button[type=submit]').click();
    const home=role==='admin'?'/dashboard':role==='staff'?'/dashboard/orders':'/dashboard/kitchen';
    await page.waitForURL('**'+home);
    for (const path of paths) {
      const allowed=routes[role].includes(path)||(role==='admin'&&(path.startsWith('/dashboard/menus/')||path.startsWith('/dashboard/ingredients/')));
      const response=await page.goto('http://localhost:4400'+path);
      assert.equal(response.status(),allowed?(path.endsWith('/options')?200:200):403,role+' '+path);
      if(!allowed) assert.match(await page.locator('body').innerText(),/403/);
      else {
        const links=await page.locator('aside nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
        for(const link of links) assert.ok(routes[role].includes(link.split('?')[0]),role+' menu '+link);
      }
    }
    for(const method of ['GET','POST','PATCH','DELETE']) {
      const status=await page.evaluate(async method=>(await fetch('/api/admin/users',{method,...(method==='GET'?{}:{headers:{'Content-Type':'application/json'},body:'{}'})})).status,method);
      if(role!=='admin') assert.equal(status,403,role+' users '+method);
      else assert.notEqual(status,403);
    }
    mock.state.status='confirmed';
    const status=await page.evaluate(async id=>(await fetch('/api/orders/'+id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,'00000000-0000-4000-8000-000000000001');
    assert.equal(status,role==='staff'?200:403,role+' cancel');
    console.log('PASS',role,'login, all pages/subpages, menu, users API, cancel API');
  }
} finally {
  await browser?.close(); app.kill(); await mock.close(); log.end();
}
