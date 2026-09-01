import Link from "next/link";
import LogoutButton from "@/components/logout-button";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IngredientsClient from "./IngredientsClient";

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

  if (!user) redirect("/login");

  const [ingredientsResult, categoriesResult] = await Promise.all([
    supabase
      .from("ingredients")
      .select(`
        id,
        name,
        unit,
        stock_quantity,
        minimum_stock,
        updated_at,
        ingredient_categories (
          id,
          name,
          is_active
        )
      `)
      .order("name", { ascending: true }),
    supabase
      .from("ingredient_categories")
      .select("id, name, is_active")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const error = ingredientsResult.error ?? categoriesResult.error;
  const normalizedIngredients = (ingredientsResult.data ?? []).map(
    (ingredient) => ({
      ...ingredient,
      ingredient_categories: Array.isArray(ingredient.ingredient_categories)
        ? (ingredient.ingredient_categories[0] ?? null)
        : ingredient.ingredient_categories,
    }),
  );

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <div>
          <p className="text-sm font-semibold text-orange-400">SMART ORDER</p>
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
                ค้นหา กรองหมวดหมู่ และตรวจสอบจำนวนคงเหลือ
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dashboard/ingredients/categories"
                className="rounded-xl border border-orange-300 bg-white px-5 py-3 text-center font-semibold text-orange-700 hover:bg-orange-50"
              >
                จัดการหมวดหมู่
              </Link>
              <Link
                href="/dashboard/ingredients/new"
                className="rounded-xl bg-orange-500 px-5 py-3 text-center font-semibold text-white hover:bg-orange-600"
              >
                + เพิ่มวัตถุดิบ
              </Link>
            </div>
          </header>

          {error ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">
              ไม่สามารถโหลดข้อมูลวัตถุดิบได้ กรุณาลองใหม่
            </div>
          ) : normalizedIngredients.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-zinc-700">
                ยังไม่มีข้อมูลวัตถุดิบ
              </p>
            </div>
          ) : (
            <IngredientsClient
              ingredients={normalizedIngredients}
              activeCategories={categoriesResult.data ?? []}
            />
          )}
        </div>
      </section>
    </main>
  );
}
