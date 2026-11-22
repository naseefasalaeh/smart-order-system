"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type CollectItemPaymentInput = {
  requestId: string;
  method: "cash" | "qr_code";
  items: Array<{ item_id: number; quantity: number }>;
};

export type CollectItemPaymentResult = {
  success: boolean;
  data?: {
    payment_id: string;
    amount_satang: number;
  };
  error?: string;
  code?: string;
};

export async function collectItemPaymentAction(
  input: CollectItemPaymentInput
): Promise<CollectItemPaymentResult> {
  try {
    const { user } = await requireDashboardContext(["staff", "admin"]);

    const { requestId, method, items } = input;

    if (!requestId || typeof requestId !== "string") {
      return { success: false, error: "INVALID_PAYMENT (รหัสคำขอไม่ถูกต้อง)", code: "INVALID_PAYMENT" };
    }
    if (!["cash", "qr_code"].includes(method)) {
      return { success: false, error: "INVALID_PAYMENT (วิธีชำระเงินไม่ถูกต้อง)", code: "INVALID_PAYMENT" };
    }
    if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
      return { success: false, error: "INVALID_PAYMENT (ไม่มีรายการอาหารที่เลือก)", code: "INVALID_PAYMENT" };
    }
    if (items.some(item => !item.item_id || !item.quantity || item.quantity <= 0)) {
      return { success: false, error: "INVALID_ITEMS (ข้อมูลรายการอาหารไม่ถูกต้อง)", code: "INVALID_ITEMS" };
    }
    const distinctIds = new Set(items.map(i => i.item_id));
    if (distinctIds.size !== items.length) {
      return { success: false, error: "INVALID_ITEMS (พบรายการอาหารซ้ำในคำขอ)", code: "INVALID_ITEMS" };
    }

    const admin = createAdminClient();

    // 1. Check idempotency
    const { data: existingPayment } = await admin
      .from("payments")
      .select("id, amount_satang, request_payload")
      .eq("request_id", requestId)
      .maybeSingle();

    if (existingPayment) {
      return {
        success: true,
        data: {
          payment_id: existingPayment.id,
          amount_satang: Number(existingPayment.amount_satang),
        },
      };
    }

    // 2. Fetch order_items with prices, orders, and current payment allocations
    const itemIds = items.map(i => i.item_id);
    const { data: dbItems, error: itemsError } = await admin
      .from("order_items")
      .select(`
        id,
        order_id,
        quantity,
        unit_price,
        orders (
          id,
          status,
          session_id,
          stock_deducted,
          total_amount
        ),
        payment_allocations (
          quantity,
          payments (status)
        )
      `)
      .in("id", itemIds);

    if (itemsError || !dbItems || dbItems.length !== items.length) {
      return {
        success: false,
        error: `ITEM_NOT_FOUND (ค้นหารายการอาหารไม่ครบ: ${itemsError?.message || "บางรายการอาจถูกลบ"})`,
        code: "ITEM_NOT_FOUND",
      };
    }

    // 3. Verify order status ('served')
    const orderIds = [...new Set(dbItems.map(i => i.order_id))];
    for (const item of dbItems) {
      const order = Array.isArray(item.orders) ? item.orders[0] : item.orders;
      if (!order) {
        return { success: false, error: "ORDER_NOT_FOUND (ไม่พบออเดอร์)", code: "ORDER_NOT_FOUND" };
      }
      if (order.status !== "served") {
        return {
          success: false,
          error: `ORDER_NOT_SERVED (ออเดอร์ต้องอยู่ในสถานะ 'served' แต่ปัจจุบันเป็น '${order.status}')`,
          code: "ORDER_NOT_SERVED",
        };
      }
    }

    // 4. Validate item quantities and compute satang
    let totalSatang = 0;
    const validatedAllocations: Array<{
      order_item_id: number;
      quantity: number;
      amount_satang: number;
    }> = [];

    for (const line of items) {
      const dbItem = dbItems.find(x => x.id === line.item_id);
      if (!dbItem) continue;
      const allocs = (dbItem.payment_allocations || []) as unknown as Array<{
        quantity: number;
        payments: { status: string } | Array<{ status: string }> | null;
      }>;
      const paidQty = allocs
        .filter(a => {
          const status = Array.isArray(a.payments) ? a.payments[0]?.status : a.payments?.status;
          return status === "paid";
        })
        .reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
      const remaining = dbItem.quantity - paidQty;
      if (line.quantity > remaining) {
        return {
          success: false,
          error: "ITEM_ALREADY_PAID (มีบางรายการที่ถูกชำระเงินไปแล้ว กรุณารีเฟรชยอด)",
          code: "ITEM_ALREADY_PAID",
        };
      }
      const lineSatang = Math.round(Number(dbItem.unit_price) * 100) * line.quantity;
      totalSatang += lineSatang;
      validatedAllocations.push({
        order_item_id: line.item_id,
        quantity: line.quantity,
        amount_satang: lineSatang,
      });
    }

    if (totalSatang <= 0 || validatedAllocations.length === 0) {
      return {
        success: false,
        error: "INVALID_ITEMS (ยอดชำระต้องมากกว่า 0 บาท)",
        code: "INVALID_ITEMS",
      };
    }

    // 5. Insert payment record (anchor to first order)
    const anchorOrderId = orderIds[0];
    const { data: paymentRow, error: paymentError } = await admin
      .from("payments")
      .insert({
        order_id: anchorOrderId,
        payment_method: method,
        amount: totalSatang / 100,
        amount_satang: totalSatang,
        status: "paid",
        paid_at: new Date().toISOString(),
        request_id: requestId,
        request_payload: { method, items },
        received_by: user.id,
      })
      .select("id")
      .single();

    if (paymentError || !paymentRow) {
      console.error("[collectItemPaymentAction] Insert payment error:", paymentError);
      return {
        success: false,
        error: `บันทึกการชำระเงินไม่สำเร็จ: ${paymentError?.message || "Database insert error"}`,
        code: paymentError?.code,
      };
    }

    // 6. Insert payment_allocations
    const allocRecords = validatedAllocations.map(a => ({
      payment_id: paymentRow.id,
      order_item_id: a.order_item_id,
      quantity: a.quantity,
      amount_satang: a.amount_satang,
    }));

    const { error: allocError } = await admin
      .from("payment_allocations")
      .insert(allocRecords);

    if (allocError) {
      console.error("[collectItemPaymentAction] Insert allocations error:", allocError);
      return {
        success: false,
        error: `บันทึกรายการจัดสรรชำระเงินไม่สำเร็จ: ${allocError.message}`,
        code: allocError.code,
      };
    }

    // 7. Check order completion for all affected orders
    for (const orderId of orderIds) {
      const { data: allItemsInOrder } = await admin
        .from("order_items")
        .select(`
          id,
          quantity,
          payment_allocations (
            quantity,
            payments (status)
          )
        `)
        .eq("order_id", orderId);

      const isFullyPaid =
        (allItemsInOrder || []).length > 0 &&
        (allItemsInOrder || []).every(item => {
          const itemAllocs = (item.payment_allocations || []) as unknown as Array<{
            quantity: number;
            payments: { status: string } | Array<{ status: string }> | null;
          }>;
          const paid = itemAllocs
            .filter(a => {
              const status = Array.isArray(a.payments) ? a.payments[0]?.status : a.payments?.status;
              return status === "paid";
            })
            .reduce((sum, a) => sum + (Number(a.quantity) || 0), 0);
          return paid >= item.quantity;
        });

      if (isFullyPaid) {
        await admin
          .from("orders")
          .update({
            status: "completed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
      } else {
        await admin
          .from("orders")
          .update({
            updated_at: new Date().toISOString(),
          })
          .eq("id", orderId);
      }
    }

    // 8. Close dining sessions if all orders in session are completed or cancelled
    const sessionIds = [
      ...new Set(
        dbItems
          .map(i => {
            const ord = Array.isArray(i.orders) ? i.orders[0] : i.orders;
            return ord?.session_id;
          })
          .filter(Boolean)
      ),
    ];

    for (const sessionId of sessionIds) {
      const { data: uncompletedOrders } = await admin
        .from("orders")
        .select("id")
        .eq("session_id", sessionId)
        .not("status", "in", '("completed","cancelled")');

      if (!uncompletedOrders || uncompletedOrders.length === 0) {
        await admin
          .from("dining_sessions")
          .update({
            status: "closed",
            closed_at: new Date().toISOString(),
          })
          .eq("id", sessionId)
          .eq("status", "active");
      }
    }

    revalidatePath("/dashboard/payments");
    revalidatePath("/dashboard/orders");

    return {
      success: true,
      data: {
        payment_id: paymentRow.id,
        amount_satang: totalSatang,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการประมวลผลการชำระเงิน";
    console.error("[collectItemPaymentAction] Exception:", err);
    return {
      success: false,
      error: message,
      code: "EXCEPTION",
    };
  }
}
