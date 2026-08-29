import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerOrdersBody = {
  tableNumber?: number;
  sessionToken?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CustomerOrdersBody;
    const tableNumber = Number(body.tableNumber);
    const sessionToken = String(body.sessionToken ?? "");

    if (!Number.isInteger(tableNumber) || tableNumber <= 0 || !sessionToken) {
      return NextResponse.json({ error: "ข้อมูลรอบโต๊ะไม่ถูกต้อง" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: session, error: sessionError } = await supabase
      .from("dining_sessions")
      .select("id, status, restaurant_tables!inner(table_number)")
      .eq("access_token", sessionToken)
      .eq("restaurant_tables.table_number", tableNumber)
      .maybeSingle();

    if (sessionError) {
      return NextResponse.json(
        { error: "โหลดรอบโต๊ะไม่สำเร็จ", details: sessionError.message },
        { status: 500 },
      );
    }

    if (!session) {
      return NextResponse.json({ session: null, orders: [] });
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        total_amount,
        note,
        created_at,
        order_items (
          id,
          quantity,
          unit_price,
          subtotal,
          note,
          menus (name),
          order_item_options (
            id,
            option_name,
            additional_price,
            quantity
          )
        )
      `)
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    if (ordersError) {
      return NextResponse.json(
        { error: "โหลดออเดอร์ไม่สำเร็จ", details: ordersError.message },
        { status: 500 },
      );
    }

    const allOrders = orders ?? [];
    const terminalStatuses = new Set(["completed", "cancelled"]);
    const activeOrders = allOrders.filter(
      (order) => !terminalStatuses.has(String(order.status)),
    );

    if (
      session.status === "active" &&
      allOrders.length > 0 &&
      activeOrders.length === 0
    ) {
      const { error: closeError } = await supabase
        .from("dining_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
        })
        .eq("id", session.id)
        .eq("status", "active");

      if (closeError) {
        return NextResponse.json(
          { error: "ปิดรอบโต๊ะไม่สำเร็จ", details: closeError.message },
          { status: 500 },
        );
      }

      return NextResponse.json({
        session: { ...session, status: "closed" },
        orders: [],
      });
    }

    return NextResponse.json({ session, orders: activeOrders });
  } catch (error) {
    return NextResponse.json(
      {
        error: "โหลดออเดอร์ไม่สำเร็จ",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
