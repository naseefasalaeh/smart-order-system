import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CancelOrderBody = {
  sessionToken?: string;
  tableId?: number;
};

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  try {
    const { orderId } = await context.params;
    const body = (await request.json()) as CancelOrderBody;
    if (!uuidPattern.test(orderId)) {
      return NextResponse.json({ error: "ไม่พบรหัสออเดอร์" }, { status: 400 });
    }
    const adminSupabase = createAdminClient();
    if (body.sessionToken !== undefined) {
      if (!uuidPattern.test(body.sessionToken) || !Number.isSafeInteger(body.tableId) || Number(body.tableId) <= 0) {
        return NextResponse.json({ error: "ข้อมูลรอบโต๊ะไม่ถูกต้อง" }, { status: 400 });
      }
      const { data: session, error: sessionError } = await adminSupabase.from("dining_sessions")
        .select("id,table_id")
        .eq("access_token", body.sessionToken)
        .eq("status", "active")
        .eq("table_id", body.tableId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      const { data: order, error: orderError } = await adminSupabase.from("orders")
        .select("id").eq("id", orderId).eq("session_id", session?.id ?? "00000000-0000-0000-0000-000000000000")
        .eq("table_id", session?.table_id ?? -1).maybeSingle();
      if (orderError) throw orderError;
      if (!session || !order) return NextResponse.json({ error: "ไม่มีสิทธิ์ยกเลิกออเดอร์นี้" }, { status: 403 });
    } else {
      const supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError && (authError.status ?? 0) >= 500) throw authError;
      if (!user) return NextResponse.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
      const { data: profile, error: profileError } = await supabase.from("profiles").select("role,is_active").eq("id", user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile?.is_active || !["admin", "staff"].includes(profile.role)) {
        return NextResponse.json({ error: "ไม่มีสิทธิ์ยกเลิกออเดอร์" }, { status: 403 });
      }
    }
    const { error } = await adminSupabase.rpc(
      "cancel_order_and_restore_stock",
      {
        p_order_id: orderId,
        p_current_status: "confirmed",
      },
    );

    if (error) {
      console.error("cancel_order_and_restore_stock ไม่สำเร็จ", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      if (error.code === "42501") {
        return NextResponse.json({ error: "ไม่มีสิทธิ์ยกเลิกออเดอร์นี้" }, { status: 403 });
      }
      return error.code === "P0001"
        ? NextResponse.json({ error: "ไม่สามารถยกเลิกได้ เนื่องจากสถานะออเดอร์เปลี่ยนไปแล้ว" }, { status: 409 })
        : NextResponse.json({ error: "ยกเลิกออเดอร์ไม่สำเร็จชั่วคราว กรุณาตรวจสถานะก่อนลองใหม่" }, { status: 503 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel order API unexpected error", error);

    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกออเดอร์ได้ กรุณาลองใหม่" },
      { status: 500 },
    );
  }
}
