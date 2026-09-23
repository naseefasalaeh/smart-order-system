import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShopRole } from "@/lib/dashboard-auth";
import { listAdminUsers } from "@/lib/admin-users";
import { getVerifiedProfile } from "@/lib/supabase/verified-profile";

export const dynamic = "force-dynamic";

const roles = new Set<ShopRole>(["admin", "staff", "kitchen_staff"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function activeAdminId() {
  const client = await createClient();
  const { user, authError: error, profile, profileError } = await getVerifiedProfile(client);
  if (error && (error.status ?? 0) >= 500) throw new Error("Auth unavailable");
  if (error || !user) return null;
  if (profileError) throw new Error("Profile unavailable");
  return profile?.role === "admin" && profile.is_active ? user.id : null;
}

function validProfile(value: unknown): value is { role: ShopRole; fullName: string; isActive: boolean } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.role === "string" && roles.has(v.role as ShopRole)
    && typeof v.fullName === "string" && v.fullName.trim().length > 0
    && v.fullName.length <= 120 && typeof v.isActive === "boolean";
}

function validPassword(password: unknown, confirmation: unknown): password is string {
  return typeof password === "string" && password.length >= 8 && password.length <= 72
    && password.trim().length > 0 && password === confirmation;
}

function response(message: string, status: number) {
  const messages: Record<string, string> = {
    "Forbidden": "บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้",
    "Invalid input": "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
    "Invalid user": "ข้อมูลผู้ใช้ไม่ถูกต้อง",
    "Invalid email, profile, or password confirmation": "กรุณาตรวจอีเมล ชื่อ สิทธิ์ และรหัสผ่านยืนยัน",
    "Invalid password confirmation": "รหัสผ่านต้องยาว 8–72 ตัวอักษรและตรงกับรหัสผ่านยืนยัน",
    "Cannot disable or demote your own admin account": "ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชี Admin ของตัวเองได้",
    "Cannot delete your own account": "ไม่สามารถลบบัญชีตัวเองได้",
    "Cannot delete the last active admin": "ไม่สามารถลบ Admin คนสุดท้ายได้",
    "Confirmation email does not match": "อีเมลยืนยันไม่ตรงกัน",
    "User not found": "ไม่พบผู้ใช้ที่ต้องการ",
    "Profile not found": "ไม่พบข้อมูลสิทธิ์ของผู้ใช้",
    "Account access blocked; Auth ban needs retry": "ปิดสิทธิ์บัญชีแล้ว แต่ระงับการเข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสถานะแล้วลองใหม่",
    "Unable to activate user; remove the inactive account before retrying": "เปิดสิทธิ์ไม่สำเร็จ กรุณาตรวจและลบบัญชีที่ยังไม่เปิดใช้งานก่อนลองใหม่",
    "Unable to activate user; account creation was rolled back": "เปิดสิทธิ์ไม่สำเร็จ ระบบยกเลิกบัญชีที่สร้างแล้ว กรุณาลองใหม่",
  };
  return NextResponse.json({ error: messages[message] ?? "ดำเนินการไม่สำเร็จชั่วคราว กรุณาตรวจข้อมูลแล้วลองใหม่" }, { status, headers: { "Cache-Control": "no-store" } });
}

async function getUsers() {
  if (!await activeAdminId()) return response("Forbidden", 403);
  return NextResponse.json({ users: await listAdminUsers() },
    { headers: { "Cache-Control": "no-store" } });
}

async function createUser(request: Request) {
  const actorId = await activeAdminId();
  if (!actorId) return response("Forbidden", 403);
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return response("Invalid input", 400);
  const { email, role, fullName, password, confirmPassword } = input as Record<string, unknown>;
  if (typeof email !== "string" || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !validProfile({ role, fullName, isActive: true }) || !validPassword(password, confirmPassword)) {
    return response("Invalid email, profile, or password confirmation", 400);
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim(), password, email_confirm: true,
    user_metadata: { full_name: (fullName as string).trim() },
  });
  if (error || !data.user) return response("Unable to create user", 400);
  const { error: profileError } = await admin.rpc("manage_staff_profile", {
    p_actor_id: actorId, p_target_id: data.user.id, p_role: role,
    p_is_active: true, p_full_name: (fullName as string).trim(),
  });
  if (profileError) {
    const removed = await admin.auth.admin.deleteUser(data.user.id);
    return response(removed.error ? "Unable to activate user; remove the inactive account before retrying"
      : "Unable to activate user; account creation was rolled back", 500);
  }
  return NextResponse.json({ id: data.user.id, email: data.user.email },
    { status: 201, headers: { "Cache-Control": "no-store" } });
}

async function updateUser(request: Request) {
  const actorId = await activeAdminId();
  if (!actorId) return response("Forbidden", 403);
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return response("Invalid input", 400);
  const { id, action, role, fullName, isActive, password, confirmPassword } = input as Record<string, unknown>;
  if (typeof id !== "string" || !uuid.test(id)) return response("Invalid user", 400);
  const admin = createAdminClient();
  if (action === "set_password") {
    if (!validPassword(password, confirmPassword)) return response("Invalid password confirmation", 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    return error ? response("Unable to set password", 400)
      : NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (action !== "update" || !validProfile({ role, fullName, isActive })) return response("Invalid input", 400);
  if (id === actorId && (role !== "admin" || !isActive)) return response("Cannot disable or demote your own admin account", 403);
  const { data: current, error: currentError } = await admin.from("profiles")
    .select("is_active").eq("id", id).maybeSingle();
  if (currentError) return response("Unable to load profiles", 503);
  if (!current) return response("User not found", 404);
  // Inactive database permissions take effect immediately, including existing JWTs.
  if (isActive === false) {
    const { error } = await admin.rpc("manage_staff_profile", {
      p_actor_id: actorId, p_target_id: id, p_role: role,
      p_is_active: false, p_full_name: (fullName as string).trim(),
    });
    if (error) return response("Unable to disable account", 403);
    const ban = await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (ban.error) return response("Account access blocked; Auth ban needs retry", 500);
  } else {
    if (isActive === true && !current.is_active) {
      const unban = await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
      if (unban.error) return response("Unable to enable account", 500);
    }
    const { error } = await admin.rpc("manage_staff_profile", {
      p_actor_id: actorId, p_target_id: id, p_role: role,
      p_is_active: isActive, p_full_name: (fullName as string).trim(),
    });
    if (error) return response("Unable to update profile", 403);
  }
  return NextResponse.json({ ok: true });
}

async function deleteUser(request: Request) {
  const actorId = await activeAdminId();
  if (!actorId) return response("Forbidden", 403);
  const input: unknown = await request.json().catch(() => null);
  if (!input || typeof input !== "object") return response("Invalid input", 400);
  const { id, confirmationEmail } = input as Record<string, unknown>;
  if (typeof id !== "string" || !uuid.test(id) || typeof confirmationEmail !== "string") {
    return response("Invalid input", 400);
  }
  if (id === actorId) return response("Cannot delete your own account", 403);
  const admin = createAdminClient();
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(id);
  if (userError && userError.status !== 404) return response("Unable to load users", 503);
  if (!userResult.user?.email) return response("User not found", 404);
  if (confirmationEmail.trim().toLowerCase() !== userResult.user.email.toLowerCase()) {
    return response("Confirmation email does not match", 400);
  }
  const { data: profile, error: profileError } = await admin.from("profiles")
    .select("role,is_active,full_name").eq("id", id).maybeSingle();
  if (profileError) return response("Unable to load profiles", 503);
  if (!profile || !roles.has(profile.role as ShopRole)) return response("Profile not found", 404);
  const wasActive = profile.is_active;
  const name = profile.full_name?.trim() || userResult.user.email.slice(0, 120);
  const { error: disableError } = await admin.rpc("manage_staff_profile", {
    p_actor_id: actorId, p_target_id: id, p_role: profile.role,
    p_is_active: false, p_full_name: name,
  });
  if (disableError) return response(disableError.message.includes("LAST_ACTIVE_ADMIN")
    ? "Cannot delete the last active admin" : "Unable to delete user", 403);
  const { error: deleteError } = await admin.auth.admin.deleteUser(id);
  if (deleteError) {
    if (wasActive) await admin.rpc("manage_staff_profile", {
      p_actor_id: actorId, p_target_id: id, p_role: profile.role,
      p_is_active: true, p_full_name: name,
    });
    return response("Unable to delete user", 500);
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

async function handle(action: () => Promise<NextResponse>) {
  const start = performance.now();
  try { return await action(); }
  catch { return response("Unavailable", 503); }
  finally { if (process.env.PERF_LOG === "1") console.info(`[perf] admin.users.api ${Math.round(performance.now() - start)}ms`); }
}
export async function GET() { return handle(getUsers); }
export async function POST(request: Request) { return handle(() => createUser(request)); }
export async function PATCH(request: Request) { return handle(() => updateUser(request)); }
export async function DELETE(request: Request) { return handle(() => deleteUser(request)); }
