import Link from "next/link";
import LogoutButton from "@/components/logout-button";

export default function AccessDeniedPage() {
  return <main className="flex min-h-screen items-center justify-center bg-orange-50 p-6">
    <section className="max-w-lg rounded-2xl bg-white p-8 shadow-sm">
      <h1 className="text-xl font-bold text-zinc-900">บัญชีนี้ไม่มีสิทธิ์เข้าหน้านี้</h1>
      <p className="mt-3 text-zinc-700">กรุณาเลือกหน้าตามสิทธิ์ของคุณ หรือติดต่อผู้ดูแลระบบหากบัญชีถูกปิดใช้งาน</p>
      <div className="mt-5 flex flex-wrap gap-4 text-orange-700">
        <Link href="/dashboard">หน้าจัดการร้าน</Link><Link href="/dashboard/kitchen">หน้าครัว</Link>
        <Link href="/login">เข้าสู่ระบบด้วยบัญชีอื่น</Link>
      </div>
      <LogoutButton />
    </section>
  </main>;
}
