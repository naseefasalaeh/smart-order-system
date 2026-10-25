"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrderViewRefresh } from "./live-order-view";

export default function ServePlateButton({ itemId, plate, takeaway = false }: { itemId: number; plate: number; takeaway?: boolean }) {
  const refresh = useOrderViewRefresh();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function serve() {
    if (lock.current) return;
    lock.current = true; setPending(true); setError("");
    window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: true } }));
    try {
      const result = await createClient().rpc("serve_order_plate", { p_item_id: itemId, p_plate: plate });
      if (result.error) setError("ยืนยันไม่สำเร็จ กรุณาตรวจสถานะแล้วลองใหม่");
      await refresh?.();
    } catch { setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสถานะก่อนลองใหม่"); }
    finally {
      lock.current = false; setPending(false);
      window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: false } }));
    }
  }
  return <div>
    <button type="button" disabled={pending} onClick={() => void serve()}
      className="rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
      {pending ? "กำลังบันทึก…" : `${takeaway ? "ยืนยันส่งมอบ" : "ยืนยันเสิร์ฟ"} จานที่ ${plate}`}
    </button>
    {error && <p role="alert" className="mt-1 text-sm text-red-600">{error}</p>}
  </div>;
}
