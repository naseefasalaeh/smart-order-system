import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIngredientReset } from '../src/lib/ingredient-reset.ts';

test('reset form validation rejects invalid cadence, calendar dates and Thai wall time', () => {
  const parse = values => {
    const form=new FormData(); Object.entries(values).forEach(([key,value])=>form.set(key,String(value)));
    return readIngredientReset(form);
  };
  assert.deepEqual(parse({}),{reset_every_days:null,reset_start_date:null,reset_time:null});
  assert.deepEqual(parse({reset_mode:'daily',reset_start_date:'2028-02-29',reset_time:'23:59'}),
    {reset_every_days:1,reset_start_date:'2028-02-29',reset_time:'23:59'});
  assert.deepEqual(parse({reset_mode:'interval',reset_every_days:3,reset_start_date:'2026-10-25',reset_time:'00:00'}),
    {reset_every_days:3,reset_start_date:'2026-10-25',reset_time:'00:00'});
  for(const fields of [{reset_mode:'bad'}, {reset_every_days:0}, {reset_every_days:1.5}, {reset_every_days:3651},
    {reset_start_date:'2026-02-29'}, {reset_start_date:'2026-04-31'}, {reset_time:'24:00'}, {reset_time:'01:60'}, {reset_start_date:''}]) {
    assert.throws(()=>parse({reset_mode:'interval',reset_every_days:2,reset_start_date:'2026-10-25',reset_time:'23:00',...fields}));
  }
});
