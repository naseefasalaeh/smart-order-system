"use client";

import { useMemo, useState } from "react";

type Ingredient = { id: number; name: string; unit: string; ingredient_categories: { id: number; name: string; display_order: number } | null };
type RecipeRow = { id: number; quantity: string };

export default function NewMenuRecipe({ ingredients }: { ingredients: Ingredient[] }) {
  const [rows, setRows] = useState<RecipeRow[]>([]);
  const [search, setSearch] = useState("");
  const byId = useMemo(() => new Map(ingredients.map((item) => [item.id, item])), [ingredients]);
  const groups = useMemo(() => {
    const grouped = new Map<string, Ingredient[]>();
    for (const item of ingredients) {
      if (rows.some((row) => row.id === item.id) || !item.name.toLocaleLowerCase("th-TH").includes(search.trim().toLocaleLowerCase("th-TH"))) continue;
      const category = item.ingredient_categories?.name ?? "ยังไม่มีหมวด";
      grouped.set(category, [...(grouped.get(category) ?? []), item]);
    }
    return [...grouped].sort(([first], [second]) => first.localeCompare(second, "th-TH"));
  }, [ingredients, rows, search]);
  return <fieldset className="rounded-xl border border-orange-200 p-4">
    <legend className="px-2 font-bold">2. สูตรอาหารพื้นฐานต่อหนึ่งจาน</legend>
    <p className="text-sm text-zinc-600">ต้องมีวัตถุดิบอย่างน้อยหนึ่งรายการ และปริมาณมากกว่า 0</p>
    <div className="mt-3 space-y-3">{rows.map((row) => {
      const ingredient = byId.get(row.id);
      return <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-orange-50 p-3">
        <input type="hidden" name="recipe_ingredient_id" value={row.id} />
        <span className="min-w-32 font-medium">{ingredient?.name}</span>
        <input type="number" name="recipe_quantity" min="0.001" step="any" required value={row.quantity}
          onChange={(event) => setRows((current) => current.map((item) => item.id === row.id ? { ...item, quantity: event.target.value } : item))}
          aria-label={`ปริมาณ ${ingredient?.name}`} className="w-28 rounded-lg border border-zinc-300 px-3 py-2" />
        <span>{ingredient?.unit} / จาน</span>
        <button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} className="ml-auto text-red-700">นำออก</button>
      </div>;
    })}</div>
    {!rows.length && <p className="mt-3 text-sm text-red-700">ยังไม่มีวัตถุดิบในสูตร</p>}
    <input type="search" aria-label="ค้นหาวัตถุดิบในสูตร" placeholder="ค้นหาวัตถุดิบ" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2" />
    <div className="mt-3 max-h-64 space-y-3 overflow-auto">{groups.map(([name, items]) => <div key={name}>
      <h3 className="font-semibold text-zinc-700">{name} · {items.length} รายการ</h3>
      <div className="mt-2 flex flex-wrap gap-2">{items.map((item) => <button key={item.id} type="button"
        onClick={() => setRows((current) => [...current, { id: item.id, quantity: "1" }])}
        className="rounded-lg border border-orange-200 px-3 py-2 text-sm text-orange-800">+ {item.name} ({item.unit})</button>)}</div>
    </div>)}</div>
  </fieldset>;
}
