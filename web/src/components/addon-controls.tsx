"use client";

import { useRef, useState } from "react";
import { deleteAddon, toggleAddon } from "@/app/dashboard/addons/actions";

export default function AddonControls({ id, name, available }: { id: number; name: string; available: boolean }) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  const toggle = async () => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setMessage("");
    const form = new FormData(); form.set("id", String(id)); form.set("available", String(!available));
    try { const result = await toggleAddon(form); if (result.error) setMessage(result.error); }
    catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { locked.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (locked.current || window.prompt(`พิมพ์ชื่อ “${name}” เพื่อยืนยันการลบ`) !== name) return;
    locked.current = true;
    setBusy(true); setMessage("");
    try { const result = await deleteAddon(id, name); if (result.error) setMessage(result.error); }
    catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { locked.current = false; setBusy(false); }
  };
  return <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
    <button type="button" disabled={busy} onClick={() => void toggle()} className="rounded-lg border px-3 py-2 font-semibold text-zinc-700 disabled:opacity-50">{busy ? "กำลังดำเนินการ…" : available ? "ปิดขาย" : "เปิดขาย"}</button>
    <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700 disabled:opacity-50">{busy ? "กำลังดำเนินการ…" : "ลบ Add-on"}</button>
    {message && <p role="alert" className="w-full text-sm text-red-700">{message}</p>}
  </div>;
}
