import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function approve(form: FormData) {
  "use server";
  const { db } = await requireDashboardContext(["staff"]);
  const hash = String(form.get("hash") ?? "");
  const note = String(form.get("note") ?? "");
  if (!/^[a-f0-9]{64}$/.test(hash) || form.get("verified") !== "on") throw new Error("กรุณายืนยันการตรวจสอบกับลูกค้า");
  const { error } = await db.rpc("review_member_device", { p_hash: hash, p_note: note });
  if (error) throw new Error("ตรวจสอบคำขอไม่สำเร็จ กรุณาโหลดหน้าใหม่");
  revalidatePath("/dashboard/members");
}

export default async function MembersPage() {
  await requireDashboardContext(["staff"]);
  const { data, error } = await createAdminClient().from("member_devices").select("token_hash,created_at,members(phone)").eq("active", false).gt("expires_at", new Date().toISOString()).order("created_at").limit(100);
  return <main className="min-h-screen bg-orange-50 p-6 text-zinc-900"><div className="mx-auto max-w-3xl">
    <Link href="/dashboard/payments" className="underline">กลับหน้าชำระเงิน</Link>
    <h1 className="mt-4 text-2xl font-bold">ช่วยผูกอุปกรณ์สมาชิกเดิม</h1>
    <p className="mt-3">ตรวจรหัสอ้างอิงจากหน้าจอลูกค้าและหลักฐานการใช้งานเดิมตามขั้นตอนร้าน การบอกเบอร์โทรเพียงอย่างเดียวไม่เพียงพอ หากตรวจสอบไม่ได้ ห้ามอนุมัติ ให้สั่งแบบลูกค้าทั่วไปได้ตามปกติ การอนุมัตินี้ไม่ได้ยืนยันเจ้าของเบอร์โทร</p>
    {error && <p role="alert">โหลดคำขอไม่สำเร็จ กรุณาลองใหม่</p>}
    {(data ?? []).map(device => {
      const member = Array.isArray(device.members) ? device.members[0] : device.members;
      return <form key={device.token_hash} action={approve} className="mt-4 grid gap-3 rounded-xl bg-white p-4">
        <p>อ้างอิง {device.token_hash.slice(0,12)} · เบอร์ ****{member?.phone.slice(-4)} · ยังไม่ยืนยัน</p>
        <input type="hidden" name="hash" value={device.token_hash} />
        <label>บันทึกวิธีตรวจสอบ <textarea required name="note" minLength={10} maxLength={1000} className="block w-full rounded border p-2" /></label>
        <label><input type="checkbox" name="verified" required /> ได้ตรวจสอบกับลูกค้าด้วยหลักฐานเพิ่มเติมแล้ว</label>
        <button className="rounded bg-orange-600 p-2 text-white">อนุมัติผูกอุปกรณ์นี้</button>
      </form>;
    })}
  </div></main>;
}
