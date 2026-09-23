import ActionForm from "@/components/action-form";
import SubmitButton from "@/components/submit-button";
import Link from "next/link";
import DashboardSidebar from "@/components/dashboard-sidebar";
import MenuAddonPicker from "@/components/menu-addon-picker";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireDashboardContext, requireDashboardRole } from "@/lib/dashboard-auth";
import RecipeIngredientSelector from "./RecipeIngredientSelector";

type EditMenuPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    tab?: string;
    error?: string;
    success?: string;
  }>;
};

export default async function EditMenuPage({
  params,
  searchParams,
}: EditMenuPageProps) {
  const { db: supabase, role, fullName } = await requireDashboardContext(["admin"]);
  const { id } = await params;
  const query = await searchParams;
  const activeTab = ["info", "recipe"].includes(query.tab ?? "")
    ? query.tab
    : "info";

  const [
    { data: menu, error: menuError },
    { data: categories, error: categoriesError },
    { data: ingredients, error: ingredientsError },
    { data: menuIngredients, error: menuIngredientsError },
    groupsResult, optionsResult, addonsResult,
  ] = await Promise.all([
    supabase
      .from("menus")
      .select(
        "id, name, category_id, description, price, image_url, is_available"
      )
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true }),

    supabase
      .from("ingredients")
      .select(`
        id,
        name,
        unit,
        ingredient_categories (
          id,
          name,
          display_order
        )
      `)
      .order("name", { ascending: true }),

    supabase
      .from("menu_ingredients")
      .select("menu_id, ingredient_id, quantity_required")
      .eq("menu_id", id),

    supabase
      .from("menu_option_groups")
      .select("kind, is_required")
      .eq("menu_id", id)
      .eq("kind", "meat"),
    supabase
      .from("menu_options")
      .select("addon_id, is_available")
      .eq("menu_id", id)
      .not("addon_id", "is", null),
      supabase.from("addons").select("id,name,category,additional_price,is_available,max_quantity").order("name"),
  ]);

  if (menuError) throw new Error("โหลดข้อมูลไม่สำเร็จชั่วคราว กรุณาลองใหม่");
  if (!menu) notFound();

  async function updateMenu(formData: FormData) {
    "use server";
    const supabase = await requireDashboardRole(["admin"]);

    const name = String(formData.get("name") ?? "").trim();
    const categoryId = String(
      formData.get("category_id") ?? ""
    ).trim();
    const description = String(
      formData.get("description") ?? ""
    ).trim();
    const price = Number(formData.get("price"));
    const imageUrl = String(
      formData.get("image_url") ?? ""
    ).trim();
    const isAvailable = formData.get("is_available") === "on";

    if (
      !name ||
      !categoryId ||
      Number.isNaN(price) ||
      price < 0
    ) {
      redirect(`/dashboard/menus/${id}/edit?tab=info&error=${encodeURIComponent("กรุณากรอกข้อมูลเมนูให้ถูกต้อง")}`);
    }

    if (addonsResult.error || groupsResult.error || optionsResult.error || ingredientsError) redirect(`/dashboard/menus/${id}/edit?error=${encodeURIComponent("โหลดตัวเลือกเสริมไม่สำเร็จ")}`);
    const { error } = await supabase.rpc("save_menu_with_addons", {
      p_id: Number(id), p_addon_ids: formData.getAll("addon_ids").map(Number),
      p_values: {
        meat_required: formData.get("meat_required") === "on",
        name,
        category_id: categoryId,
        description: description || null,
        price,
        image_url: imageUrl || null,
        is_available: isAvailable,
      },
    });

    if (error) {
      console.error("แก้ไขเมนูไม่สำเร็จ", error);
      redirect(`/dashboard/menus/${id}/edit?tab=info&error=${encodeURIComponent("บันทึกข้อมูลเมนูไม่สำเร็จ กรุณาลองใหม่")}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/menus");
    revalidatePath(`/dashboard/menus/${id}/edit`);
    redirect(`/dashboard/menus/${id}/edit?tab=info&success=${encodeURIComponent("บันทึกข้อมูลเมนูแล้ว")}`);
  }

  async function addIngredient(formData: FormData) {
    "use server";
    const supabase = await requireDashboardRole(["admin"]);

    const ingredientId = String(
      formData.get("ingredient_id") ?? ""
    ).trim();

    const quantityRequired = Number(
      formData.get("quantity_required")
    );

    if (
      !ingredientId ||
      Number.isNaN(quantityRequired) ||
      quantityRequired <= 0
    ) {
      redirect(`/dashboard/menus/${id}/edit?tab=recipe&error=${encodeURIComponent("กรุณาเลือกวัตถุดิบและระบุปริมาณมากกว่า 0")}`);
    }

    const { data: ingredient, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id")
      .eq("id", ingredientId)
      .maybeSingle();

    if (ingredientError || !ingredient) {
      if (ingredientError) console.error("ตรวจวัตถุดิบก่อนบันทึกสูตรไม่สำเร็จ", ingredientError);
      redirect(`/dashboard/menus/${id}/edit?tab=recipe&error=${encodeURIComponent("ไม่พบวัตถุดิบที่เลือก กรุณาโหลดหน้าใหม่")}`);
    }

    const { error } = await supabase
      .from("menu_ingredients")
      .upsert(
        {
          menu_id: id,
          ingredient_id: ingredientId,
          quantity_required: quantityRequired,
        },
        {
          onConflict: "menu_id,ingredient_id",
        }
      );

    if (error) {
      console.error("บันทึกสูตรพื้นฐานไม่สำเร็จ", error);
      redirect(`/dashboard/menus/${id}/edit?tab=recipe&error=${encodeURIComponent("บันทึกสูตรพื้นฐานไม่สำเร็จ กรุณาลองใหม่")}`);
    }

    revalidatePath(`/dashboard/menus/${id}/edit`);
    redirect(`/dashboard/menus/${id}/edit?tab=recipe&success=${encodeURIComponent("บันทึกสูตรพื้นฐานแล้ว")}`);
  }

  async function removeIngredient(formData: FormData) {
    "use server";
    const supabase = await requireDashboardRole(["admin"]);

    const ingredientId = String(
      formData.get("ingredient_id") ?? ""
    ).trim();

    if (!ingredientId) {
      redirect(`/dashboard/menus/${id}/edit?tab=recipe&error=${encodeURIComponent("ข้อมูลวัตถุดิบไม่ถูกต้อง")}`);
    }

    const { error } = await supabase
      .from("menu_ingredients")
      .delete()
      .eq("menu_id", id)
      .eq("ingredient_id", ingredientId);

    if (error) {
      console.error("นำวัตถุดิบออกจากสูตรพื้นฐานไม่สำเร็จ", error);
      redirect(`/dashboard/menus/${id}/edit?tab=recipe&error=${encodeURIComponent("นำวัตถุดิบออกจากสูตรไม่สำเร็จ กรุณาลองใหม่")}`);
    }

    revalidatePath(`/dashboard/menus/${id}/edit`);
    redirect(`/dashboard/menus/${id}/edit?tab=recipe&success=${encodeURIComponent("นำวัตถุดิบออกจากสูตรแล้ว")}`);
  }

  const dataError =
    categoriesError ||
    ingredientsError ||
    menuIngredientsError || groupsResult.error || optionsResult.error || addonsResult.error;
  if (dataError) console.error("โหลดข้อมูลหน้าแก้ไขเมนูไม่สำเร็จ", dataError);
  const normalizedIngredients = (ingredients ?? []).map((ingredient) => ({
    ...ingredient,
    ingredient_categories: Array.isArray(ingredient.ingredient_categories)
      ? (ingredient.ingredient_categories[0] ?? null)
      : ingredient.ingredient_categories,
  }));

  return (
    <div className="min-h-screen bg-orange-50 lg:flex">
    <DashboardSidebar role={role} fullName={fullName} activePath="/dashboard/menus" />
    <main className="min-w-0 flex-1 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/menus"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← กลับหน้าเมนูอาหาร
        </Link>

        {dataError && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
            ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่
          </div>
        )}

        <nav className="mt-6 grid grid-cols-2 overflow-hidden rounded-xl border border-orange-200 bg-white" aria-label="ส่วนแก้ไขเมนู">
          {[
            ["info", "ข้อมูลเมนู"],
            ["recipe", "สูตรพื้นฐาน"],
          ].map(([tab, label]) => (
            <Link
              key={tab}
              href={`/dashboard/menus/${id}/edit?tab=${tab}`}
              className={`px-3 py-3 text-center text-sm font-semibold ${activeTab === tab ? "bg-orange-500 text-white" : "text-zinc-600 hover:bg-orange-50"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {query.error && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{query.error}</div>
        )}
        {query.success && (
          <div className="mt-4 rounded-xl bg-green-50 p-4 text-green-700">{query.success}</div>
        )}

        <section className={`${activeTab === "info" ? "block" : "hidden"} mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8`}>
          <p className="font-semibold text-orange-500">
            จัดการรายการอาหาร
          </p>

          <h1 className="mt-1 text-3xl font-bold text-zinc-900">
            แก้ไขเมนูอาหาร
          </h1>

          <p className="mt-2 text-zinc-600">
            แก้ไขข้อมูล ราคา หมวดหมู่ และสถานะการขาย
          </p>

          <ActionForm action={updateMenu} className="mt-8 space-y-5">
            {addonsResult.error || groupsResult.error || optionsResult.error || ingredientsError ? <p role="alert">โหลดตัวเลือกเสริมไม่สำเร็จ กรุณาโหลดหน้าใหม่ก่อนบันทึก</p> : <MenuAddonPicker meatRequired={(groupsResult.data ?? []).some((g) => g.kind === "meat" && g.is_required)} addons={addonsResult.data ?? []} ingredients={ingredients ?? []} selectedIds={(optionsResult.data ?? []).filter((o) => o.addon_id !== null && o.is_available).map((o) => Number(o.addon_id))} />}
            <div>
              <label
                htmlFor="name"
                className="mb-2 block font-semibold text-zinc-700"
              >
                ชื่อเมนู
              </label>

              <input
                id="name"
                name="name"
                type="text"
                required
                defaultValue={menu.name}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label
                htmlFor="category_id"
                className="mb-2 block font-semibold text-zinc-700"
              >
                หมวดหมู่
              </label>

              <select
                id="category_id"
                name="category_id"
                required
                defaultValue={menu.category_id ?? ""}
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="" disabled>
                  เลือกหมวดหมู่
                </option>

                {(categories ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-2 block font-semibold text-zinc-700"
              >
                รายละเอียด
              </label>

              <textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={menu.description ?? ""}
                className="w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label
                htmlFor="price"
                className="mb-2 block font-semibold text-zinc-700"
              >
                ราคา
              </label>

              <input
                id="price"
                name="price"
                type="number"
                min="0"
                step="0.01"
                required
                defaultValue={menu.price}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label
                htmlFor="image_url"
                className="mb-2 block font-semibold text-zinc-700"
              >
                URL รูปภาพ
              </label>

              <input
                id="image_url"
                name="image_url"
                type="url"
                defaultValue={menu.image_url ?? ""}
                placeholder="https://example.com/image.jpg"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-4">
              <input
                name="is_available"
                type="checkbox"
                defaultChecked={menu.is_available}
                className="h-5 w-5 accent-orange-500"
              />

              <span>
                <span className="block font-semibold text-zinc-700">
                  เปิดขายเมนูนี้
                </span>

                <span className="text-sm text-zinc-500">
                  หากนำเครื่องหมายออก ระบบจะแสดงสถานะปิดขาย
                </span>
              </span>
            </label>

            <div className="flex justify-end pt-3">
              <SubmitButton
                type="submit"
                className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600"
              >
                บันทึกข้อมูลเมนู
              </SubmitButton>
            </div>
          </ActionForm>

        </section>

        <section className={`${activeTab === "recipe" ? "block" : "hidden"} mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8`}>
          <p className="font-semibold text-orange-500">
            สูตรวัตถุดิบ
          </p>

          <h2 className="mt-1 text-2xl font-bold text-zinc-900">
            วัตถุดิบที่ใช้ต่อ 1 จาน
          </h2>

          <p className="mt-2 text-zinc-600">
            กำหนดวัตถุดิบและปริมาณที่ต้องหักจากสต็อก
            เมื่อมีการสั่งเมนูนี้ 1 จาน
          </p>

          <RecipeIngredientSelector
            ingredients={normalizedIngredients}
            selectedIngredients={(menuIngredients ?? []).map((item) => ({
              ingredient_id: Number(item.ingredient_id),
              quantity_required: Number(item.quantity_required),
            }))}
            saveIngredientAction={addIngredient}
            removeIngredientAction={removeIngredient}
          />
        </section>

      </div>
    </main>
    </div>
  );
}
