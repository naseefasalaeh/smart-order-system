import Link from "next/link";
import { loadCustomerMenuCatalog } from "@/lib/customer-menu-catalog";
import { createClient } from "@/lib/supabase/server";
import MenuClient from "./MenuClient";

type TablePageProps = {
  params: Promise<{
    tableId: string;
  }>;
};

export default async function TablePage({ params }: TablePageProps) {
  const { tableId } = await params;
  const supabase = await createClient();

  // tableId ใน URL หมายถึง table_number
  const tableNumber = Number(tableId);

  if (!Number.isInteger(tableNumber) || tableNumber <= 0) {
    return (
      <main className="min-h-screen bg-zinc-100 px-5 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-red-600">
            หมายเลขโต๊ะไม่ถูกต้อง
          </h1>

          <p className="mt-3 text-sm text-zinc-600">
            กรุณาเลือกโต๊ะใหม่อีกครั้ง
          </p>
        </div>
      </main>
    );
  }

  const { data: table, error: tableError } = await supabase
    .from("restaurant_tables")
    .select("id, table_number, status")
    .eq("table_number", tableNumber)
    .maybeSingle();

  if (tableError) {
    console.error("โหลดข้อมูลโต๊ะไม่สำเร็จ", tableError);
    return (
      <main className="min-h-screen bg-zinc-100 px-5 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-red-600">
            โหลดข้อมูลโต๊ะไม่สำเร็จ
          </h1>

          <p className="mt-3 text-center text-sm text-zinc-600">
            หมายเลขโต๊ะ: {tableId}
          </p>

          <p className="mt-3 text-center text-sm text-zinc-600">
            กรุณาลองใหม่อีกครั้งหรือติดต่อพนักงาน
          </p>
        </div>
      </main>
    );
  }

  if (!table) {
    return (
      <main className="min-h-screen bg-zinc-100 px-5 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-red-600">
            ไม่พบข้อมูลโต๊ะ
          </h1>

          <p className="mt-2 text-sm text-zinc-600">
            ไม่พบโต๊ะหมายเลข:
          </p>

          <p className="mt-2 break-all rounded-xl bg-zinc-100 p-3 text-sm font-semibold">
            {tableId}
          </p>
        </div>
      </main>
    );
  }

  let finalMenus = [] as Awaited<ReturnType<typeof loadCustomerMenuCatalog>>;
  let loadError = false;

  try {
    finalMenus = await loadCustomerMenuCatalog();
  } catch (error) {
    loadError = true;
    console.error("โหลด customer menu catalog ไม่สำเร็จ", error);
  }

  return (
    <main className="min-h-screen bg-zinc-100 pb-32">
      <header className="bg-zinc-900 text-white shadow-md">
        <div className="mx-auto max-w-5xl px-5 py-7">
          <p className="text-sm font-semibold tracking-[0.2em] text-orange-400">
            SMART ORDER
          </p>

          <div className="mt-1 flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">
                เลือกเมนูอาหาร
              </h1>

              <p className="mt-1 text-sm text-zinc-300">
                เลือกอาหารที่ต้องการแล้วเพิ่มลงตะกร้า
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-wrap justify-end gap-2">
                <Link
                  href={`/table/${table.table_number}/orders`}
                  className="rounded-xl border border-orange-400 px-4 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500 hover:text-white"
                >
                  ดูออเดอร์ของฉัน
                </Link>

                <Link
                  href={`/table/${table.table_number}/queue`}
                  className="rounded-xl border border-orange-400 px-4 py-3 text-sm font-bold text-orange-300 transition hover:bg-orange-500 hover:text-white"
                >
                  ดูคิวร้าน
                </Link>
              </div>

              <div className="rounded-xl bg-orange-500 px-4 py-2 text-center">
                <p className="text-xs text-orange-100">
                  หมายเลขโต๊ะ
                </p>

                <p className="text-xl font-bold">
                  {table.table_number}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-5 py-8">
        <div>
          <p className="font-semibold text-orange-500">
            รายการอาหาร
          </p>

          <h2 className="mt-1 text-3xl font-bold text-zinc-900">
            เมนูแนะนำ
          </h2>
        </div>

        {loadError ? (
          <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700 shadow-sm">
            <p className="font-semibold">
              ไม่สามารถโหลดรายการอาหารได้
            </p>

            <p className="mt-2 text-sm">กรุณาลองใหม่อีกครั้งหรือติดต่อพนักงาน</p>
          </div>
        ) : finalMenus.length === 0 ? (
          <div className="mt-8 rounded-2xl bg-white p-10 text-center shadow-sm">
            <p className="font-semibold text-zinc-700">
              ยังไม่มีเมนูที่เปิดขาย
            </p>

            <p className="mt-1 text-sm text-zinc-400">
              กรุณาติดต่อพนักงาน
            </p>
          </div>
        ) : (
          <MenuClient
            menus={finalMenus}
            tableId={String(table.id)}
            tableNumber={Number(table.table_number)}
          />
        )}
      </section>
    </main>
  );
}
