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
    return (
      <main className="min-h-screen bg-zinc-100 px-5 py-16">
        <div className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="text-center text-2xl font-bold text-red-600">
            โหลดข้อมูลโต๊ะไม่สำเร็จ
          </h1>

          <p className="mt-3 text-center text-sm text-zinc-600">
            หมายเลขโต๊ะ: {tableId}
          </p>

          <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-zinc-100 p-4 text-sm text-red-700">
            {JSON.stringify(tableError, null, 2)}
          </pre>
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

  /*
   * โหลดเมนูพร้อมตัวเลือก เช่น ไข่ดาวและไข่เจียว
   */
  const { data: menus, error: menuError } = await supabase
    .from("menus")
    .select(`
      id,
      name,
      description,
      price,
      image_url,
      is_available,
      menu_options (
        id,
        name,
        additional_price,
        is_available,
        sort_order
      )
    `)
    .eq("is_available", true)
    .order("created_at", { ascending: false });

  /*
   * โหลดสถานะวัตถุดิบของแต่ละเมนู
   */
  const { data: availability, error: availabilityError } =
    await supabase
      .from("menu_stock_availability")
      .select("menu_id, can_order");

  const availabilityMap = new Map<number, boolean>(
    (availability ?? []).map((item) => [
      Number(item.menu_id),
      Boolean(item.can_order),
    ])
  );

  const finalMenus = (menus ?? []).map((menu) => ({
    id: Number(menu.id),
    name: String(menu.name),
    description: menu.description
      ? String(menu.description)
      : null,
    price: Number(menu.price),
    image_url: menu.image_url ? String(menu.image_url) : null,
    can_order:
      availabilityMap.get(Number(menu.id)) ?? false,
    options: (menu.menu_options ?? [])
      .filter((option) => Boolean(option.is_available))
      .sort(
        (firstOption, secondOption) =>
          Number(firstOption.sort_order) -
          Number(secondOption.sort_order)
      )
      .map((option) => ({
        id: Number(option.id),
        name: String(option.name),
        additional_price: Number(option.additional_price),
      })),
  }));

  const loadError = menuError ?? availabilityError;

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

            <div className="shrink-0 rounded-xl bg-orange-500 px-4 py-2 text-center">
              <p className="text-xs text-orange-100">
                หมายเลขโต๊ะ
              </p>

              <p className="text-xl font-bold">
                {table.table_number}
              </p>
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

            <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm">
              {JSON.stringify(loadError, null, 2)}
            </pre>
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