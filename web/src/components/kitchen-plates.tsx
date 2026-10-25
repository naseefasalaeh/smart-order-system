"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useOrderViewRefresh } from "./live-order-view";

export default function KitchenPlates({ itemId, quantity, completed, served = [] }: {
  itemId: number; quantity: number; completed: number[]; served?: number[];
}) {
  const refresh = useOrderViewRefresh();
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function toggle(plate: number, checked: boolean) {
    if (locked.current) return;
    locked.current = true;
    setPending(true); setError("");
    window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: true } }));
    try {
      const { error } = await createClient().rpc("set_kitchen_plate", {
        p_item_id: itemId, p_plate: plate, p_completed: checked,
      });
      if (error) setError("บันทึกไม่สำเร็จ กรุณาตรวจสถานะแล้วลองใหม่");
      await refresh?.();
    } catch { setError("เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่"); }
    finally {
      locked.current = false; setPending(false);
      window.dispatchEvent(new CustomEvent("order-mutation", { detail: { pending: false } }));
    }
  }
  return <fieldset disabled={pending} className="mt-3 rounded-xl bg-orange-50 p-3">
    <legend className="text-sm font-medium">เสร็จแล้ว {completed.length}/{quantity} จาน</legend>
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: quantity }, (_, index) => index + 1).map(plate =>
        <label key={plate} className="flex cursor-pointer items-center gap-2 p-2 text-sm">
          <input type="checkbox" disabled={served.includes(plate)} className="h-5 w-5 accent-green-600" checked={completed.includes(plate)}
            onChange={event => void toggle(plate, event.target.checked)} />
          จานที่ {plate}
        </label>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </fieldset>;
}
