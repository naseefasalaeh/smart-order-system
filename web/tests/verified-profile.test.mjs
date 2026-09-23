import test from 'node:test';
import assert from 'node:assert/strict';
import { getVerifiedProfile } from '../src/lib/supabase/verified-profile.ts';

function client({ authError = null, profileError = null, userId = 'staff', profileId = 'staff', active = true } = {}) {
  return {
    auth: { getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: authError }) },
    from: table => { assert.equal(table, 'profiles'); return { select: fields => {
      assert.equal(fields, 'id,role,is_active');
      return { maybeSingle: async () => ({ data: profileId ? { id: profileId, role: 'staff', is_active: active } : null, error: profileError }) };
    } }; },
  };
}
test('foreign profile cannot be combined with a verified user', async () => {
  const value = await getVerifiedProfile(client({ profileId: 'admin' }));
  assert.equal(value.profile, null);
  assert.equal(value.profileError.message, 'PROFILE_IDENTITY_MISMATCH');
});
test('Auth failure or missing user cannot authorize even when profile succeeds', async () => {
  for (const args of [{ authError: new Error('unavailable') }, { userId: null }]) {
    assert.equal((await getVerifiedProfile(client(args))).profile, null);
  }
});
test('profile failures, missing rows and inactive status are retained for the guard', async () => {
  const error = new Error('database unavailable');
  assert.equal((await getVerifiedProfile(client({ profileError: error }))).profileError, error);
  assert.equal((await getVerifiedProfile(client({ profileId: null }))).profile, null);
  assert.equal((await getVerifiedProfile(client({ active: false }))).profile.is_active, false);
});
test('both network operations begin before either completes', async () => {
  let finish;
  const db = client();
  db.auth.getUser = () => new Promise(resolve => { finish = resolve; });
  const original = db.from;
  db.from = table => { assert.ok(finish); finish({ data: { user: { id: 'staff' } }, error: null }); return original(table); };
  const result = await getVerifiedProfile(db);
  assert.equal(result.profile.id, result.user.id);
});
