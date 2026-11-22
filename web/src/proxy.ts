import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        response.headers.set("Cache-Control", "private, no-store");
      },
    } },
  );
  // Refresh/persist cookies only. NEVER authorize using getSession's unverified
  // user. Pages and actions still call getUser + the live profile, and retain RLS.
  // This avoids an additional Auth HTTP call for an unexpired cookie.
  try { await supabase.auth.getSession(); }
  catch { console.error("[dashboard-auth] session_refresh_unavailable"); }
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };
