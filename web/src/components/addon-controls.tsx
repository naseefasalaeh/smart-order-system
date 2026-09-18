"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAddon, toggleAddon } from "@/app/dashboard/addons/actions";

export default function AddonControls({ id, name, available }: { id: number; name: string; available: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const toggle = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    const form = new FormData(); form.set("id", String(id)); form.set("available", String(!available));
    try { const result = await toggleAddon(form); if (result.error) setMessage(result.error); else router.refresh(); }
    catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (busy || window.prompt(`พิมพ์ชื่อ “${name}” เพื่อยืนยันการลบ`) !== name) return;
    setBusy(true); setMessage("");
    try { const result = await deleteAddon(id, name); if (result.error) setMessage(result.error); else router.refresh(); }
    catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  return <div className="mt-4 flex flex-wrap gap-3 border-t pt-4">
    <button type="button" disabled={busy} onClick={() => void toggle()} className="rounded-lg border px-3 py-2 font-semibold text-zinc-700 disabled:opacity-50">{available ? "ปิดขาย" : "เปิดขาย"}</button>
    <button type="button" disabled={busy} onClick={() => void remove()} className="rounded-lg border border-red-300 px-3 py-2 font-semibold text-red-700 disabled:opacity-50">ลบ Add-on</button>
    {message && <p role="alert" className="w-full text-sm text-red-700">{message}</p>}
  </div>;
}
