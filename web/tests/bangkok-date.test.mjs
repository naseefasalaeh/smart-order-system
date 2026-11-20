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

test('Bangkok week bounds align to Monday 00:00 and next Monday 00:00 (7 days)', () => {
  // Saturday 2026-11-07
  const weekFromSat = exports.bangkokWeekRange('2026-11-07');
  assert.ok(weekFromSat);
  assert.equal(weekFromSat.startDay, '2026-11-02');
  assert.equal(weekFromSat.endDay, '2026-11-08');
  assert.equal(weekFromSat.start, '2026-11-01T17:00:00.000Z');
  assert.equal(weekFromSat.end, '2026-11-08T17:00:00.000Z');

  // Sunday 2026-11-08 (same week)
  const weekFromSun = exports.bangkokWeekRange('2026-11-08');
  assert.deepEqual(weekFromSun, weekFromSat);

  // Monday 2026-11-02 (same week)
  const weekFromMon = exports.bangkokWeekRange('2026-11-02');
  assert.deepEqual(weekFromMon, weekFromSat);

  assert.equal(exports.bangkokWeekRange('invalid'), null);
});

test('Bangkok year bounds cover Jan 1 00:00 to next Jan 1 00:00', () => {
  const year2026 = exports.bangkokYearRange('2026');
  assert.ok(year2026);
  assert.equal(year2026.start, '2025-12-31T17:00:00.000Z');
  assert.equal(year2026.end, '2026-12-31T17:00:00.000Z');
  assert.equal(year2026.year, 2026);

  assert.equal(exports.bangkokYearRange('abc'), null);
  assert.equal(exports.bangkokYearRange(1999), null);
});

test('Bangkok custom range handles valid and rejects inverted dates', () => {
  const custom = exports.bangkokCustomRange('2026-05-01', '2026-05-31');
  assert.ok(custom);
  assert.equal(custom.startDay, '2026-05-01');
  assert.equal(custom.endDay, '2026-05-31');
  assert.equal(custom.dayCount, 31);
  assert.equal(custom.start, '2026-04-30T17:00:00.000Z');
  assert.equal(custom.end, '2026-05-31T17:00:00.000Z');

  // Single day custom range
  const singleDay = exports.bangkokCustomRange('2026-05-15', '2026-05-15');
  assert.ok(singleDay);
  assert.equal(singleDay.dayCount, 1);
  assert.equal(singleDay.start, '2026-05-14T17:00:00.000Z');
  assert.equal(singleDay.end, '2026-05-15T17:00:00.000Z');

  // Inverted dates: start after end
  assert.equal(exports.bangkokCustomRange('2026-05-31', '2026-05-01'), null);
});

test('Previous period calculations calculate correct offsets', () => {
  assert.equal(exports.getPreviousDay('2026-11-07'), '2026-11-06');
  assert.equal(exports.getPreviousDay('2026-03-01'), '2026-02-28');

  assert.equal(exports.getPreviousWeekDate('2026-11-07'), '2026-10-31');

  assert.equal(exports.getPreviousMonth('2026-11'), '2026-10');
  assert.equal(exports.getPreviousMonth('2026-01'), '2025-12');

  assert.equal(exports.getPreviousYear(2026), 2025);

  const prevCustom = exports.getPreviousCustomRange('2026-11-01', '2026-11-07');
  assert.equal(prevCustom.prevStartDay, '2026-10-25');
  assert.equal(prevCustom.prevEndDay, '2026-10-31');
});

test('Bangkok date keys, hour keys and Buddhist year format correctly', () => {
  assert.equal(exports.bangkokDateKey('2026-11-06T17:30:00.000Z'), '2026-11-07');
  assert.equal(exports.bangkokHourKey('2026-11-06T17:30:00.000Z'), 0);
  assert.equal(exports.bangkokHourKey('2026-11-07T05:15:00.000Z'), 12);
  assert.equal(exports.bangkokMonthKey('2026-11-06T17:30:00.000Z'), '2026-11');
  assert.equal(exports.formatThaiYear(2026), '2569');
});
