import Link from "next/link";
import LogoutButton from "@/components/logout-button";
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

export default async function IngredientsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ingredients, error } = await supabase
    .from("ingredients")
    .select(`
      id,
      name,
      unit,
      stock_quantity,
      minimum_stock,
      updated_at
    `)
    .order("name", { ascending: true });

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <div>
          <p className="text-sm font-semibold text-orange-400">
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
                item.name === "วัตถุดิบ"
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
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <p className="font-semibold text-orange-500">
                จัดการคลังวัตถุดิบ
                </p>

                <h2 className="mt-1 text-3xl font-bold text-zinc-900">
                วัตถุดิบ
                </h2>

                <p className="mt-2 text-zinc-600">
                ตรวจสอบจำนวนคงเหลือและวัตถุดิบที่ใกล้หมด
                </p>
            </div>

            <Link
                href="/dashboard/ingredients/new"
                className="rounded-xl bg-orange-500 px-5 py-3 text-center font-semibold text-white transition hover:bg-orange-600"
            >
                + เพิ่มวัตถุดิบ
            </Link>
          </header>

          {error ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">
              ไม่สามารถโหลดข้อมูลวัตถุดิบได้: {error.message}
            </div>
          ) : !ingredients || ingredients.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-zinc-700">
                ยังไม่มีข้อมูลวัตถุดิบ
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                เมื่อเพิ่มวัตถุดิบแล้ว รายการจะแสดงบริเวณนี้
              </p>
            </div>
          ) : (
            <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-6 py-5">
                <h3 className="text-xl font-bold text-zinc-900">
                  รายการวัตถุดิบ
                </h3>

                <p className="mt-1 text-sm text-zinc-500">
                  มีวัตถุดิบทั้งหมด {ingredients.length} รายการ
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[750px] text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                      <th className="px-6 py-4 font-medium">ชื่อวัตถุดิบ</th>
                      <th className="px-6 py-4 font-medium">คงเหลือ</th>
                      <th className="px-6 py-4 font-medium">จุดแจ้งเตือน</th>
                      <th className="px-6 py-4 font-medium">สถานะ</th>
                      <th className="px-6 py-4 font-medium">
                        อัปเดตล่าสุด
                      </th>

                      <th className="px-6 py-4 text-right font-medium">
                        จัดการ
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {ingredients.map((ingredient) => {
                      const stockQuantity = Number(
                        ingredient.stock_quantity ?? 0
                      );

                      const minimumStock = Number(
                        ingredient.minimum_stock ?? 0
                      );

                      const isLowStock =
                        stockQuantity <= minimumStock;

                      return (
                        <tr
                          key={ingredient.id}
                          className="border-b border-zinc-100 last:border-0"
                        >
                          <td className="px-6 py-5 font-semibold text-zinc-900">
                            {ingredient.name}
                          </td>

                          <td className="px-6 py-5 text-zinc-700">
                            {stockQuantity.toLocaleString("th-TH")}{" "}
                            {ingredient.unit}
                          </td>

                          <td className="px-6 py-5 text-zinc-700">
                            {minimumStock.toLocaleString("th-TH")}{" "}
                            {ingredient.unit}
                          </td>

                          <td className="px-6 py-5">
                            <span
                              className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                                isLowStock
                                  ? "bg-red-100 text-red-700"
                                  : "bg-green-100 text-green-700"
                              }`}
                            >
                              {isLowStock ? "ใกล้หมด" : "ปกติ"}
                            </span>
                          </td>

                          <td className="px-6 py-5 text-sm text-zinc-500">
                            {ingredient.updated_at
                              ? new Date(
                                  ingredient.updated_at
                                ).toLocaleString("th-TH", {
                                  timeZone: "Asia/Bangkok",
                                })
                              : "-"}
                          </td>
                          <td className="px-6 py-5 text-right">
                            <Link
                                href={`/dashboard/ingredients/${ingredient.id}/edit`}
                                className="inline-block rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
                            >
                                แก้ไข
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}