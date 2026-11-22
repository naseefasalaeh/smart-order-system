import type { SupabaseClient } from "@supabase/supabase-js";

// profiles' SELECT policy exposes only auth.uid(). Read it with the caller's
// JWT while Auth independently verifies that JWT. Neither result alone grants
// access: require the returned profile ID to match the verified Auth user.
// No session claims, service-role client, or cross-request permission cache.
export async function getVerifiedProfile(db: SupabaseClient) {
  const [auth, profile] = await Promise.all([
    db.auth.getUser(),
    db.from("profiles").select("id,full_name,role,is_active").maybeSingle(),
  ]);
  const user = auth.data.user;
  const mismatch = !auth.error && user && profile.data && profile.data.id !== user.id;
  return {
    user,
    authError: auth.error,
    profile: auth.error || !user || mismatch ? null : profile.data,
    profileError: mismatch ? new Error("PROFILE_IDENTITY_MISMATCH") : profile.error,
  };
}
