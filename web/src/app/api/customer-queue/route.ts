import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

type CustomerQueueBody = {
  tableNumber?: number;
  sessionToken?: string;
};

const queueStatuses = ["pending", "confirmed", "preparing", "ready"];
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function emptyResponse(status: number) {
  return new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  let body: CustomerQueueBody;

  try {
    body = (await request.json()) as CustomerQueueBody;
  } catch {
    return emptyResponse(400);
  }

  const tableNumber = Number(body.tableNumber);
  const sessionToken = String(body.sessionToken ?? "");

  if (
    !Number.isInteger(tableNumber) ||
    tableNumber <= 0 ||
    !uuidPattern.test(sessionToken)
  ) {
    return emptyResponse(400);
  }

  try {
    const supabase = createAdminClient();
    const { data: session, error: sessionError } = await supabase
      .from("dining_sessions")
      .select("id, restaurant_tables!inner(table_number)")
      .eq("access_token", sessionToken)
      .eq("status", "active")
      .eq("restaurant_tables.table_number", tableNumber)
      .maybeSingle();

    if (sessionError) {
      return emptyResponse(500);
    }

    if (!session) {
      return emptyResponse(401);
    }

    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("id, order_number, status, created_at, session_id")
      .in("status", queueStatuses)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (ordersError) {
      return emptyResponse(500);
    }

    const queue = (orders ?? []).flatMap((order) => {
      if (order.order_number === null || order.order_number === undefined) {
        return [];
      }

      const rawQueueNumber = String(order.order_number);

      return [
        {
          queueNumber: rawQueueNumber.startsWith("#")
            ? rawQueueNumber
            : `#${rawQueueNumber}`,
          status: String(order.status),
          created_at: String(order.created_at),
          isMine: String(order.session_id) === String(session.id),
        },
      ];
    });

    return NextResponse.json(queue, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return emptyResponse(500);
  }
}
