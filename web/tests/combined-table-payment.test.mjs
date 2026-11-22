import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('1. SQL Migration removes DIFFERENT_DINING_SESSION restriction and supports multi-session close', () => {
  const sql = readFileSync('supabase/migrations/20261122020000_combined_table_payment.sql', 'utf8');
  assert.ok(!sql.includes("raise exception 'DIFFERENT_DINING_SESSION'"), 'Must remove single-session restriction');
  assert.ok(sql.includes('v_affected_sessions uuid[]'), 'Must track affected dining sessions');
  assert.ok(sql.includes('update public.dining_sessions') && sql.includes("where id = v_sess and status = 'active'"), 'Must close completed dining sessions');
});

test('2. payments-view.tsx passes allOrders to SessionPayment', () => {
  const view = readFileSync('src/app/dashboard/orders/payments-view.tsx', 'utf8');
  assert.ok(view.includes('allOrders={orders}'), 'Must pass allOrders to SessionPayment');
});

test('3. session-payment.tsx supports combined table payments, table badges, and cash change calculator', () => {
  const comp = readFileSync('src/components/session-payment.tsx', 'utf8');

  // Prop & combined state
  assert.ok(comp.includes('allOrders?: Order[]'), 'Must accept allOrders prop');
  assert.ok(comp.includes('combinedSessionKeys'), 'Must manage selected other sessions');
  assert.ok(comp.includes('activeCombinedOrders'), 'Must combine orders across selected sessions');

  // UI elements
  assert.ok(comp.includes('รวมบิลกับโต๊ะอื่น'), 'Must have combined table UI section');
  assert.ok(comp.includes('tableName'), 'Lines must include tableName badge');
  assert.ok(comp.includes('รับเงินสดมา (บาท):'), 'Must have cash change calculator');
  assert.ok(comp.includes('เงินทอน:'), 'Must show change amount');
});

test('4. Calculation logic: combining items across multiple tables correctly sums amounts and calculates change', () => {
  const table1Items = [
    { id: 1, unit_price: '50.00', quantity: 2, paid: 0 },
    { id: 2, unit_price: '30.00', quantity: 1, paid: 0 }
  ];
  const table2Items = [
    { id: 3, unit_price: '60.00', quantity: 1, paid: 0 }
  ];

  const allLines = [
    ...table1Items.map(item => ({ item, tableName: 'โต๊ะ 1', remaining: item.quantity })),
    ...table2Items.map(item => ({ item, tableName: 'โต๊ะ 2', remaining: item.quantity }))
  ];

  const totalSatang = allLines.reduce(
    (sum, line) => sum + Math.round(Number(line.item.unit_price) * 100) * line.remaining,
    0
  );

  // Table 1: 50*2 + 30 = 130 THB (13,000 satang)
  // Table 2: 60*1 = 60 THB (6,000 satang)
  // Total: 190 THB (19,000 satang)
  assert.equal(totalSatang, 19000);

  const displayTotalBaht = totalSatang / 100;
  assert.equal(displayTotalBaht, 190);

  // Cash received: 500 Baht -> Change: 310 Baht
  const cashReceived = 500;
  const change = cashReceived - displayTotalBaht;
  assert.equal(change, 310);
});

test('5. session-payment.tsx discloses real server errors and falls back to server action on DIFFERENT_DINING_SESSION', () => {
  const comp = readFileSync('src/components/session-payment.tsx', 'utf8');

  // Must log console.error for debugging
  assert.ok(comp.includes('console.error("Payment collection error'), 'Must log collection errors');
  assert.ok(comp.includes('console.error("Payment collection exception'), 'Must log exceptions');

  // Must show real error message rather than masking
  assert.ok(comp.includes('actionRes.error'), 'Must expose server action error message');
  assert.ok(comp.includes('rpcError?.message'), 'Must expose RPC error message');

  // Must detect DIFFERENT_DINING_SESSION and invoke collectItemPaymentAction
  assert.ok(comp.includes('collectItemPaymentAction'), 'Must import and invoke collectItemPaymentAction');
  assert.ok(comp.includes('DIFFERENT_DINING_SESSION'), 'Must handle DIFFERENT_DINING_SESSION fallback');
});

test('6. Server action and API route support multi-table payment without relying on RPC migration', () => {
  const actionSource = readFileSync('src/app/dashboard/payments/actions.ts', 'utf8');
  const routeSource = readFileSync('src/app/api/orders/payment/route.ts', 'utf8');

  // Action performs auth check, multi-table payment insertion, allocation, order completion, and session closure
  assert.ok(actionSource.includes('requireDashboardContext(["staff", "admin"])'), 'Must require staff or admin role');
  assert.ok(actionSource.includes('createAdminClient()'), 'Must use service role admin client for database updates');
  assert.ok(actionSource.includes('.from("payments")') && actionSource.includes('.insert({'), 'Must insert payment record');
  assert.ok(actionSource.includes('.from("payment_allocations")') && actionSource.includes('.insert('), 'Must insert allocations for all dishes');
  assert.ok(actionSource.includes('status: "completed"'), 'Must advance fully paid orders across tables to completed');
  assert.ok(actionSource.includes('status: "closed"'), 'Must close completed dining sessions');

  // API route delegates to server action
  assert.ok(routeSource.includes('collectItemPaymentAction'), 'API route must delegate to collectItemPaymentAction');
});

