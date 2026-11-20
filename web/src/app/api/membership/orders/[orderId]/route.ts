import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { memberCookie } from "@/lib/member-input";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const token = (await cookies()).get(memberCookie)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: "ไม่พบเซสชันสมาชิก" }, { status: 401 });
  }

  const { orderId } = await params;
  if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "รหัสออเดอร์ไม่ถูกต้อง" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await createAdminClient().rpc("get_member_order_detail", {
    p_hash: tokenHash,
    p_order_id: orderId,
  });

  if (error) {
    if (error.message?.includes("UNAUTHORIZED")) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงออเดอร์นี้" }, { status: 403 });
    }
    if (error.message?.includes("ORDER_NOT_FOUND")) {
      return NextResponse.json({ error: "ไม่พบข้อมูลออเดอร์" }, { status: 404 });
    }
    return NextResponse.json({ error: "โหลดรายละเอียดออเดอร์ไม่สำเร็จ" }, { status: 503 });
  }

  return NextResponse.json(
    { order: data },
    { headers: { "Cache-Control": "no-store" } }
  );
}
