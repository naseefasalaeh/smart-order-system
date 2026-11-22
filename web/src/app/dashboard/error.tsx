"use client";

import { useTransition } from "react";

export default function DashboardError({ retry }: { retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <main className="flex min-h-screen items-center justify-center bg-orange-50 p-6">
    <section role="alert" className="max-w-lg rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-zinc-900">โหลดข้อมูลไม่สำเร็จชั่วคราว</h1>
      <p className="mt-3 text-zinc-700">ระบบยังตรวจสอบการเข้าสู่ระบบ สิทธิ์ หรือข้อมูลไม่ได้ กรุณาลองใหม่อีกครั้ง</p>
      <button disabled={pending} onClick={() => startTransition(() => retry())}
        className="mt-5 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "กำลังดำเนินการ…" : "ลองใหม่"}
      </button>
    </section>
  </main>;
}
