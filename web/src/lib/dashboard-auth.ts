import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedProfile } from "@/lib/supabase/verified-profile";

export type ShopRole = "admin" | "staff" | "kitchen_staff";

function logDuration(stage: string, started: number) {
  if (process.env.NODE_ENV === "development" || process.env.PERF_LOG === "1") {
    console.info(`[perf] ${stage} ${Math.round(performance.now() - started)}ms`);
  }
}

// React cache is scoped to this render/request, never shared between users or requests.
const dashboardIdentity = cache(async () => {
  const totalStarted = performance.now();
  const db = await createClient();
  const { user, authError, profile, profileError: error } = await getVerifiedProfile(db);
  if (authError && ![400, 401, 403].includes(authError.status ?? 0)
    && authError.name !== "AuthSessionMissingError") {
    console.error("[dashboard-auth] auth_unavailable", { code: authError.code, status: authError.status });
    throw new Error("ไม่สามารถตรวจสอบการเข้าสู่ระบบได้ชั่วคราว กรุณาลองใหม่");
  }
  if (authError || !user) redirect("/login");
  const role = profile?.role as ShopRole | undefined;
  if (error) {
    console.error("[dashboard-auth] profile_unavailable", { code: "code" in error ? error.code : "PROFILE_IDENTITY_MISMATCH" });
    throw new Error("ไม่สามารถตรวจสอบสิทธิ์ได้ชั่วคราว กรุณาลองใหม่");
  }
  if (!profile?.is_active || !role || !["admin", "staff", "kitchen_staff"].includes(role)) {
    console.warn("[dashboard-auth] account_denied", { reason: !profile ? "missing_profile" : !profile.is_active ? "inactive" : "unknown_role" });
    redirect("/access-denied");
  }
  logDuration("dashboard.auth.total", totalStarted);
  return { db, user, role };
});

export async function requireDashboardContext(allowed: ShopRole[]) {
  const identity = await dashboardIdentity();
  if (!allowed.includes(identity.role)) {
    console.warn("[dashboard-auth] role_denied", { role: identity.role, allowed });
    redirect("/access-denied");
  }
  return identity;
}

export async function requireDashboardRole(allowed: ShopRole[]) {
  return (await requireDashboardContext(allowed)).db;
}
