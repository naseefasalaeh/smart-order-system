import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import TableQRCode from "@/components/TableQRCode";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "รายงาน", href: "/dashboard/reports" },
];

export default async function TablesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: tables, error } = await supabase
    .from("restaurant_tables")
    .select("id, table_number")
    .order("table_number", { ascending: true });

  return (
    <main className="min-h-screen bg-zinc-100 lg:flex">
      <aside className="flex w-full flex-col bg-zinc-950 p-6 text-white lg:min-h-screen lg:w-72">
        <div>
          <p className="text-sm font-semibold tracking-[0.25em] text-orange-500">
            SMART ORDER
          </p>

          <h1 className="mt-1 text-2xl font-bold">ระบบจัดการร้าน</h1>
        </div>

        <nav className="mt-8 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                item.name === "โต๊ะและ QR Code"
                  ? "bg-orange-500 font-semibold text-white"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <LogoutButton />
      </aside>

      <section className="flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header>
            <p className="font-semibold text-orange-500">
              จัดการพื้นที่ภายในร้าน
            </p>

            <h2 className="mt-1 text-3xl font-bold text-zinc-900">
              โต๊ะและ QR Code
            </h2>

            <p className="mt-2 text-zinc-600">
              ดาวน์โหลด QR Code สำหรับติดไว้ที่โต๊ะ เมื่อลูกค้าสแกนจะเข้าสู่หน้าสั่งอาหารของโต๊ะนั้น
            </p>
          </header>

          {error ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">
              ไม่สามารถโหลดข้อมูลโต๊ะได้: {error.message}
            </div>
          ) : !tables || tables.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-zinc-700">
                ยังไม่มีข้อมูลโต๊ะ
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                กรุณาเพิ่มข้อมูลในตาราง restaurant_tables ก่อน
              </p>
            </div>
          ) : (
            <>
              <div className="mt-8 rounded-2xl bg-white px-6 py-5 shadow-sm">
                <h3 className="text-xl font-bold text-zinc-900">
                  QR Code ประจำโต๊ะ
                </h3>

                <p className="mt-1 text-sm text-zinc-500">
                  มีโต๊ะทั้งหมด {tables.length} โต๊ะ
                </p>
              </div>

              <section className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {tables.map((table) => (
                  <article
                    key={table.id}
                    className="rounded-2xl bg-white p-6 shadow-sm"
                  >
                    <div className="mb-5 text-center">
                      <p className="text-sm font-semibold text-orange-500">
                        SMART ORDER
                      </p>

                      <h3 className="mt-1 text-2xl font-bold text-zinc-900">
                        โต๊ะ {table.table_number}
                      </h3>

                      <p className="mt-1 text-sm text-zinc-500">
                        สแกนเพื่อดูเมนูและสั่งอาหาร
                      </p>
                    </div>

                    <TableQRCode
                      tableId={String(table.id)}
                      tableNumber={table.table_number}
                    />

                    <Link
                      href={`/table/${table.id}`}
                      target="_blank"
                      className="mt-3 block rounded-lg bg-orange-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-orange-600"
                    >
                      เปิดหน้าสั่งอาหาร
                    </Link>
                  </article>
                ))}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  );
}