import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberAges, memberCookie, memberGenders, normalizePhone } from "@/lib/member-input";

export async function DELETE(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  const token = (await cookies()).get(memberCookie)?.value;
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const { error } = await createAdminClient().rpc("revoke_member_device", { p_hash: createHash("sha256").update(token).digest("hex") });
    if (error) return NextResponse.json({ error: "ยกเลิกการผูกไม่สำเร็จ กรุณาลองใหม่" }, { status: 503 });
  }
  const response = NextResponse.json({ message: "ยกเลิกการผูกอุปกรณ์แล้ว ออเดอร์เดิมยังคงเจ้าของเดิม" });
  response.cookies.delete(memberCookie);
  return response;
}

export async function GET() {
  const token = (await cookies()).get(memberCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    const response = NextResponse.json({ state: "guest" }, { headers: { "Cache-Control": "no-store" } });
    if (token) response.cookies.delete(memberCookie);
    return response;
  }
  const { data, error } = await createAdminClient().from("member_devices").select("active").eq("token_hash", createHash("sha256").update(token).digest("hex")).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) return NextResponse.json({ error: "โหลดสถานะสมาชิกไม่สำเร็จ" }, { status: 503 });
  const response = NextResponse.json({ state: data ? data.active ? "member" : "pending" : "guest", phoneVerified: false, reference: data ? createHash("sha256").update(token).digest("hex").slice(0, 12) : undefined }, { headers: { "Cache-Control": "no-store" } });
  if (!data) response.cookies.delete(memberCookie);
  return response;
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  try {
    const body = await request.json();
    const phone = normalizePhone(body?.phone);
    const gender = body?.gender ?? "unspecified", age = body?.age ?? "unspecified";
    if (!phone || !memberGenders.includes(gender) || !memberAges.includes(age) || typeof body.promotions !== "boolean" || body.accept !== true) return NextResponse.json({ error: "กรุณาตรวจเบอร์มือถือและยอมรับการสมัคร" }, { status: 400 });
    // One browser cannot repeatedly create or overwrite memberships.
    if ((await cookies()).has(memberCookie)) return NextResponse.json({ error: "อุปกรณ์นี้มีคำขอสมาชิกแล้ว กรุณาติดต่อพนักงาน" }, { status: 409 });
    const token = randomBytes(32).toString("hex");
    const { error } = await createAdminClient().rpc("enroll_member", {
      p_phone: phone, p_gender: gender, p_age: age, p_promotions: body.promotions,
      p_hash: createHash("sha256").update(token).digest("hex"),
    });
    if (error) return NextResponse.json({ error: "สมัครไม่สำเร็จ กรุณาลองใหม่หรือติดต่อพนักงาน" }, { status: 503 });
    const response = NextResponse.json({ message: "บันทึกคำขอแล้ว หากเป็นเบอร์เดิมให้พนักงานช่วยตรวจสอบก่อนผูกอุปกรณ์" });
    response.cookies.set(memberCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 180 * 86400 });
    return response;
  } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
}
