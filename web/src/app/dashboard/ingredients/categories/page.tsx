import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type CategoriesPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

function categoryErrorRedirect(message: string): never {
  redirect(
    `/dashboard/ingredients/categories?error=${encodeURIComponent(message)}`,
  );
}

function categorySuccessRedirect(message: string): never {
  redirect(
    `/dashboard/ingredients/categories?success=${encodeURIComponent(message)}`,
  );
}

async function requireAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return supabase;
}

export default async function IngredientCategoriesPage({
  searchParams,
}: CategoriesPageProps) {
  const supabase = await requireAuthenticatedClient();
  const { error: errorMessage, success: successMessage } = await searchParams;
  const { data: categories, error } = await supabase
    .from("ingredient_categories")
    .select("id, name, display_order, is_active")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  async function addCategory(formData: FormData) {
    "use server";
    const db = await requireAuthenticatedClient();
    const name = String(formData.get("name") ?? "").trim();
    const displayOrder = Number(formData.get("display_order"));

    if (!name) categoryErrorRedirect("กรุณากรอกชื่อหมวดหมู่");
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      categoryErrorRedirect("ลำดับการแสดงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }

    const { error: insertError } = await db
      .from("ingredient_categories")
      .insert({ name, display_order: displayOrder, is_active: true });

    if (insertError) {
      if (insertError.code !== "23505") {
        console.error("Failed to add ingredient category", insertError);
      }
      categoryErrorRedirect(
        insertError.code === "23505"
          ? "มีชื่อหมวดหมู่นี้อยู่แล้ว"
          : "เพิ่มหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่",
      );
    }

    revalidatePath("/dashboard/ingredients/categories");
    revalidatePath("/dashboard/ingredients");
    categorySuccessRedirect("เพิ่มหมวดหมู่แล้ว");
  }

  async function updateCategory(formData: FormData) {
    "use server";
    const db = await requireAuthenticatedClient();
    const categoryId = Number(formData.get("category_id"));
    const name = String(formData.get("name") ?? "").trim();
    const displayOrder = Number(formData.get("display_order"));
    const isActive = formData.get("is_active") === "on";

    if (!Number.isInteger(categoryId) || categoryId <= 0 || !name) {
      categoryErrorRedirect("ข้อมูลหมวดหมู่ไม่ถูกต้อง");
    }
    if (!Number.isInteger(displayOrder) || displayOrder < 0) {
      categoryErrorRedirect("ลำดับการแสดงต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    }

    const { data: existing, error: readError } = await db
      .from("ingredient_categories")
      .select("name")
      .eq("id", categoryId)
      .maybeSingle();

    if (readError) {
      console.error("Failed to read ingredient category before update", readError);
      categoryErrorRedirect("โหลดหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่");
    }
    if (!existing) categoryErrorRedirect("ไม่พบหมวดหมู่ที่ต้องการแก้ไข");
    const isOtherCategory = String(existing.name).trim() === "อื่น ๆ";

    if (isOtherCategory && (name !== "อื่น ๆ" || !isActive)) {
      categoryErrorRedirect("หมวด “อื่น ๆ” เปลี่ยนชื่อหรือปิดใช้งานไม่ได้");
    }

    const { error: updateError } = await db
      .from("ingredient_categories")
      .update({
        name: isOtherCategory ? "อื่น ๆ" : name,
        display_order: displayOrder,
        is_active: isOtherCategory ? true : isActive,
      })
      .eq("id", categoryId);

    if (updateError) {
      if (updateError.code !== "23505") {
        console.error("Failed to update ingredient category", updateError);
      }
      categoryErrorRedirect(
        updateError.code === "23505"
          ? "มีชื่อหมวดหมู่นี้อยู่แล้ว"
          : "บันทึกหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่",
      );
    }

    revalidatePath("/dashboard/ingredients/categories");
    revalidatePath("/dashboard/ingredients");
    categorySuccessRedirect("บันทึกหมวดหมู่แล้ว");
  }

  return (
    <main className="min-h-screen bg-orange-50 px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/dashboard/ingredients"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← กลับหน้าวัตถุดิบ
        </Link>

        <header className="mt-6">
          <p className="font-semibold text-orange-500">จัดการคลังวัตถุดิบ</p>
          <h1 className="mt-1 text-3xl font-bold text-zinc-900">
            หมวดหมู่วัตถุดิบ
          </h1>
          <p className="mt-2 text-zinc-600">
            จัดลำดับและเปิดหรือปิดหมวดหมู่ โดยไม่มีการลบข้อมูล
          </p>
        </header>

        {(errorMessage || error) && (
          <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
            {errorMessage ?? "โหลดหมวดหมู่ไม่สำเร็จ กรุณาลองใหม่"}
          </div>
        )}
        {successMessage && (
          <div className="mt-6 rounded-xl bg-green-50 p-4 text-green-700">
            {successMessage}
          </div>
        )}

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-zinc-900">เพิ่มหมวดใหม่</h2>
          <form
            action={addCategory}
            className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px_auto] sm:items-end"
          >
            <label>
              <span className="mb-2 block font-semibold text-zinc-700">
                ชื่อหมวดหมู่
              </span>
              <input
                name="name"
                required
                maxLength={100}
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500"
              />
            </label>
            <label>
              <span className="mb-2 block font-semibold text-zinc-700">
                ลำดับ
              </span>
              <input
                name="display_order"
                type="number"
                min="0"
                step="1"
                defaultValue="100"
                required
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500"
              />
            </label>
            <button className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600">
              เพิ่มหมวด
            </button>
          </form>
        </section>

        <section className="mt-6 space-y-3">
          {(categories ?? []).map((category) => {
            const isOtherCategory = category.name.trim() === "อื่น ๆ";
            return (
              <form
                key={category.id}
                action={updateCategory}
                className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm md:grid-cols-[1fr_130px_150px_auto] md:items-end"
              >
                <input type="hidden" name="category_id" value={category.id} />
                <label>
                  <span className="mb-2 block text-sm font-semibold text-zinc-700">
                    ชื่อหมวดหมู่
                  </span>
                  <input
                    name="name"
                    required
                    maxLength={100}
                    defaultValue={category.name}
                    readOnly={isOtherCategory}
                    className="w-full rounded-xl border border-zinc-300 px-4 py-3 read-only:bg-zinc-100"
                  />
                </label>
                <label>
                  <span className="mb-2 block text-sm font-semibold text-zinc-700">
                    ลำดับ
                  </span>
                  <input
                    name="display_order"
                    type="number"
                    min="0"
                    step="1"
                    required
                    defaultValue={category.display_order}
                    className="w-full rounded-xl border border-zinc-300 px-4 py-3"
                  />
                </label>
                <label className="flex h-12 items-center gap-3 rounded-xl border border-zinc-200 px-4">
                  <input
                    name="is_active"
                    type="checkbox"
                    defaultChecked={category.is_active}
                    disabled={isOtherCategory}
                    className="h-5 w-5 accent-orange-500"
                  />
                  {isOtherCategory && (
                    <input type="hidden" name="is_active" value="on" />
                  )}
                  <span className="font-semibold text-zinc-700">
                    เปิดใช้งาน
                  </span>
                </label>
                <button className="rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-800">
                  บันทึก
                </button>
              </form>
            );
          })}
        </section>
      </div>
    </main>
  );
}
