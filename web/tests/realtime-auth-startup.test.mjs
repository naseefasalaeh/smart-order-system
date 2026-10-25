import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Reproduce slow cookie-session hydration independently of network timing.
function mountObserver() {
  let release, authenticated = false;
  const ready = new Promise(resolve => { release = resolve; });
  const joins = [], cleanups = [];
  const channel = { on: () => channel, subscribe: () => { joins.push({ authenticated }); return channel; } };
  const db = {
    channel: () => channel,
    realtime: { setAuth: async () => { await ready; authenticated = true; } },
    removeChannel: async () => {},
  };
  const imports = {
    react: { useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
      useRef: value => ({ current: value }), useTransition: () => [false, callback => callback()] },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    '@/lib/supabase/client': { createClient: () => db },
  };
  const source = ts.transpileModule(readFileSync('src/components/order-realtime-refresh.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const events = { addEventListener() {}, removeEventListener() {} };
  vm.runInNewContext(source, { exports, require: name => {
    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  }, console, window: events, document: { ...events, visibilityState: 'visible' },
  crypto: { randomUUID: () => 'disposable-observer' }, setInterval, clearInterval, setTimeout, clearTimeout });
  exports.default({ channelName: 'test-orders', onRefresh: async () => {} });
  return { joins, release, unmount: () => cleanups.splice(0).reverse().forEach(cleanup => cleanup()) };
}

test('private order subscription waits for the signed-in session before its first join', async () => {
  const observer = mountObserver();
  try {
    assert.equal(observer.joins.length, 0, 'An anonymous join must not race session hydration');
    observer.release();
    await new Promise(setImmediate);
    assert.deepEqual(observer.joins, [{ authenticated: true }]);
  } finally { observer.unmount(); }
});

test('an observer unmounted while Auth is initializing cannot open a stale subscription', async () => {
  const observer = mountObserver();
  observer.unmount();
  observer.release();
  await new Promise(setImmediate);
  assert.equal(observer.joins.length, 0);
});
