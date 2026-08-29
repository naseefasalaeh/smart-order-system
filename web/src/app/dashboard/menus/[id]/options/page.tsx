import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PageProps = { params: Promise<{ id: string }> };

type OptionRow = {
  id: number;
  menu_id: number;
  name: string;
  additional_price: number;
  is_available: boolean;
  sort_order: number | null;
};

export default async function MenuOptionsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: menu }, { data: optionRows, error }] = await Promise.all([
    supabase.from("menus").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("menu_options")
      .select("id, menu_id, name, additional_price, is_available, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  if (!menu) notFound();

  const rows = (optionRows ?? []) as OptionRow[];
  const templates = Array.from(
    rows.reduce((map, option) => {
      const key = option.name.trim().toLocaleLowerCase("th-TH");
      if (!map.has(key)) map.set(key, option);
      return map;
    }, new Map<string, OptionRow>()).values(),
  );
  const currentOptions = rows.filter(
    (option) => Number(option.menu_id) === Number(id),
  );

  async function saveOptions(formData: FormData) {
    "use server";
    const authClient = await createClient();
    const { data: { user: actionUser } } = await authClient.auth.getUser();

    if (!actionUser) redirect("/login");

    const db = createAdminClient();
    const selectedNames = new Set(
      formData.getAll("option_name").map((value) => String(value)),
    );
    const { data: latestRows, error: readError } = await db
      .from("menu_options")
      .select("id, menu_id, name, additional_price, is_available, sort_order");

    if (readError) throw new Error(readError.message);

    const allRows = (latestRows ?? []) as OptionRow[];
    const menuRows = allRows.filter(
      (option) => Number(option.menu_id) === Number(id),
    );

    for (const option of menuRows) {
      const { error: updateError } = await db
        .from("menu_options")
        .update({ is_available: selectedNames.has(option.name) })
        .eq("id", option.id);
      if (updateError) throw new Error(updateError.message);
    }

    for (const optionName of selectedNames) {
      if (menuRows.some((option) => option.name === optionName)) continue;

      const template = allRows.find((option) => option.name === optionName);
      if (!template) continue;

      const { data: created, error: insertError } = await db
        .from("menu_options")
        .insert({
          menu_id: id,
          name: template.name,
          additional_price: template.additional_price,
          is_available: true,
          sort_order: template.sort_order,
        })
        .select("id")
        .single();

      if (insertError || !created) {
        throw new Error(insertError?.message ?? "เพิ่มตัวเลือกไม่สำเร็จ");
      }

      const { data: recipes, error: recipeReadError } = await db
        .from("menu_option_ingredients")
        .select("ingredient_id, quantity_required")
        .eq("menu_option_id", template.id);

      if (recipeReadError) throw new Error(recipeReadError.message);

      if (recipes && recipes.length > 0) {
        const { error: recipeInsertError } = await db
          .from("menu_option_ingredients")
          .insert(
            recipes.map((recipe) => ({
              menu_option_id: created.id,
              ingredient_id: recipe.ingredient_id,
              quantity_required: recipe.quantity_required,
            })),
          );
        if (recipeInsertError) throw new Error(recipeInsertError.message);
      }
    }

    revalidatePath(`/dashboard/menus/${id}/edit`);
    revalidatePath(`/dashboard/menus/${id}/options`);
    revalidatePath(`/table`);
    redirect(`/dashboard/menus/${id}/edit`);
  }

  return (
    <main className="min-h-screen bg-orange-50 px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <Link href={`/dashboard/menus/${id}/edit`} className="font-semibold text-orange-600">
          ← กลับหน้าแก้ไขเมนู
        </Link>
        <section className="mt-6 rounded-2xl bg-white p-8 shadow-sm">
          <p className="font-semibold text-orange-500">ตัวเลือกเสริม</p>
          <h1 className="mt-1 text-3xl font-bold">{menu.name}</h1>
          <p className="mt-2 text-zinc-600">ติ๊กตัวเลือกที่ลูกค้าสามารถเพิ่มในเมนูนี้</p>

          {error ? (
            <div className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error.message}</div>
          ) : templates.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed p-6 text-center text-zinc-500">
              ยังไม่มีตัวเลือกเสริมต้นแบบในระบบ
            </div>
          ) : (
            <form action={saveOptions} className="mt-7 space-y-3">
              {templates.map((option) => {
                const current = currentOptions.find(
                  (item) => item.name === option.name,
                );
                return (
                  <label key={option.name} className="flex cursor-pointer items-center justify-between rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        name="option_name"
                        value={option.name}
                        defaultChecked={Boolean(current?.is_available)}
                        className="h-5 w-5 accent-orange-500"
                      />
                      <span className="font-semibold">{option.name}</span>
                    </div>
                    <span className="text-orange-600">+{Number(option.additional_price).toLocaleString("th-TH")} บาท</span>
                  </label>
                );
              })}

              <button type="submit" className="mt-5 w-full rounded-xl bg-orange-500 px-5 py-4 font-bold text-white">
                บันทึกตัวเลือกเสริม
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
