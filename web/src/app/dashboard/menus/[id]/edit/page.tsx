import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import RecipeIngredientSelector from "./RecipeIngredientSelector";

type EditMenuPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditMenuPage({
  params,
}: EditMenuPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: menu, error: menuError },
    { data: categories, error: categoriesError },
    { data: ingredients, error: ingredientsError },
    { data: menuIngredients, error: menuIngredientsError },
  ] = await Promise.all([
    supabase
      .from("menus")
      .select(
        "id, name, category_id, description, price, image_url, is_available"
      )
      .eq("id", id)
      .single(),

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
  ]);

  if (menuError || !menu) {
    notFound();
  }

  async function updateMenu(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user: actionUser },
    } = await supabase.auth.getUser();

    if (!actionUser) redirect("/login");

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
      return;
    }

    const { error } = await supabase
      .from("menus")
      .update({
        name,
        category_id: categoryId,
        description: description || null,
        price,
        image_url: imageUrl || null,
        is_available: isAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      throw new Error(`ไม่สามารถแก้ไขเมนูได้: ${error.message}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/menus");
    revalidatePath(`/dashboard/menus/${id}/edit`);
    redirect("/dashboard/menus");
  }

  async function addIngredient(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user: actionUser },
    } = await supabase.auth.getUser();

    if (!actionUser) redirect("/login");

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
      return;
    }

    const { data: ingredient, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id")
      .eq("id", ingredientId)
      .maybeSingle();

    if (ingredientError || !ingredient) {
      throw new Error("ไม่พบวัตถุดิบที่เลือก กรุณาโหลดหน้าใหม่");
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
      throw new Error(
        `ไม่สามารถเพิ่มวัตถุดิบได้: ${error.message}`
      );
    }

    revalidatePath(`/dashboard/menus/${id}/edit`);
  }

  async function removeIngredient(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user: actionUser },
    } = await supabase.auth.getUser();

    if (!actionUser) redirect("/login");

    const ingredientId = String(
      formData.get("ingredient_id") ?? ""
    ).trim();

    if (!ingredientId) {
      return;
    }

    const { error } = await supabase
      .from("menu_ingredients")
      .delete()
      .eq("menu_id", id)
      .eq("ingredient_id", ingredientId);

    if (error) {
      throw new Error(
        `ไม่สามารถลบวัตถุดิบได้: ${error.message}`
      );
    }

    revalidatePath(`/dashboard/menus/${id}/edit`);
  }

  const dataError =
    categoriesError ||
    ingredientsError ||
    menuIngredientsError;
  const normalizedIngredients = (ingredients ?? []).map((ingredient) => ({
    ...ingredient,
    ingredient_categories: Array.isArray(ingredient.ingredient_categories)
      ? (ingredient.ingredient_categories[0] ?? null)
      : ingredient.ingredient_categories,
  }));

  return (
    <main className="min-h-screen bg-orange-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/dashboard/menus"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← กลับหน้าเมนูอาหาร
        </Link>

        {dataError && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
            ไม่สามารถโหลดข้อมูลได้: {dataError.message}
          </div>
        )}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="font-semibold text-orange-500">
            จัดการรายการอาหาร
          </p>

          <h1 className="mt-1 text-3xl font-bold text-zinc-900">
            แก้ไขเมนูอาหาร
          </h1>

          <p className="mt-2 text-zinc-600">
            แก้ไขข้อมูล ราคา หมวดหมู่ และสถานะการขาย
          </p>

          <form action={updateMenu} className="mt-8 space-y-5">
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
              <button
                type="submit"
                className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600"
              >
                บันทึกข้อมูลเมนู
              </button>
            </div>
          </form>

          <div className="mt-6 border-t border-zinc-200 pt-6">
            <Link
              href={`/dashboard/menus/${id}/options`}
              className="inline-flex rounded-xl border border-orange-300 bg-orange-50 px-5 py-3 font-semibold text-orange-700 hover:bg-orange-100"
            >
              จัดการตัวเลือกเสริมของเมนูนี้
            </Link>
          </div>
        </section>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
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
  );
}
