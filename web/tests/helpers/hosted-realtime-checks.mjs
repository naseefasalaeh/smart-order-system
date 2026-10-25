// Hosted traffic is forwarded unchanged. Only transport failures and polling
// requests are blocked deliberately; no database response/event is fabricated.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const origin = 'http://localhost:4422';
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function until(predicate, label, timeout = 30000, interval = 200) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await sleep(interval); }
  throw Error(`Timeout: ${label}`);
}
const checked = async promise => { const response = await promise; if (response.error) throw Error(response.error.message); return response.data; };

export async function checkHostedRealtime(work) {
  const { db, clients, pages, contexts, registry, result, dir, ingredient, table,
    createOrder, start, completePlate, servePlate, stock, pass, originals, save, closeBrowser, openBrowser } = work;
  result.recovery = { frames: [], reads: [], transportClosures: 0, blockedConnections: 0, phases: [] };
  const proof = result.recovery;
  const states = {};
  for (const role of ['admin', 'staff']) states[role] = await contexts[role].storageState();
  for (const page of Object.values(pages)) await page.close();
  const order = await createOrder('realtime-recovery', 10);
  await start(order);
  for (let plate = 1; plate <= 10; plate++) await completePlate(order, plate);
  assert.equal((await checked(db.from('orders').select('status').eq('id', order.id).single())).status, 'ready');
  assert.equal(await stock(), 80);
  pass('TEST order cooked before recovery tests; kitchen FCFS is released, original orders untouched');

  let blockSockets = false, blockPolling = true;
  const transports = [];
  let context = contexts.staff;
  async function configureContext(target) {
    await target.route(url => url.pathname === '/rest/v1/orders'
      && url.searchParams.get('select') === 'id,status,updated_at', route => {
      if (blockPolling) { proof.blockedPolls = (proof.blockedPolls ?? 0) + 1; return route.abort(); }
      return route.continue();
    });
    await target.routeWebSocket('**/realtime/v1/websocket**', socket => {
      if (blockSockets) { proof.blockedConnections++; socket.close({ code: 1011, reason: 'TEST connection loss' }); return; }
      const server = socket.connectToServer();
      transports.push({ socket, server });
      socket.onMessage(raw => {
        try {
          const [, , topic, event, payload] = JSON.parse(String(raw));
          if (event === 'phx_join') {
            let subject;
            try { subject = JSON.parse(Buffer.from(payload.access_token.split('.')[1], 'base64url').toString()).sub; } catch { /* No JWT in this join. */ }
            proof.frames.push({ direction: 'sent', topic, event, hasToken: Boolean(payload.access_token),
              subjectMatchesTestStaff: subject === registry.users.find(user => user.role === 'staff').id, at: Date.now() });
          }
        } catch { /* Forward non-JSON transport data unchanged. */ }
        server.send(raw);
      });
      server.onMessage(raw => {
        try {
          const [, , topic, event, payload] = JSON.parse(String(raw));
          if (['phx_reply', 'system', 'postgres_changes'].includes(event)) {
            proof.frames.push({ direction: 'received', topic, event, status: payload.status,
              bindings: payload.response?.postgres_changes?.length, orderId: payload.data?.record?.id, at: Date.now() });
          }
        } catch { /* Forward binary/other data unchanged. */ }
        socket.send(raw); save();
      });
    });
  }
  async function subscribedSince(since) {
    await until(() => proof.frames.some(frame => frame.at >= since && frame.direction === 'received'
      && frame.topic?.includes('staff-ready-orders') && frame.event === 'phx_reply' && frame.bindings > 0), 'real current staff subscription acknowledged');
  }
  async function newStaffPage(target) {
    const page = await target.newPage(); page.setDefaultTimeout(20000);
    page.on('response', async response => {
      const url = new URL(response.url());
      if (url.pathname !== '/rest/v1/orders') return;
      try {
        const data = await response.json();
        const row = Array.isArray(data) ? data.find(row => row.id === order.id) : null;
        proof.reads.push({ select: url.searchParams.get('select'), status: response.status(),
          served: row?.order_items?.[0]?.served_plates?.length, at: Date.now() }); save();
      } catch { /* Network loss is exercised deliberately. */ }
    });
    const since = Date.now();
    await page.goto(`${origin}/dashboard/ready`); await page.bringToFront();
    assert.equal(await page.evaluate(() => document.visibilityState), 'visible');
    await subscribedSince(since);
    const joins = proof.frames.filter(frame => frame.at >= since && frame.direction === 'sent' && frame.topic?.includes('staff-ready-orders'));
    assert.ok(joins.length > 0);
    assert.ok(joins.every(frame => frame.subjectMatchesTestStaff), 'First subscription must carry the signed-in Staff JWT');
    await sleep(1000);
    return page;
  }
  const card = page => page.locator('article').filter({ hasText: `ออเดอร์ #${order.order_number}` });
  const progress = (page, count) => card(page).getByText(new RegExp(`เสิร์ฟแล้ว ${count}/10 จาน`));
  async function cutTransport() {
    blockSockets = true;
    for (const transport of transports.splice(0)) {
      transport.server.close({ code: 1011, reason: 'TEST connection loss' });
      transport.socket.close({ code: 1011, reason: 'TEST connection loss' }); proof.transportClosures++;
    }
  }
  await configureContext(context);
  let page = await newStaffPage(context); pages.staff = page;
  await progress(page, 0).waitFor();
  for (let count = 1; count <= 2; count++) {
    const since = Date.now();
    await servePlate(order, count);
    await until(() => proof.frames.some(frame => frame.at >= since && frame.event === 'postgres_changes'
      && frame.orderId === order.id), `real browser UPDATE for plate ${count}`);
    await progress(page, count).waitFor();
    proof.phases.push({ phase: 'push-only', count, passed: true }); save();
  }
  pass('Pure browser push updates two successive remote plate changes with polling HTTP blocked; current subscription and matching UPDATE frames verified');

  const session = await context.newCDPSession(page);
  await session.send('Page.setWebLifecycleState', { state: 'frozen' });
  await servePlate(order, 3);
  await session.send('Page.setWebLifecycleState', { state: 'active' });
  await page.bringToFront(); await progress(page, 3).waitFor();
  proof.phases.push({ phase: 'frozen-resume', count: 3, passed: true }); save();
  pass('Frozen browser resumes and shows the latest committed plate count');

  const disconnectedAt = Date.now();
  await context.setOffline(true); await cutTransport();
  await servePlate(order, 4);
  assert.equal((await checked(db.from('order_items').select('served_plates').eq('id', order.item.id).single())).served_plates.length, 4);
  await sleep(1000); blockSockets = false;
  await context.setOffline(false); await page.bringToFront();
  await subscribedSince(disconnectedAt); await progress(page, 4).waitFor();
  await servePlate(order, 5); await progress(page, 5).waitFor();
  proof.phases.push({ phase: 'offline-reconnect-new-push', count: 5, passed: true }); save();
  pass('Socket loss plus HTTP offline: reconnect reloads a missed update and receives a further remote update with polling blocked');

  blockPolling = false; await cutTransport();
  await sleep(1500); // Drain the preceding reconnect refresh before this write.
  const pollingAt = Date.now(); await servePlate(order, 6);
  await until(() => proof.reads.some(read => read.at >= pollingAt && read.select === 'id,status,updated_at'), 'real fallback polling read');
  await progress(page, 6).waitFor();
  assert.equal(proof.frames.some(frame => frame.at >= pollingAt && frame.event === 'postgres_changes' && frame.orderId === order.id), false);
  proof.phases.push({ phase: 'polling-with-socket-blocked', count: 6, passed: true }); save();
  pass('Polling alone recovers the latest state while socket reconnect attempts are blocked');

  let ingredientRow = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
  const resetAt = new Date(Math.ceil((Date.now() + 90000) / 60000) * 60000);
  const thai = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(resetAt);
  await checked(clients.admin.rpc('save_ingredient', { p_id: ingredient, p_expected_updated_at: ingredientRow.updated_at,
    p_values: { name: registry.prefix, unit: 'TEST', minimum_stock: 0, category_id: null,
      reset_every_days: 1, reset_start_date: thai.slice(0, 10), reset_time: thai.slice(11, 16) } }));
  ingredientRow = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
  proof.cron = { beforeStock: await stock(), due: ingredientRow.reset_next_at, browserClosed: true }; save();
  await closeBrowser(); await servePlate(order, 7);
  console.log(`WAIT background cron with every browser closed; test ingredient due ${ingredientRow.reset_next_at}`);
  await until(async () => {
    ingredientRow = await checked(db.from('ingredients').select('*').eq('id', ingredient).single());
    return Number(ingredientRow.stock_quantity) === 0 && ingredientRow.reset_last_at !== null;
  }, 'real cron while browser closed', 210000, 5000);
  proof.cron.afterStock = Number(ingredientRow.stock_quantity); proof.cron.resetLastAt = ingredientRow.reset_last_at; save();
  assert.equal((await checked(db.from('order_items').select('served_plates').eq('id', order.item.id).single())).served_plates.length, 7);
  await originals('after-browser-closed-cron');
  pass('With every browser closed, backend RPC committed and the existing Supabase cron reset only the scheduled TEST ingredient');

  blockSockets = false; blockPolling = true;
  const reopened = await openBrowser();
  context = await reopened.newContext({ storageState: states.staff });
  await configureContext(context); page = await newStaffPage(context); pages.staff = page;
  await progress(page, 7).waitFor();
  const adminContext = await reopened.newContext({ storageState: states.admin });
  const adminPage = await adminContext.newPage(); pages.admin = adminPage;
  await adminPage.goto(`${origin}/dashboard/ingredients`);
  await adminPage.getByRole('row').filter({ hasText: registry.prefix }).getByRole('cell').nth(2).getByText('0 TEST', { exact: true }).waitFor();
  pass('New browser with persisted sessions reads latest served plates and actual post-cron stock on first load');
  await page.bringToFront(); await servePlate(order, 8); await progress(page, 8).waitFor();
  pass('Reopened browser receives a new remote push after restoring its session');

  const customerContext = await reopened.newContext();
  await customerContext.addInitScript(({ table, token }) => localStorage.setItem(`smart-order-session-id-${table}`, token), { table, token: order.payload.sessionToken });
  const customer = await customerContext.newPage(); customer.setDefaultTimeout(25000);
  pages.customer = customer;
  const customerProgress = count => customer.locator('article').filter({ hasText: `ออเดอร์ ${order.order_number}` })
    .getByText(new RegExp(`เสิร์ฟแล้ว ${count}/10 จาน`));
  await customer.goto(`${origin}/table/id-${table}/orders`); await customer.bringToFront();
  await customerProgress(8).waitFor(); await customerContext.setOffline(true);
  await servePlate(order, 9); await customerContext.setOffline(false); await customerProgress(9).waitFor();
  await servePlate(order, 10);
  await customer.getByText('เสิร์ฟแล้ว กรุณาชำระเงินที่เคาน์เตอร์', { exact: true }).waitFor();
  pass('Customer reconnects after offline, reads the missed plate change and observes the next served status');
  await checked(clients.staff.rpc('complete_order_payment', { p_order_id: order.id, p_payment_method: 'cash' }));
  assert.equal(await stock(), 0); await originals('after-realtime-recovery');
  proof.completed = true; save();
  writeFileSync(`${dir}/realtime-proof.json`, JSON.stringify(proof, null, 2));
}
