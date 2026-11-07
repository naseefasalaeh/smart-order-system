"use client";

import { useRef, useState } from "react";

export default function OptionalMembership() {
  const [state, setState] = useState("guest");
  const [reference, setReference] = useState("");
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    try {
      const response = await fetch("/api/membership", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setState(data.state); setReference(data.reference ?? "");
    } catch { /* Membership is optional; ordering remains available. */ }
  }
  return <details onToggle={event => { if (event.currentTarget.open) void refresh(); }} className="group mt-5 overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-gradient-to-r from-orange-50 to-white p-5 marker:hidden sm:p-6 [&::-webkit-details-marker]:hidden">
      <span className="flex min-w-0 items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-700" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="1.8"><path d="M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1v6m3-3h-6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span><span className="block font-bold text-zinc-900">สมัครสมาชิก</span><span className="mt-0.5 block text-sm text-zinc-600">สมัครใจ · สั่งอาหารได้แม้ไม่สมัคร</span></span>
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-700 transition-transform group-open:rotate-180" aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2"><path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    </summary>
    <div className="border-t border-zinc-100 p-5 sm:p-6">
    <p className="max-w-2xl text-sm leading-6 text-zinc-600">ใช้เบอร์มือถือเพื่อบันทึกสมาชิก และใช้เพศ/ช่วงอายุที่เลือกเพื่อดูสถิติเมนูรวม ไม่เก็บวันเกิด ไม่มี SMS/OTP เบอร์นี้ยังไม่ยืนยัน และไม่ใช้เบอร์เพียงอย่างเดียวเป็นหลักฐานเจ้าของสมาชิก</p>
    {state === "member" ? <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><span aria-hidden="true">✓</span><p>อุปกรณ์นี้ผูกสมาชิกแล้ว · เบอร์ยังไม่ยืนยัน ออเดอร์ใหม่จากอุปกรณ์นี้จะนับเป็นสมาชิก</p></div>
      : state === "pending" ? <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><p>กรุณาติดต่อพนักงานเพื่อตรวจสอบการผูกอุปกรณ์เดิม อ้างอิง <span className="font-mono font-semibold">{reference}</span> ไม่สามารถดูหรือแก้ข้อมูลเดิมด้วยเบอร์โทรได้</p><button type="button" className="mt-3 font-semibold text-amber-900 underline underline-offset-2" onClick={() => void refresh()}>ตรวจสถานะอีกครั้ง</button></div>
      : <form className="mt-5 grid gap-4" onSubmit={async event => {
        event.preventDefault();
        if (locked.current) return;
        locked.current = true;
        const form = new FormData(event.currentTarget);
        setPending(true);
        try {
          const response = await fetch("/api/membership", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: form.get("phone"), gender: form.get("gender"), age: form.get("age"), accept: form.get("accept") === "on", promotions: form.get("promotions") === "on" }) });
          const result = await response.json();
          setMessage(response.ok ? result.message : result.error);
          if (response.ok) await refresh();
        } catch { setMessage("เชื่อมต่อไม่สำเร็จ การสั่งอาหารยังใช้ได้ตามปกติ"); }
        finally { locked.current = false; setPending(false); }
      }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-zinc-800 sm:col-span-2">เบอร์มือถือไทย <input name="phone" type="tel" autoComplete="tel" maxLength={40} required placeholder="ตัวอย่าง 08X XXX XXXX" className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100" /></label>
          <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">เพศ <span className="font-normal text-zinc-500">ไม่บังคับ</span><select name="gender" defaultValue="unspecified" className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"><option value="unspecified">ไม่ระบุ</option><option value="female">หญิง</option><option value="male">ชาย</option><option value="other">อื่น ๆ</option></select></label>
          <label className="grid gap-1.5 text-sm font-semibold text-zinc-800">ช่วงอายุ <span className="font-normal text-zinc-500">ไม่บังคับ</span><select name="age" defaultValue="unspecified" className="min-h-12 rounded-xl border border-zinc-300 bg-white px-3 font-normal outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"><option value="unspecified">ไม่ระบุ</option><option value="under18">ต่ำกว่า 18</option>{["18-24","25-34","35-44","45-54"].map(age => <option key={age}>{age}</option>)}<option value="55plus">55 ขึ้นไป</option></select></label>
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-50 p-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-700"><input type="checkbox" name="accept" required className="mt-0.5 h-4 w-4 accent-orange-600" /><span>ต้องการสมัครและรับทราบวัตถุประสงค์ข้างต้น</span></label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-zinc-700"><input type="checkbox" name="promotions" className="mt-0.5 h-4 w-4 accent-orange-600" /><span>ยินยอมรับโปรโมชัน <span className="text-zinc-500">(แยกต่างหาก ไม่บังคับ และยังไม่มีการส่ง SMS)</span></span></label>
        </div>
        <button disabled={pending} className="min-h-12 rounded-xl bg-orange-600 px-5 font-semibold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-200 disabled:cursor-wait disabled:opacity-60">{pending ? "กำลังบันทึก…" : "สมัครสมาชิก"}</button>
      </form>}
    <p className="mt-4 text-xs leading-5 text-zinc-500">เปลี่ยนอุปกรณ์หรือล้างข้อมูล: ติดต่อพนักงานเพื่อช่วยตรวจสอบ ระบบจะไม่ผูกสมาชิกเดิมอัตโนมัติจากเบอร์</p>
    {state !== "guest" && <button type="button" disabled={pending} className="mt-3 text-sm font-medium text-zinc-600 underline underline-offset-2 disabled:opacity-50" onClick={async () => {
      if (locked.current) return;
      locked.current = true;
      setPending(true);
      try {
        const response = await fetch("/api/membership", { method: "DELETE" });
        const result = await response.json();
        setMessage(result.message ?? result.error);
        if (response.ok) { setState("guest"); setReference(""); }
      } catch { setMessage("เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่"); }
      finally { locked.current = false; setPending(false); }
    }}>ยกเลิกการผูกสมาชิกในอุปกรณ์นี้</button>}
    <p role="status" aria-live="polite" className="mt-3 text-sm font-medium text-zinc-700">{message}</p>
    </div>
  </details>;
}
