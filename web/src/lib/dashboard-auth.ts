import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ShopRole = "admin" | "staff" | "kitchen_staff";

export async function requireDashboardRole(allowed: ShopRole[]) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) redirect("/login");
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error || !profile || !allowed.includes(profile.role as ShopRole)) notFound();
  return db;
}
