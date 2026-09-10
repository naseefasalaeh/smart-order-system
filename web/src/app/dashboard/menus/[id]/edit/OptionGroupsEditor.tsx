import {
  removeOptionIngredient,
  saveMenuOption,
  saveOptionGroup,
  saveOptionIngredient,
} from "./actions";

type Group = {
  id: number;
  name: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
  min_select: number;
  max_select: number;
  max_total_quantity: number;
  display_order: number;
  is_active: boolean;
};

type Option = {
  id: number;
  group_id: number | null;
  name: string;
  additional_price: number;
  sort_order: number;
  is_available: boolean;
  max_quantity: number;
};

type Ingredient = { id: number; name: string; unit: string };
type OptionRecipe = {
  menu_option_id: number;
  ingredient_id: number;
  quantity_required: number;
};

function GroupFields({ group }: { group?: Group }) {
  return (
    <>
      {group && <input type="hidden" name="group_id" value={group.id} />}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-zinc-700">
          ชื่อกลุ่ม
          <input name="name" required defaultValue={group?.name} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" />
        </label>
        <label className="text-sm font-semibold text-zinc-700">
          ประเภท
          <select name="selection_type" defaultValue={group?.selection_type ?? "multiple"} className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2">
            <option value="single">เลือกได้หนึ่งรายการ</option>
            <option value="multiple">เลือกได้หลายรายการ</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-zinc-700">ขั้นต่ำ<input name="min_select" type="number" min="0" defaultValue={group?.min_select ?? 0} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="text-sm font-semibold text-zinc-700">จำนวนชนิดสูงสุด<input name="max_select" type="number" min="1" defaultValue={group?.max_select ?? 3} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="text-sm font-semibold text-zinc-700">จำนวนชิ้นรวมสูงสุด<input name="max_total_quantity" type="number" min="1" defaultValue={group?.max_total_quantity ?? 3} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" /></label>
        <label className="text-sm font-semibold text-zinc-700">ลำดับ<input name="display_order" type="number" min="0" defaultValue={group?.display_order ?? 0} className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input name="is_required" type="checkbox" defaultChecked={group?.is_required} className="accent-orange-500" /> บังคับเลือก</label>
        <label className="flex items-center gap-2"><input name="is_active" type="checkbox" defaultChecked={group?.is_active} className="accent-orange-500" /> เปิดใช้งาน</label>
      </div>
    </>
  );
}

export default function OptionGroupsEditor({
  menuId,
  groups,
  options,
  ingredients,
  recipes,
}: {
  menuId: number;
  groups: Group[];
  options: Option[];
  ingredients: Ingredient[];
  recipes: OptionRecipe[];
}) {
  return (
    <div className="mt-6 space-y-5">
      <details className="rounded-xl border border-orange-200 bg-orange-50 p-5">
        <summary className="cursor-pointer font-bold text-orange-700">+ เพิ่มกลุ่มตัวเลือก</summary>
        <form action={saveOptionGroup} className="mt-5">
          <input type="hidden" name="menu_id" value={menuId} />
          <GroupFields />
          <p className="mt-3 text-xs text-zinc-500">กลุ่มบังคับต้องสร้างแบบปิดไว้ก่อน เพิ่มตัวเลือก แล้วจึงเปิดใช้งาน</p>
          <button className="mt-4 rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">เพิ่มกลุ่ม</button>
        </form>
      </details>

      {groups.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-500">ยังไม่มีกลุ่มตัวเลือก</div>
      )}

      {groups.map((group) => {
        const groupOptions = options.filter((option) => option.group_id === group.id);
        return (
          <section key={group.id} className="rounded-2xl border border-zinc-200 p-5">
            <details>
              <summary className="cursor-pointer">
                <span className="font-bold text-zinc-900">{group.name}</span>{" "}
                <span className={`ml-2 rounded-full px-2 py-1 text-xs ${group.is_active ? "bg-green-50 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>{group.is_active ? "เปิดใช้" : "ปิดใช้"}</span>
                {group.is_required && <span className="ml-2 rounded-full bg-red-50 px-2 py-1 text-xs text-red-600">บังคับ</span>}
              </summary>
              <form action={saveOptionGroup} className="mt-5 rounded-xl bg-zinc-50 p-4">
                <input type="hidden" name="menu_id" value={menuId} />
                <GroupFields group={group} />
                <button className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white">บันทึกกลุ่ม</button>
              </form>
            </details>

            <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5">
              {groupOptions.map((option) => {
                const optionRecipes = recipes.filter((recipe) => recipe.menu_option_id === option.id);
                const usedIngredientIds = new Set(optionRecipes.map((recipe) => recipe.ingredient_id));
                return (
                  <details key={option.id} className="rounded-xl border border-zinc-200 p-4">
                    <summary className="cursor-pointer font-semibold">
                      {option.name} <span className="text-orange-600">+{option.additional_price.toLocaleString("th-TH")} บาท</span>{" "}
                      {!option.is_available && <span className="text-sm text-zinc-400">(ปิดขาย)</span>}
                    </summary>
                    <form action={saveMenuOption} className="mt-4 grid gap-3 md:grid-cols-2">
                      <input type="hidden" name="menu_id" value={menuId} />
                      <input type="hidden" name="group_id" value={group.id} />
                      <input type="hidden" name="option_id" value={option.id} />
                      <label className="text-sm font-semibold">ชื่อ<input name="name" required defaultValue={option.name} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                      <label className="text-sm font-semibold">ราคาเพิ่ม<input name="additional_price" type="number" min="0" step="0.01" required defaultValue={option.additional_price} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                      <label className="text-sm font-semibold">ลำดับ<input name="sort_order" type="number" min="0" required defaultValue={option.sort_order} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                      <label className="text-sm font-semibold">จำนวนสูงสุดต่อตัวเลือก<input name="max_quantity" type="number" min="1" max="3" required disabled={group.selection_type === "single"} defaultValue={group.selection_type === "single" ? 1 : option.max_quantity} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-zinc-100" /></label>
                      <label className="flex items-center gap-2 text-sm"><input name="is_available" type="checkbox" defaultChecked={option.is_available} className="accent-orange-500" /> เปิดขาย</label>
                      <button className="rounded-lg bg-zinc-900 px-4 py-2 font-semibold text-white">บันทึกตัวเลือก</button>
                    </form>

                    <div className="mt-5 border-t pt-4">
                      <h4 className="font-semibold">สูตรวัตถุดิบต่อ 1 ตัวเลือก</h4>
                      <div className="mt-3 space-y-2">
                        {optionRecipes.map((recipe) => {
                          const ingredient = ingredients.find((item) => item.id === recipe.ingredient_id);
                          return (
                            <div key={recipe.ingredient_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-orange-50 p-3 text-sm">
                              <span>{ingredient?.name ?? "ไม่พบวัตถุดิบ"} — {recipe.quantity_required} {ingredient?.unit}</span>
                              <div className="flex gap-2">
                                <form action={saveOptionIngredient} className="flex gap-2">
                                  <input type="hidden" name="menu_id" value={menuId} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="ingredient_id" value={recipe.ingredient_id} />
                                  <input name="quantity_required" type="number" min="0.01" step="0.01" required defaultValue={recipe.quantity_required} className="w-24 rounded border px-2" />
                                  <button className="font-semibold text-zinc-700">อัปเดต</button>
                                </form>
                                <form action={removeOptionIngredient}>
                                  <input type="hidden" name="menu_id" value={menuId} /><input type="hidden" name="option_id" value={option.id} /><input type="hidden" name="ingredient_id" value={recipe.ingredient_id} />
                                  <button className="font-semibold text-red-600">ลบออก</button>
                                </form>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <form action={saveOptionIngredient} className="mt-3 grid gap-2 sm:grid-cols-[1fr_130px_auto]">
                        <input type="hidden" name="menu_id" value={menuId} /><input type="hidden" name="option_id" value={option.id} />
                        <select name="ingredient_id" required defaultValue="" className="rounded-lg border bg-white px-3 py-2"><option value="" disabled>เลือกวัตถุดิบ</option>{ingredients.filter((item) => !usedIngredientIds.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select>
                        <input name="quantity_required" type="number" min="0.01" step="0.01" required placeholder="ปริมาณ" className="rounded-lg border px-3 py-2" />
                        <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">เพิ่มในสูตร</button>
                      </form>
                    </div>
                  </details>
                );
              })}

              <details className="rounded-xl border border-dashed border-zinc-300 p-4">
                <summary className="cursor-pointer font-semibold text-orange-600">+ เพิ่มตัวเลือกในกลุ่มนี้</summary>
                <form action={saveMenuOption} className="mt-4 grid gap-3 md:grid-cols-2">
                  <input type="hidden" name="menu_id" value={menuId} /><input type="hidden" name="group_id" value={group.id} />
                  <label className="text-sm font-semibold">ชื่อ<input name="name" required className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm font-semibold">ราคาเพิ่ม<input name="additional_price" type="number" min="0" step="0.01" required defaultValue="0" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm font-semibold">ลำดับ<input name="sort_order" type="number" min="0" required defaultValue={groupOptions.length} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
                  <label className="text-sm font-semibold">จำนวนสูงสุด<input name="max_quantity" type="number" min="1" max="3" required disabled={group.selection_type === "single"} defaultValue={group.selection_type === "single" ? 1 : 3} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-zinc-100" /></label>
                  <label className="flex items-center gap-2 text-sm"><input name="is_available" type="checkbox" className="accent-orange-500" /> เปิดขาย</label>
                  <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white">เพิ่มตัวเลือก</button>
                </form>
                <p className="mt-2 text-xs text-zinc-500">สร้างแบบปิดขายก่อน จากนั้นเพิ่มสูตรวัตถุดิบแล้วจึงเปิดขาย</p>
              </details>
            </div>
          </section>
        );
      })}
    </div>
  );
}
