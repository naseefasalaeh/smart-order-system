import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatOrderNumber, formatOrderCode } from '../src/lib/order-number.ts';

test('formatOrderNumber formats order numbers into padded 3-digit strings', () => {
  assert.equal(formatOrderNumber(1), '#001');
  assert.equal(formatOrderNumber(12), '#012');
  assert.equal(formatOrderNumber(168), '#168');
  assert.equal(formatOrderNumber(1248), '#1248');
  assert.equal(formatOrderNumber('5'), '#005');
  assert.equal(formatOrderNumber('#7'), '#007');
  assert.equal(formatOrderNumber(null), '-');
  assert.equal(formatOrderNumber(undefined), '-');
  assert.equal(formatOrderNumber(''), '-');
});

test('formatOrderCode combines Bangkok date prefix and padded order number', () => {
  const dateStr = '2026-11-07T05:49:07.000Z'; // 12:49 Bangkok time on 2026-11-07
  assert.equal(formatOrderCode(1, dateStr), '261107-001');
  assert.equal(formatOrderCode(12, dateStr), '261107-012');
  assert.equal(formatOrderCode(168, dateStr), '261107-168');
  assert.equal(formatOrderCode(1, null), '#001');
  assert.equal(formatOrderCode(null, dateStr), '-');
});
