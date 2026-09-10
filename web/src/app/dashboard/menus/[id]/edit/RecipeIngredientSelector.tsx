"use client";

import { useMemo, useState } from "react";

type IngredientCategory = {
  id: number;
  name: string;
  display_order: number;
};

type Ingredient = {
  id: number;
  name: string;
  unit: string;
  ingredient_categories: IngredientCategory | null;
};

type SelectedIngredient = {
  ingredient_id: number;
  quantity_required: number;
};

type RecipeAction = (formData: FormData) => Promise<void>;

type IngredientGroup = {
  key: string;
  name: string;
  displayOrder: number;
  ingredients: Ingredient[];
};

export default function RecipeIngredientSelector({
  ingredients,
  selectedIngredients,
  saveIngredientAction,
  removeIngredientAction,
}: {
  ingredients: Ingredient[];
  selectedIngredients: SelectedIngredient[];
  saveIngredientAction: RecipeAction;
  removeIngredientAction: RecipeAction;
}) {
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const selectedIds = useMemo(
    () => new Set(selectedIngredients.map((item) => Number(item.ingredient_id))),
    [selectedIngredients],
  );
  const ingredientMap = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );

  const groups = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("th-TH");
    const groupMap = new Map<string, IngredientGroup>();

    for (const ingredient of ingredients) {
      if (selectedIds.has(ingredient.id)) continue;
      if (
        normalizedSearch &&
        !ingredient.name.toLocaleLowerCase("th-TH").includes(normalizedSearch)
      ) {
        continue;
      }

      const category = ingredient.ingredient_categories;
      const key = category ? String(category.id) : "uncategorized";
      const existing = groupMap.get(key) ?? {
        key,
        name: category?.name ?? "ยังไม่มีหมวด",
        displayOrder: category?.display_order ?? Number.MAX_SAFE_INTEGER,
        ingredients: [],
      };

      existing.ingredients.push(ingredient);
      groupMap.set(key, existing);
    }

    return Array.from(groupMap.values())
      .map((group) => ({
        ...group,
        ingredients: group.ingredients.sort((first, second) =>
          first.name.localeCompare(second.name, "th"),
        ),
      }))
      .sort(
        (first, second) =>
          first.displayOrder - second.displayOrder ||
          first.name.localeCompare(second.name, "th"),
      );
  }, [ingredients, search, selectedIds]);

  function toggleGroup(key: string) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mt-6 space-y-6">
      <section>
        <h3 className="text-lg font-bold text-zinc-900">
          วัตถุดิบที่เลือกแล้ว
        </h3>
        {selectedIngredients.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
            เมนูนี้ยังไม่ได้กำหนดวัตถุดิบ
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {selectedIngredients.map((item) => {
              const ingredient = ingredientMap.get(Number(item.ingredient_id));
              return (
                <div
                  key={item.ingredient_id}
                  className="rounded-xl border border-orange-200 bg-orange-50 p-4"
                >
                  <p className="font-semibold text-zinc-900">
                    {ingredient?.name ?? "ไม่พบชื่อวัตถุดิบ"}
                  </p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <form
                      action={saveIngredientAction}
                      className="flex flex-1 gap-2"
                    >
                      <input
                        type="hidden"
                        name="ingredient_id"
                        value={item.ingredient_id}
                      />
                      <input
                        name="quantity_required"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        defaultValue={item.quantity_required}
                        aria-label={`ปริมาณ ${ingredient?.name ?? "วัตถุดิบ"}`}
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2"
                      />
                      <span className="self-center text-sm text-zinc-500">
                        {ingredient?.unit ?? ""} / จาน
                      </span>
                      <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white">
                        อัปเดต
                      </button>
                    </form>
                    <form action={removeIngredientAction}>
                      <input
                        type="hidden"
                        name="ingredient_id"
                        value={item.ingredient_id}
                      />
                      <button className="w-full rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
                        ลบออกจากสูตร
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="border-t border-zinc-200 pt-6">
        <h3 className="text-lg font-bold text-zinc-900">เพิ่มวัตถุดิบในสูตร</h3>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ค้นหาชื่อวัตถุดิบ"
          className="mt-3 w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
        />

        {groups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-6 text-center text-zinc-500">
            ไม่พบวัตถุดิบที่เพิ่มได้
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {groups.map((group) => {
              const isOpen = Boolean(search.trim()) || openGroups.has(group.key);
              return (
                <div
                  key={group.key}
                  className="overflow-hidden rounded-xl border border-zinc-200"
                >
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center justify-between bg-zinc-50 px-4 py-3 text-left font-semibold text-zinc-800"
                    aria-expanded={isOpen}
                  >
                    <span>{group.name}</span>
                    <span className="text-sm text-zinc-500">
                      {group.ingredients.length} รายการ {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-zinc-100">
                      {group.ingredients.map((ingredient) => (
                        <form
                          key={ingredient.id}
                          action={saveIngredientAction}
                          className="grid gap-3 p-4 sm:grid-cols-[1fr_150px_auto] sm:items-center"
                        >
                          <input
                            type="hidden"
                            name="ingredient_id"
                            value={ingredient.id}
                          />
                          <div>
                            <p className="font-semibold text-zinc-900">
                              {ingredient.name}
                            </p>
                            <p className="text-sm text-zinc-500">
                              หน่วย: {ingredient.unit}
                            </p>
                          </div>
                          <input
                            name="quantity_required"
                            type="number"
                            min="0.01"
                            step="0.01"
                            required
                            placeholder={`จำนวน (${ingredient.unit})`}
                            aria-label={`ปริมาณ ${ingredient.name}`}
                            className="rounded-lg border border-zinc-300 px-3 py-2"
                          />
                          <button className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-white hover:bg-orange-600">
                            เพิ่ม
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
