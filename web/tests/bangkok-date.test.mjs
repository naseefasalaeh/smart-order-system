import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/bangkok-date.ts','utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports, Date });

test('Bangkok day and month bounds include local midnight and exclude the next period', () => {
  assert.equal(exports.bangkokToday(new Date('2026-09-15T17:00:00.000Z')), '2026-09-16');
  assert.deepEqual({ ...exports.bangkokDayRange('2026-09-16') }, {
    start: '2026-09-15T17:00:00.000Z', end: '2026-09-16T17:00:00.000Z',
  });
  assert.deepEqual({ ...exports.bangkokMonthRange('2026-02') }, {
    start: '2026-01-31T17:00:00.000Z', end: '2026-02-28T17:00:00.000Z',
  });
  assert.equal(exports.bangkokDayRange('2026-02-30'), null);
  assert.equal(exports.bangkokMonthRange('2026-13'), null);
});
