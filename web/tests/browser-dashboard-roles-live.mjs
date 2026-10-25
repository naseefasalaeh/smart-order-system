// Local HTTP + Phoenix fixtures only; database authorization is tested with PGlite.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdirSync, createWriteStream, cpSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { checkLiveDashboard } from './helpers/dashboard-live-checks.mjs';
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
  page.on('dialog', dialog => dialog.accept());

  await page.goto('http://localhost:4400/login');
  await page.waitForFunction(() => [...document.querySelectorAll('input')].every(input => Object.keys(input).some(key => key.startsWith('__reactProps$'))));
  await page.locator('input[type=email]').fill('admin@example.invalid');
  await page.locator('input[type=password]').fill('local-test-password');
  await page.locator('button[type=submit]').click();
  try { await page.waitForURL('**/dashboard'); }
  catch (error) { console.log('Fixture login diagnostic', await page.locator('body').innerText(), mock.state.requests); throw error; }
  const results = { checks: [] };
  await checkLiveDashboard({ context, page, mock, results, mode: 'production' });
  console.log('PASS live dashboard regression', results.checks);
} finally {
  await browser?.close(); app.kill(); await mock.close(); log.end();
}
