import { readFileSync, writeFileSync } from 'node:fs';

// Reads local evidence only; never contacts Supabase or modifies application data.
const root = '.test-artifacts/dashboard-performance';
const read = name => JSON.parse(readFileSync(`${root}/${name}/results.json`, 'utf8'));
const count = (action, path) => action.backend.filter(request => request.path === path).length;
const sum = requests => requests.reduce((total, request) => total + request.ms, 0);
const lines = [
  '# Dashboard kitchen / action performance audit',
  '',
  'Audit date: 2026-09-22. Working tree only; no commit or deployment.',
  '',
  '## Scope and evidence',
  '',
  'The resumed workspace already contained the auth/404 fix, session Proxy, pending/duplicate-submit guards, request-scoped auth/client reuse, parallel catalog reads, incremental order views, user-list updates after successful API responses, and retry controls. The saved dev suite passed, but both saved production runs failed while observing Add-on pending state; the generated report was missing.',
  '',
  'This continuation makes the Add-on pending assertion deterministic: it keeps the stable form-field locator, briefly delays the fixture response, and dispatches same-task duplicate clicks without waiting for Server Action navigation to finish. The saved failure page already showed successful saving, so the timeout alone was not evidence of a production UI defect. It also removes report logic that could substitute a partial rerun for a failed full run. Both full suites are rerun, and the final report uses their actual outcomes. Existing retry, mobile login, cancellation, realtime and role coverage is retained.',
  '',
  '## 404 cause',
  '',
  '`src/app/dashboard/kitchen/page.tsx` exists before and after. The original `requireDashboardContext` called `notFound()` for profile query errors, missing/inactive profiles and disallowed roles. Injecting profile HTTP 503 against the baseline reproduces “404 / This page could not be found.” The fixed code returns a retryable Thai error for unavailable Auth/profile, redirects absent sessions to login, and unauthorized/inactive accounts to `/access-denied`. Admin and kitchen_staff are allowed. The only remaining `notFound()` calls are missing menu/ingredient edit records, after checking query errors.',
  '',
  'The preserved `original-development.log` does not identify the exact failing profile response or role for the user’s historical incident. The faulty code path is reproduced; the historical upstream trigger cannot be established from those logs. A missing route is not supported by the checked source/build evidence. Proxy persists refreshed cookies; server authorization still uses getUser and the current profile, never unverified session claims.',
  '',
  'The historical log contains 72 getUser timings (84–623 ms, mean 166 ms), 71 profile timings (75–360 ms, mean 113 ms), and 64 combined auth timings (194–755 ms, mean 306 ms). It contains no 404 line. This demonstrates meaningful repeated authorization cost, but does not itself tie each historical timing to a specific click.',
  '',
  '## Measurement method and limits',
  '',
  'Headless Microsoft Edge; desktop 1440×1000 and mobile viewport 375×812. `next dev` and `next build` + `next start`. Supabase Auth/PostgREST/Realtime are isolated HTTP/WebSocket fixtures with 100 ms delay per HTTP operation; no hosted database writes, migrations, commits or pushes. Mobile is viewport emulation, not a physical device. These measurements diagnose application roundtrips, not hosted database query execution plans or production network latency. Each action is one observed sample, not a percentile benchmark. Baseline artifacts come from the earlier run and are not newly recreated here; cold compilation and machine load can affect dev comparisons.',
  '',
  'Total time starts at the captured DOM click and ends when the action’s expected UI/navigation condition is observed. HTTP start/response times exclude Playwright click setup using setupMs. Backend durations are fixture request durations, including simulated latency; sums overlap for parallel requests and MUST NOT be read as elapsed wall time. Direct browser RPCs have no Next Server Action/API stage. Raw results retain individual request paths, starts, responses, and backend timestamps. New after-results also record clickEpochMs. `server.log` contains per-Supabase-call and auth timings; the users API also logs total handler duration. Response time is not a precise Server Action CPU/SQL breakdown.',
  '',
  'Request collection includes a 400 ms drain period after the UI condition; background polling/prefetch can therefore appear in counts and spans after the measured click-to-result time. Login finishes measurement at destination URL navigation, while order/form actions wait for their expected UI state. Failed-backend timings are excluded from the successful-action comparison.',
  '',
  '## Before → after click-to-result (ms)',
  '',
  '| Action | Dev before | Dev after | Production before | Production after |',
  '| --- | ---: | ---: | ---: | ---: |',
];
const beforeDev = read('before-dev'), beforeProd = read('before-production');
const afterDev = read('after-dev'), afterProd = read('after-production');
const lookup = (run, name) => run.actions.find(action => action.name === name);
const names = [...new Set([...beforeDev.actions, ...afterDev.actions, ...afterProd.actions].map(action => action.name))];
for (const name of names) lines.push(`| ${name} | ${[beforeDev, afterDev, beforeProd, afterProd].map(run => lookup(run, name)?.ms ?? 'not measured').join(' | ')} |`);
lines.push('', '## After action stages and query counts', '',
  'HTTP spans below are relative to click; backend total is summed request time, not elapsed time. “View read” includes affected data only for order actions, and server rerender/navigation for form actions. Remaining catalog revalidation is intentional to keep recipes, availability and list views consistent.', '');
for (const [mode, run] of [['dev', afterDev], ['production', afterProd]]) {
  lines.push(`### ${mode}`, '', '| Action | Pending ms | HTTP spans start→response ms | Auth / profile calls | Backend sum ms |', '| --- | ---: | --- | ---: | ---: |');
  for (const action of run.actions) {
    const spans = action.requests.map((req, index) => {
      const samePathIndex = action.requests.slice(0, index).filter(other => other.path === req.path).length;
      const res = action.responses.filter(other => other.path === req.path)[samePathIndex];
      return `${req.method} ${req.path}: ${Math.max(0, req.startedMs - action.setupMs)}→${res ? Math.max(0, res.completedMs - action.setupMs) : '?'}`;
    });
    lines.push(`| ${action.name} | ${action.feedbackMs ?? 'not observed'} | ${spans.join('<br>')} | ${count(action, '/auth/v1/user')} / ${count(action, '/rest/v1/profiles')} | ${sum(action.backend)} |`);
  }
  lines.push('', `Run status: ${run.error ? `FAILED: ${run.error}` : 'PASS'}`, '',
    ...run.checks.map(check => `- ${check}`), '');
}
lines.push('## Why actions were slow and what remains intentional', '',
  '- Orders previously wrote via RPC then refreshed the full server route (Auth + profile + view data); they now reload only the affected view with current-profile/data reads in parallel. Realtime bursts are coalesced and events during reads replayed. Unchanged fallback polls do not reload Auth/the full page. Focus/reconnect still refreshes current data and permissions.',
  '- Login previously combined navigation and refresh. The redundant refresh is removed; the server still verifies identity and permissions at the destination. Catalog forms keep necessary validation and revalidation; independent initial reads run in parallel.',
  '- User management previously refetched the full Auth user/profile list after writes. Successful writes update the local row after acknowledgement; failures reread to reconcile partially completed operations. Initial Auth list/profile reads run in parallel. These are acknowledged updates, not optimistic payment/stock/account mutations.',
  '- Request-local React cache avoids repeated client/identity work within a render. It is not a cross-request permission cache and does not remove authorization from actions or APIs. Server Actions can rerender after revalidatePath, so a second guard during that render is expected.',
  '- Database transactions, validation, RLS and role checks were not removed. No speculative success is displayed for stock, payment, cancellation or user administration. Live fixture tests do not prove hosted RLS/transaction execution; migration-backed SQL suites were not run in this continuation to honor the no-migration constraint.',
  '',
  'Validation: production build/TypeScript passed; standalone `tsc --noEmit` passed; ESLint passed with two existing next/no-img-element warnings (customer MenuClient and TableQRCode); Bangkok date unit test passed. Runtime coverage listed above is representative of the named workflows, not exhaustive coverage of every catalog option/category/delete variant. Missing baseline action timings are labeled “not measured”; no numbers are invented.',
  '', '## Reproduce', '',
  'Run sequentially (both use ports 4400/4401):', '',
  '```text',
  'node tests/browser-dashboard-performance.mjs after dev',
  'node tests/browser-dashboard-performance.mjs after production',
  'node scripts/report-dashboard-performance.mjs',
  'npm run lint',
  'npx tsc --noEmit',
  'node --test tests/bangkok-date.test.mjs',
  '```', '',
  'Artifacts: `.test-artifacts/dashboard-performance/{before,after}-{dev,production}/results.json`, `server.log`, `kitchen-mobile.png`. The runner overrides Supabase URL/keys with local fixtures and blocks external browser HTTP traffic. It does not load real test credentials. Production build output in `.next` is for the local fixture URL; rebuild normally before any real deployment.', '');
writeFileSync('docs/dashboard-performance-audit.md', lines.join('\n'));
if (afterDev.error || afterProd.error) process.exitCode = 1;
