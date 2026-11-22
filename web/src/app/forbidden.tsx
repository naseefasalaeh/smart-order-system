import Link from "next/link";
export default function Forbidden() {
  return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6"><section className="rounded-2xl bg-white p-8 text-center shadow-sm"><h1 className="text-3xl font-bold">403 — ไม่มีสิทธิ์เข้าถึง</h1><p className="mt-4">บัญชีของคุณไม่มีสิทธิ์ใช้หน้านี้หรือดำเนินการนี้</p><Link href="/login" className="mt-6 inline-block text-orange-600">กลับไปเข้าสู่ระบบ</Link></section></main>;
}
