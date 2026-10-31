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
  return <details onToggle={event => { if (event.currentTarget.open) void refresh(); }} className="mt-4 rounded-xl border border-orange-200 bg-white p-4">
    <summary className="cursor-pointer font-semibold text-orange-800">สมาชิกสมัครใจ · สั่งอาหารได้โดยไม่ต้องสมัคร</summary>
    <p className="mt-3 text-sm text-zinc-600">ใช้เบอร์มือถือเพื่อบันทึกสมาชิก และใช้เพศ/ช่วงอายุที่เลือกเพื่อดูสถิติเมนูรวม ไม่เก็บวันเกิด ไม่มี SMS/OTP เบอร์นี้ยังไม่ยืนยัน และไม่ใช้เบอร์เพียงอย่างเดียวเป็นหลักฐานเจ้าของสมาชิก</p>
    {state === "member" ? <p className="mt-3 text-green-800">อุปกรณ์นี้ผูกสมาชิกแล้ว · เบอร์ยังไม่ยืนยัน ออเดอร์ใหม่จากอุปกรณ์นี้จะนับเป็นสมาชิก</p>
      : state === "pending" ? <div className="mt-3"><p>กรุณาติดต่อพนักงานเพื่อตรวจสอบการผูกอุปกรณ์เดิม อ้างอิง {reference} ไม่สามารถดูหรือแก้ข้อมูลเดิมด้วยเบอร์โทรได้</p><button type="button" className="mt-2 underline" onClick={() => void refresh()}>ตรวจสถานะอีกครั้ง</button></div>
      : <form className="mt-4 grid gap-3" onSubmit={async event => {
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
        <label>เบอร์มือถือไทย <input name="phone" type="tel" autoComplete="tel" maxLength={40} required className="ml-2 rounded border p-2" /></label>
        <label>เพศ (ไม่บังคับ) <select name="gender" defaultValue="unspecified" className="ml-2 rounded border p-2"><option value="unspecified">ไม่ระบุ</option><option value="female">หญิง</option><option value="male">ชาย</option><option value="other">อื่น ๆ</option></select></label>
        <label>ช่วงอายุ (ไม่บังคับ) <select name="age" defaultValue="unspecified" className="ml-2 rounded border p-2"><option value="unspecified">ไม่ระบุ</option><option value="under18">ต่ำกว่า 18</option>{["18-24","25-34","35-44","45-54"].map(age => <option key={age}>{age}</option>)}<option value="55plus">55 ขึ้นไป</option></select></label>
        <label className="text-sm"><input type="checkbox" name="accept" required /> ต้องการสมัครและรับทราบวัตถุประสงค์ข้างต้น</label>
        <label className="text-sm"><input type="checkbox" name="promotions" /> ยินยอมรับโปรโมชัน (แยกต่างหาก ไม่บังคับ ยังไม่มีการส่ง SMS)</label>
        <button disabled={pending} className="rounded-lg bg-orange-600 p-2 text-white">{pending ? "กำลังบันทึก…" : "สมัครสมาชิกโดยสมัครใจ"}</button>
      </form>}
    <p className="mt-2 text-sm text-zinc-600">เปลี่ยนอุปกรณ์หรือล้างข้อมูล: ติดต่อพนักงานเพื่อช่วยตรวจสอบ จะไม่ผูกสมาชิกเดิมอัตโนมัติจากเบอร์</p>
    {state !== "guest" && <button type="button" disabled={pending} className="mt-3 text-sm underline" onClick={async () => {
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
    <p role="status" className="mt-2 text-sm">{message}</p>
  </details>;
}
