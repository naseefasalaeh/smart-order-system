import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Keep the private dining-session token in the POST body, never in a URL.
// Only a change notification crosses this stream; order data still comes from
// the session-validated customer-orders endpoint. No public order SELECT policy.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const tableId = Number(body?.tableId);
  const sessionToken = String(body?.sessionToken ?? "");
  if (!Number.isSafeInteger(tableId) || tableId <= 0 || !/^[0-9a-f-]{36}$/i.test(sessionToken)) {
    return Response.json({ error: "ข้อมูลรอบโต๊ะไม่ถูกต้อง" }, { status: 400 });
  }
  const db = createAdminClient();
  const { data: session, error } = await db.from("dining_sessions")
    .select("id,status").eq("table_id", tableId).eq("access_token", sessionToken).maybeSingle();
  if (error) return Response.json({ error: "ตรวจสอบรอบโต๊ะไม่สำเร็จ" }, { status: 503 });
  if (!session || session.status !== "active") {
    return Response.json({ error: "ไม่พบรอบโต๊ะที่ใช้งานอยู่" }, { status: 403 });
  }

  let ended = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let send: (type: string) => void = () => {};
  let close: () => void = () => {};
  const channel = db.channel(`customer-orders-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `session_id=eq.${session.id}` }, () => send("change"))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `session_id=eq.${session.id}` }, () => send("change"));
  const cleanup = () => {
    if (ended) return;
    ended = true;
    clearInterval(heartbeat); clearTimeout(expiry);
    request.signal.removeEventListener("abort", close);
    void db.removeChannel(channel);
  };
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      send = type => { if (!ended) controller.enqueue(encoder.encode(`${JSON.stringify({ type })}\n`)); };
      close = () => { if (!ended) { cleanup(); controller.close(); } };
      heartbeat = setInterval(() => send("heartbeat"), 15_000);
      // Reconnect and revalidate the session before the hosting timeout.
      expiry = setTimeout(close, 45_000);
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() { cleanup(); },
  });
  if (request.signal.aborted) close();
  else channel.subscribe(status => {
    if (status === "SUBSCRIBED") send("ready");
    else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) close();
  });
  return new Response(stream, { headers: {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "X-Accel-Buffering": "no",
  } });
}
