import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

function loadTsModule(path, imports = {}) {
  const exports = {};
  const source = readFileSync(path, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(transpiled, { exports, require: (name) => imports[name] });
  return exports;
}

const { collectNewKitchenOrders } = loadTsModule('src/lib/kitchen-notifications.ts');

test('1. Kitchen alert logic ignores existing orders on initial baseline', () => {
  const seen = new Set();
  const initialOrders = [
    { id: 'order-1', status: 'confirmed' },
    { id: 'order-2', status: 'preparing' },
    { id: 'order-3', status: 'ready' },
  ];

  // Baseline load: registers confirmed and preparing orders into seen without triggering alert
  const addedBaseline = collectNewKitchenOrders(initialOrders, seen, true);
  assert.equal(addedBaseline.length, 0, 'Must not alert existing orders on baseline load');
  assert.equal(seen.has('order-1'), true);
  assert.equal(seen.has('order-2'), true);
  assert.equal(seen.has('order-3'), false, 'Ready orders are not kitchen active alerts');
});

test('2. Kitchen alert logic triggers only for new confirmed/preparing orders', () => {
  const seen = new Set(['order-1', 'order-2']);
  const currentOrders = [
    { id: 'order-1', status: 'confirmed' },
    { id: 'order-2', status: 'preparing' },
    { id: 'order-4', status: 'confirmed' },
    { id: 'order-5', status: 'preparing' },
    { id: 'order-6', status: 'completed' },
  ];

  const added = Array.from(collectNewKitchenOrders(currentOrders, seen, false));
  assert.deepEqual(added, ['order-4', 'order-5'], 'Must trigger only for new confirmed and preparing orders');
  assert.equal(seen.has('order-4'), true);
  assert.equal(seen.has('order-5'), true);

  // Subsequent poll with identical orders must not re-trigger
  const subsequentAdded = collectNewKitchenOrders(currentOrders, seen, false);
  assert.equal(subsequentAdded.length, 0, 'Must not re-trigger for already seen orders');
});

test('3. Kitchen view integrates KitchenAlerts with userId and valid prop', () => {
  const kitchenViewSource = readFileSync('src/app/dashboard/kitchen/view.tsx', 'utf8');
  assert.ok(kitchenViewSource.includes('<KitchenAlerts'), 'Must render KitchenAlerts in kitchen view');
  assert.ok(kitchenViewSource.includes('orders={orders ?? []}'), 'Must pass orders to KitchenAlerts');
  assert.ok(kitchenViewSource.includes('valid={!error}'), 'Must pass valid prop to KitchenAlerts');
  assert.ok(kitchenViewSource.includes('userId={userId}'), 'Must pass userId to KitchenAlerts');
});

test('4. KitchenAlerts component implements sound toggle, AudioContext unlock, and distinctive kitchen chime', () => {
  const alertsSource = readFileSync('src/components/kitchen-alerts.tsx', 'utf8');
  assert.ok(alertsSource.includes('kitchen_sound_enabled'), 'Must use kitchen_sound_enabled localStorage key');
  assert.ok(alertsSource.includes('playKitchenOrderChime'), 'Must define playKitchenOrderChime');
  assert.ok(alertsSource.includes('AudioContext'), 'Must use Web Audio API');
  assert.ok(alertsSource.includes('handleToggleSound'), 'Must have handleToggleSound');
  assert.ok(alertsSource.includes('handleTestSound'), 'Must have handleTestSound');
  assert.ok(alertsSource.includes('เปิดเสียงแจ้งเตือน'), 'Must show open sound button');
  assert.ok(alertsSource.includes('ปิดเสียง'), 'Must show mute button');
});
