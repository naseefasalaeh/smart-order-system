import Link from "next/link";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/logout-button";
import CatalogDeleteButton from "@/components/catalog-delete-button";
import MenuAvailabilityForm from "@/components/menu-availability-form";
import { requireDashboardContext, requireDashboardRole } from "@/lib/dashboard-auth";
import { revalidatePath } from "next/cache";

const menuItems = [
  { name: "ภาพรวม", href: "/dashboard" },
  { name: "ออเดอร์", href: "/dashboard/orders" },
  { name: "คิวครัว", href: "/dashboard/kitchen" },
  { name: "พร้อมเสิร์ฟ", href: "/dashboard/ready" },
  { name: "เมนูอาหาร", href: "/dashboard/menus" },
  { name: "วัตถุดิบ", href: "/dashboard/ingredients" },
  { name: "โต๊ะและ QR Code", href: "/dashboard/tables" },
  { name: "ตัวเลือกเสริม", href: "/dashboard/addons" },
  { name: "รายงาน", href: "/dashboard/reports" },
];

export default async function MenusPage({ searchParams }: {
  searchParams: Promise<{ success?: string; error?: string; q?: string; category?: string; status?: string }>;
}) {
  const { db: supabase } = await requireDashboardContext(["admin"]);
  const { success, error: filterError, q = "", category = "", status = "" } = await searchParams;

  const [
    { data: menus, error: menusError },
    { data: categories, error: categoriesError },
    { data: recipes, error: recipesError },
    { data: stock, error: stockError },
  ] = await Promise.all([
    supabase
      .from("menus")
      .select(`
        id,
        category_id,
        name,
        description,
        price,
        image_url,
        is_available,
        updated_at
      `)
      .order("name", { ascending: true }),

    supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase.from("menu_ingredients").select("menu_id,ingredient_id,quantity_required"),
    supabase.from("ingredients").select("id,name,stock_quantity"),
  ]);

  const error = menusError || categoriesError || recipesError || stockError;

  const categoryMap = new Map(
    (categories ?? []).map((category) => [
      category.id,
      category.name,
    ])
  );
  const stockMap = new Map((stock ?? []).map((ingredient) => [ingredient.id, ingredient]));
  const reasons = new Map<number, string>();
  for (const menu of menus ?? []) {
    const menuRecipes = (recipes ?? []).filter((recipe) => recipe.menu_id === menu.id);
    if (!menuRecipes.length) reasons.set(menu.id, "ยังไม่มีสูตรพื้นฐาน");
    else if (menuRecipes.some((recipe) => !stockMap.has(recipe.ingredient_id))) reasons.set(menu.id, "วัตถุดิบในสูตรไม่ครบ");
    else if (menuRecipes.some((recipe) => Number(stockMap.get(recipe.ingredient_id)?.stock_quantity ?? 0) < Number(recipe.quantity_required))) reasons.set(menu.id, "วัตถุดิบในสูตรไม่เพียงพอ");
  }
  const visibleMenus = (menus ?? []).filter((menu) =>
    (!q || menu.name.toLocaleLowerCase("th-TH").includes(q.trim().toLocaleLowerCase("th-TH"))) &&
    (!category || String(menu.category_id) === category) &&
    (!status || menu.is_available === (status === "available"))
  ).sort((a,b) => (categoryMap.get(a.category_id) ?? "").localeCompare(categoryMap.get(b.category_id) ?? "", "th-TH") || a.name.localeCompare(b.name,"th-TH"));

  async function toggleAvailability(formData: FormData) {
    "use server";
    const db = await requireDashboardRole(["admin"]);
    const id = Number(formData.get("id"));
    const available = formData.get("available") === "true";
    if (!Number.isSafeInteger(id) || id <= 0) redirect("/dashboard/menus?error=" + encodeURIComponent("ข้อมูลเมนูไม่ถูกต้อง"));
    if (available) {
      const { data: base, error: baseError } = await db.from("menu_ingredients").select("ingredient_id,quantity_required").eq("menu_id", id);
      if (baseError || !base?.length) redirect("/dashboard/menus?error=" + encodeURIComponent("เปิดขายไม่ได้: ยังไม่มีสูตรพื้นฐาน"));
      const { data: ingredients, error: ingredientsError } = await db.from("ingredients").select("id,stock_quantity").in("id", base.map((row) => row.ingredient_id));
      if (ingredientsError || base.some((row) => Number(ingredients?.find((item) => item.id === row.ingredient_id)?.stock_quantity ?? 0) < Number(row.quantity_required)))
        redirect("/dashboard/menus?error=" + encodeURIComponent("เปิดขายไม่ได้: วัตถุดิบไม่เพียงพอ"));
    }
    const { error: updateError } = await db.from("menus").update({ is_available: available, updated_at: new Date().toISOString() }).eq("id", id);
    if (updateError) { console.error("Toggle menu availability failed", updateError); redirect("/dashboard/menus?error=" + encodeURIComponent("เปลี่ยนสถานะการขายไม่สำเร็จ")); }
    revalidatePath("/dashboard/menus");
    revalidatePath("/table", "layout");
  }

  return (
    <main className="min-h-screen bg-orange-50 lg:flex">
      <aside className="w-full bg-zinc-900 p-6 text-white lg:min-h-screen lg:w-64">
        <div>
          <p className="text-sm font-semibold text-orange-400">
            SMART ORDER
          </p>

          <h1 className="mt-1 text-2xl font-bold">
            ระบบจัดการร้าน
          </h1>
        </div>

        <nav className="mt-8 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`block rounded-xl px-4 py-3 transition ${
                item.name === "เมนูอาหาร"
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

      <section className="min-w-0 flex-1 p-6 sm:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="font-semibold text-orange-500">
                จัดการรายการอาหาร
              </p>

              <h2 className="mt-1 text-3xl font-bold text-zinc-900">
                เมนูอาหาร
              </h2>

              <p className="mt-2 text-zinc-600">
                ตรวจสอบราคา หมวดหมู่ และสถานะการขายของแต่ละเมนู
              </p>
            </div>

            <Link
              href="/dashboard/menus/new"
              className="rounded-xl bg-orange-500 px-5 py-3 text-center font-semibold text-white transition hover:bg-orange-600"
            >
              + เพิ่มเมนูอาหาร
            </Link>
          </header>

          {success && <p role="status" className="mt-6 rounded-xl bg-green-50 p-4 text-green-700">{success}</p>}
          {filterError && <p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{filterError}</p>}
          <form className="mt-6 grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-[1fr_180px_160px_auto]">
            <input name="q" aria-label="ค้นหาชื่อเมนู" placeholder="ค้นหาชื่อเมนู" defaultValue={q} className="rounded-lg border border-zinc-300 px-3 py-2" />
            <select name="category" aria-label="หมวดหมู่" defaultValue={category} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">ทุกหมวดหมู่</option>{(categories ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select name="status" aria-label="สถานะการขาย" defaultValue={status} className="rounded-lg border border-zinc-300 px-3 py-2"><option value="">ทั้งหมด</option><option value="available">พร้อมขาย</option><option value="unavailable">ปิดขาย</option></select>
            <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">ค้นหา / กรอง</button>
          </form>
          {error ? (
            <div className="mt-8 rounded-2xl bg-red-50 p-6 text-red-700">
              ไม่สามารถโหลดข้อมูลเมนูได้ กรุณาลองใหม่
            </div>
          ) : !menus || menus.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
              <p className="font-semibold text-zinc-700">
                ยังไม่มีข้อมูลเมนูอาหาร
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                เมื่อเพิ่มเมนูแล้ว รายการจะแสดงบริเวณนี้
              </p>
            </div>
          ) : (
            <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-6 py-5">
                <h3 className="text-xl font-bold text-zinc-900">
                  รายการเมนูอาหาร
                </h3>

                <p className="mt-1 text-sm text-zinc-500">
                  แสดง {visibleMenus.length} จาก {menus.length} รายการ
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                      <th className="px-6 py-4 font-medium">
                        ชื่อเมนู
                      </th>

                      <th className="px-6 py-4 font-medium">
                        หมวดหมู่
                      </th>

                      <th className="px-6 py-4 font-medium">
                        ราคา
                      </th>

                      <th className="px-6 py-4 font-medium">
                        สถานะ
                      </th>

                      <th className="px-6 py-4 font-medium">
                        อัปเดตล่าสุด
                      </th>

                      <th className="min-w-[250px] px-6 py-4 text-right font-medium">
                        จัดการ
                      </th>
                    </tr>
                  </thead>

                    {visibleMenus.map((menu, index) => (
                      <tbody key={menu.id}>
                      {(index === 0 || menu.category_id !== visibleMenus[index - 1].category_id) && <tr className="bg-orange-50"><th colSpan={6} className="px-6 py-3 text-left font-semibold text-orange-800">{categoryMap.get(menu.category_id) ?? "ไม่ระบุหมวดหมู่"} · {visibleMenus.filter((entry) => entry.category_id === menu.category_id).length} รายการ</th></tr>}
                      <tr
                        className="border-b border-zinc-100 last:border-0"
                      >
                        <td className="px-6 py-5">
                          <p className="font-semibold text-zinc-900">
                            {menu.name}
                          </p>

                          <p className="mt-1 max-w-xs truncate text-sm text-zinc-500">
                            {menu.description || "ไม่มีรายละเอียด"}
                          </p>
                        </td>

                        <td className="px-6 py-5 text-zinc-700">
                          {categoryMap.get(menu.category_id) ||
                            "ไม่ระบุหมวดหมู่"}
                        </td>

                        <td className="px-6 py-5 font-semibold text-zinc-900">
                          {Number(menu.price).toLocaleString("th-TH", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          บาท
                        </td>

                        <td className="px-6 py-5">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                              menu.is_available
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {menu.is_available
                              ? "เปิดขาย"
                              : "ปิดขาย"}
                          </span>
                          {reasons.get(menu.id) && <p className="mt-1 text-xs text-red-700">{reasons.get(menu.id)}</p>}
                        </td>

                        <td className="px-6 py-5 text-sm text-zinc-500">
                          {menu.updated_at
                            ? new Date(
                                menu.updated_at
                              ).toLocaleString("th-TH", {
                                timeZone: "Asia/Bangkok",
                              })
                            : "-"}
                        </td>

                        <td className="min-w-[250px] px-6 py-5">
                          <div aria-label={`จัดการเมนู ${menu.name}`} className="flex flex-wrap items-center justify-end gap-2">
                            <Link
                              href={`/dashboard/menus/${menu.id}/edit`}
                              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
                            >แก้ไข</Link>
                            <MenuAvailabilityForm id={menu.id} available={menu.is_available}
                              disabled={!menu.is_available && reasons.has(menu.id)} action={toggleAvailability} />
                            <CatalogDeleteButton kind="menu" id={Number(menu.id)} name={menu.name} className="inline-block text-left" />
                          </div>
                        </td>
                      </tr>
                      </tbody>
                    ))}
                </table>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
