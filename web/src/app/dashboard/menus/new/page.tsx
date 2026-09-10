import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NewMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("categories")
    .select("id, name")
    .order("name", { ascending: true });
  if (categoriesError) console.error("โหลดหมวดหมู่เมนูไม่สำเร็จ", categoriesError);

  async function addMenu(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const {
      data: { user: actionUser },
    } = await supabase.auth.getUser();

    if (!actionUser) redirect("/login");

    const name = String(formData.get("name") ?? "").trim();
    const description = String(
      formData.get("description") ?? ""
    ).trim();
    const categoryId = String(
      formData.get("category_id") ?? ""
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
      redirect("/dashboard/menus/new?error=" + encodeURIComponent("กรุณากรอกข้อมูลเมนูให้ถูกต้อง"));
    }

    const { data: createdMenu, error } = await supabase
      .from("menus")
      .insert({
        name,
        description: description || null,
        category_id: categoryId,
        price,
        image_url: imageUrl || null,
        is_available: isAvailable,
      })
      .select("id")
      .single();

    if (error || !createdMenu) {
      console.error("เพิ่มเมนูไม่สำเร็จ", error);
      redirect("/dashboard/menus/new?error=" + encodeURIComponent("เพิ่มเมนูไม่สำเร็จ กรุณาลองใหม่"));
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/menus");
    redirect(`/dashboard/menus/${createdMenu.id}/edit?tab=recipe&success=${encodeURIComponent("สร้างเมนูแล้ว กรุณากำหนดสูตรพื้นฐานและกลุ่มตัวเลือก")}`);
  }

  return (
    <main className="min-h-screen bg-orange-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/menus"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← กลับหน้าเมนูอาหาร
        </Link>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="font-semibold text-orange-500">
            จัดการรายการอาหาร
          </p>

          <h1 className="mt-1 text-3xl font-bold text-zinc-900">
            เพิ่มเมนูอาหาร
          </h1>

          <p className="mt-2 text-zinc-600">
            กรอกข้อมูล ราคา หมวดหมู่ และสถานะการขาย
          </p>

          {query.error && (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
              {query.error}
            </div>
          )}

          {categoriesError ? (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">
              ไม่สามารถโหลดหมวดหมู่ได้ กรุณาลองใหม่
            </div>
          ) : !categories || categories.length === 0 ? (
            <div className="mt-6 rounded-xl bg-yellow-50 p-4 text-yellow-800">
              ยังไม่มีข้อมูลหมวดหมู่ กรุณาเพิ่มหมวดหมู่ก่อน
            </div>
          ) : (
            <form action={addMenu} className="mt-8 space-y-5">
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
                  placeholder="เช่น ข้าวผัดกุ้ง"
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
                  defaultValue=""
                  className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="" disabled>
                    เลือกหมวดหมู่
                  </option>

                  {categories.map((category) => (
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
                  placeholder="อธิบายรายละเอียดของเมนู"
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
                  placeholder="0.00"
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
                  placeholder="https://example.com/image.jpg"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />

                <p className="mt-2 text-sm text-zinc-500">
                  ยังไม่ใส่รูปภาพก็ได้ ช่องนี้ไม่บังคับ
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-4">
                <input
                  name="is_available"
                  type="checkbox"
                  defaultChecked
                  className="h-5 w-5 accent-orange-500"
                />

                <span>
                  <span className="block font-semibold text-zinc-700">
                    เปิดขายเมนูนี้
                  </span>

                  <span className="text-sm text-zinc-500">
                    ลูกค้าจะสามารถเห็นและสั่งเมนูนี้ได้
                  </span>
                </span>
              </label>

              <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
                <Link
                  href="/dashboard/menus"
                  className="rounded-xl border border-zinc-300 px-5 py-3 text-center font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  ยกเลิก
                </Link>

                <button
                  type="submit"
                  className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600"
                >
                  บันทึกเมนูอาหาร
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
