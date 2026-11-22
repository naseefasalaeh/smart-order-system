import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberCookie } from "@/lib/member-input";

export async function GET(request: Request) {
  const token = (await cookies()).get(memberCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "ไม่พบเซสชันสมาชิก" }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const { data, error } = await createAdminClient().rpc("get_member_orders", {
    p_hash: tokenHash,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return NextResponse.json({ error: "โหลดประวัติการสั่งอาหารไม่สำเร็จ" }, { status: 503 });
  }

  return NextResponse.json(
    { orders: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
