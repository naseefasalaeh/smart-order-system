import { NextResponse } from "next/server";
import { collectItemPaymentAction } from "@/app/dashboard/payments/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await collectItemPaymentAction(body);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error, code: result.code },
        { status: 400 }
      );
    }
    return NextResponse.json({ data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[API /api/orders/payment] Error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
