"use client";

import { useState } from "react";

export default function IngredientResetFields({ days = null, start = "", time = "00:00" }: {
  days?: number | null; start?: string | null; time?: string | null;
}) {
  const [mode, setMode] = useState(days === null ? "none" : days === 1 ? "daily" : "interval");
  return <fieldset className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
    <legend className="px-1 font-semibold text-zinc-800">รีเซ็ตสต็อกอัตโนมัติ</legend>
    <label htmlFor="reset_mode" className="block text-sm font-medium text-zinc-700">รอบรีเซ็ต</label>
      <select id="reset_mode" name="reset_mode" value={mode} onChange={event => setMode(event.target.value)}
        className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3">
        <option value="none">ไม่รีเซ็ต (ยกยอดต่อ)</option>
        <option value="daily">รีเซ็ตทุกวัน</option>
        <option value="interval">รีเซ็ตทุกกี่วัน</option>
      </select>
    {mode !== "none" && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {mode === "interval" && <label className="text-sm font-medium text-zinc-700">ทุกกี่วัน
        <input name="reset_every_days" type="number" min="1" max="3650" step="1" required defaultValue={days ?? 2}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3" />
      </label>}
      <label className="text-sm font-medium text-zinc-700">วันเริ่มต้น
        <input name="reset_start_date" type="date" required defaultValue={start ?? ""}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3" />
      </label>
      <label className="text-sm font-medium text-zinc-700">เวลารีเซ็ต (เวลาไทย)
        <input name="reset_time" type="time" step="60" required defaultValue={(time ?? "00:00").slice(0,5)}
          className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-3" />
      </label>
    </div>}
    <p className="mt-3 text-sm leading-6 text-zinc-600">รีเซ็ตยอดพร้อมใช้เป็น 0 โดยไม่แตะวัตถุดิบที่หักไว้ให้ออเดอร์ค้าง ทำงานแม้ปิดเว็บ โดยไม่เก็บประวัติยอดสต็อก</p>
    {mode !== "none" && <p className="mt-1 text-sm text-zinc-600">ใช้เวลาไทย ตรวจรอบทุกนาที หากเวลาเริ่มต้นผ่านไปแล้ว จะเริ่มที่รอบถัดไป</p>}
  </fieldset>;
}
