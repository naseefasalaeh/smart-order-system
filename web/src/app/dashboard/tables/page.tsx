import DashboardSidebar from "@/components/dashboard-sidebar";
import { requireDashboardContext } from "@/lib/dashboard-auth";
import TablesClient from "./TablesClient";

export default async function TablesPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const { db, role, fullName } = await requireDashboardContext(["admin"]);
  const { error: formError, success } = await searchParams;
  const { data: tables, error } = await db.from("restaurant_tables")
    .select("id,table_number,status").order("table_number", { ascending: true });

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-900 lg:flex">
      <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/tables" />
      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="font-semibold text-orange-500">จัดการพื้นที่ภายในร้าน</p>
            <h2 className="mt-1 text-3xl font-bold">โต๊ะและ QR Code</h2>
            <p className="mt-2 max-w-3xl text-zinc-600">ค้นหาและจัดการโต๊ะ ดาวน์โหลด QR Code สำหรับติดไว้ที่โต๊ะ โดย QR เดิมยังชี้ไปยัง Table ID เดิมเมื่อเปลี่ยนชื่อโต๊ะ</p>
          </header>
          <div aria-live="polite" className="mt-5 min-h-0">
            {formError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{formError}</p>}
            {success && <p role="status" className="rounded-xl bg-green-50 p-4 text-green-700">{success}</p>}
          </div>
          {error ? <div role="alert" className="mt-6 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">โหลดข้อมูลโต๊ะไม่สำเร็จ กรุณาลองใหม่</div>
            : <TablesClient tables={tables ?? []} />}
        </div>
      </section>
    </main>
  );
}
