import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TablesPage() {
  const supabase = await createClient();

  const { data: tables, error } = await supabase
    .from("restaurant_tables")
    .select("id, table_number")
    .order("table_number", { ascending: true });

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-zinc-400 transition hover:text-white"
        >
          ← กลับหน้าหลัก
        </Link>

        <header className="mt-10 text-center">
          <p className="text-sm font-semibold tracking-[0.25em] text-orange-500">
            SMART ORDER
          </p>

          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
            เลือกโต๊ะเพื่อสั่งอาหาร
          </h1>

          <p className="mt-3 text-zinc-400">
            กรุณาเลือกหมายเลขโต๊ะที่คุณกำลังนั่งอยู่
          </p>
        </header>

        {error ? (
          <div className="mt-10 rounded-2xl border border-red-900 bg-red-950/50 p-6 text-center text-red-300">
            ไม่สามารถโหลดข้อมูลโต๊ะได้: {error.message}
          </div>
        ) : !tables || tables.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-zinc-700 p-12 text-center">
            <p className="font-semibold text-zinc-300">
              ยังไม่มีโต๊ะให้เลือก
            </p>

            <p className="mt-2 text-sm text-zinc-500">
              กรุณาติดต่อพนักงาน
            </p>
          </div>
        ) : (
          <section className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((table) => (
              <Link
                key={table.id}
                href={`/table/${table.table_number}`}
                className="group rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center transition hover:-translate-y-1 hover:border-orange-500 hover:bg-zinc-800"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-xl font-bold text-white transition group-hover:bg-orange-600">
                  {table.table_number}
                </div>

                <h2 className="mt-4 text-lg font-bold">
                  โต๊ะ {table.table_number}
                </h2>

                <p className="mt-1 text-sm text-zinc-400">
                  กดเพื่อดูเมนู
                </p>
              </Link>
            ))}
          </section>
        )}

        <p className="mt-10 text-center text-sm text-zinc-500">
          กรุณาตรวจสอบหมายเลขโต๊ะก่อนเริ่มสั่งอาหาร
        </p>
      </div>
    </main>
  );
}