import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ShopRole = "admin" | "staff" | "kitchen_staff";

function logDuration(stage: string, started: number) {
  if (process.env.NODE_ENV === "development") {
    console.info(`[perf] ${stage} ${Math.round(performance.now() - started)}ms`);
  }
}

export async function requireDashboardContext(allowed: ShopRole[]) {
  const totalStarted = performance.now();
  const db = await createClient();
  const userStarted = performance.now();
  const { data: { user }, error: authError } = await db.auth.getUser();
  logDuration("auth.getUser", userStarted);
  if (authError || !user) redirect("/login");
  const profileStarted = performance.now();
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  logDuration("profiles.role", profileStarted);
  const role = profile?.role as ShopRole | undefined;
  if (error || !role || !allowed.includes(role)) notFound();
  logDuration("dashboard.auth.total", totalStarted);
  return { db, user, role };
}

export async function requireDashboardRole(allowed: ShopRole[]) {
  return (await requireDashboardContext(allowed)).db;
}
