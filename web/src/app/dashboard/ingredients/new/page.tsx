import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function NewIngredientPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  async function addIngredient(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const name = String(formData.get("name") ?? "").trim();
    const unit = String(formData.get("unit") ?? "").trim();
    const stockQuantity = Number(formData.get("stock_quantity"));
    const minimumStock = Number(formData.get("minimum_stock"));

    if (
      !name ||
      !unit ||
      Number.isNaN(stockQuantity) ||
      Number.isNaN(minimumStock) ||
      stockQuantity < 0 ||
      minimumStock < 0
    ) {
      return;
    }

    const { error } = await supabase.from("ingredients").insert({
      name,
      unit,
      stock_quantity: stockQuantity,
      minimum_stock: minimumStock,
    });

    if (error) {
      throw new Error(`ไม่สามารถเพิ่มวัตถุดิบได้: ${error.message}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ingredients");
    redirect("/dashboard/ingredients");
  }

  return (
    <main className="min-h-screen bg-orange-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/dashboard/ingredients"
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          ← กลับหน้าวัตถุดิบ
        </Link>

        <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm sm:p-8">
          <p className="font-semibold text-orange-500">
            จัดการคลังวัตถุดิบ
          </p>

          <h1 className="mt-1 text-3xl font-bold text-zinc-900">
            เพิ่มวัตถุดิบ
          </h1>

          <p className="mt-2 text-zinc-600">
            กรอกข้อมูลวัตถุดิบและจำนวนคงเหลือเริ่มต้น
          </p>

          <form action={addIngredient} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block font-semibold text-zinc-700"
              >
                ชื่อวัตถุดิบ
              </label>

              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="เช่น น้ำตาล"
                className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div>
              <label
                htmlFor="unit"
                className="mb-2 block font-semibold text-zinc-700"
              >
                หน่วย
              </label>

              <select
                id="unit"
                name="unit"
                required
                defaultValue=""
                className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              >
                <option value="" disabled>
                  เลือกหน่วย
                </option>
                <option value="กรัม">กรัม</option>
                <option value="กิโลกรัม">กิโลกรัม</option>
                <option value="มิลลิลิตร">มิลลิลิตร</option>
                <option value="ลิตร">ลิตร</option>
                <option value="ชิ้น">ชิ้น</option>
                <option value="ฟอง">ฟอง</option>
                <option value="ถุง">ถุง</option>
                <option value="ขวด">ขวด</option>
              </select>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="stock_quantity"
                  className="mb-2 block font-semibold text-zinc-700"
                >
                  จำนวนคงเหลือ
                </label>

                <input
                  id="stock_quantity"
                  name="stock_quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>

              <div>
                <label
                  htmlFor="minimum_stock"
                  className="mb-2 block font-semibold text-zinc-700"
                >
                  จุดแจ้งเตือน
                </label>

                <input
                  id="minimum_stock"
                  name="minimum_stock"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  placeholder="0"
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">
              <Link
                href="/dashboard/ingredients"
                className="rounded-xl border border-zinc-300 px-5 py-3 text-center font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                ยกเลิก
              </Link>

              <button
                type="submit"
                className="rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600"
              >
                บันทึกวัตถุดิบ
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}