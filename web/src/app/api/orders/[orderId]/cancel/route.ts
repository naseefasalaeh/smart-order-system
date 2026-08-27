import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CancelOrderBody = {
  currentStatus?: string;
};

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

const cancellableStatuses = new Set(["pending", "confirmed", "preparing"]);

export async function POST(request: Request, context: RouteContext) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "กรุณาเข้าสู่ระบบก่อนยกเลิกออเดอร์" },
        { status: 401 },
      );
    }

    const { orderId } = await context.params;
    const body = (await request.json()) as CancelOrderBody;
    const currentStatus = body.currentStatus;

    if (!orderId) {
      return NextResponse.json({ error: "ไม่พบรหัสออเดอร์" }, { status: 400 });
    }

    if (!currentStatus || !cancellableStatuses.has(currentStatus)) {
      return NextResponse.json(
        { error: "สถานะออเดอร์ไม่สามารถยกเลิกได้" },
        { status: 400 },
      );
    }

    const adminSupabase = createAdminClient();
    const { error } = await adminSupabase.rpc(
      "cancel_order_and_restore_stock",
      {
        p_order_id: orderId,
        p_current_status: currentStatus,
      },
    );

    if (error) {
      const status = error.message.includes("สถานะออเดอร์ถูกเปลี่ยนไปแล้ว")
        ? 409
        : 400;

      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";

    return NextResponse.json(
      { error: "ไม่สามารถยกเลิกออเดอร์ได้", details: message },
      { status: 500 },
    );
  }
}