"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import CatalogDeleteButton from "@/components/catalog-delete-button";

type IngredientCategory = {
  id: number;
  name: string;
  is_active: boolean;
};

type Ingredient = {
  id: number;
  name: string;
  unit: string;
  stock_quantity: number;
  minimum_stock: number;
  updated_at: string | null;
  ingredient_categories: IngredientCategory | null;
};

export default function IngredientsClient({
  ingredients,
  activeCategories,
  canDelete,
}: {
  canDelete: boolean;
  ingredients: Ingredient[];
  activeCategories: IngredientCategory[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredIngredients = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("th-TH");

    return ingredients.filter((ingredient) => {
      const matchesSearch = ingredient.name
        .toLocaleLowerCase("th-TH")
        .includes(normalizedSearch);
      const matchesCategory =
        categoryFilter === "all" ||
        (categoryFilter === "uncategorized"
          ? ingredient.ingredient_categories === null
          : String(ingredient.ingredient_categories?.id) === categoryFilter);

      const stock = Number(ingredient.stock_quantity);
      const status = stock <= 0 ? "out" : stock <= Number(ingredient.minimum_stock) ? "low" : "normal";
      return matchesSearch && matchesCategory && (statusFilter === "all" || statusFilter === status);
    }).sort((a,b) => (a.ingredient_categories?.name ?? "อื่น ๆ").localeCompare(b.ingredient_categories?.name ?? "อื่น ๆ", "th-TH") || a.name.localeCompare(b.name,"th-TH"));
  }, [categoryFilter, ingredients, search, statusFilter]);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-6 py-5">
        <h3 className="text-xl font-bold text-zinc-900">รายการวัตถุดิบ</h3>
        <p className="mt-1 text-sm text-zinc-500">
          แสดง {filteredIngredients.length} จาก {ingredients.length} รายการ
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_260px_200px]">
          <label>
            <span className="mb-2 block text-sm font-semibold text-zinc-700">
              ค้นหาวัตถุดิบ
            </span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="พิมพ์ชื่อวัตถุดิบ"
              className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
            />
          </label>
          <label><span className="mb-2 block text-sm font-semibold text-zinc-700">สถานะ</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3">
              <option value="all">ทั้งหมด</option><option value="normal">ปกติ</option><option value="low">ใกล้หมด</option><option value="out">หมด</option>
            </select>
          </label>

          <label>
            <span className="mb-2 block text-sm font-semibold text-zinc-700">
              กรองตามหมวดหมู่
            </span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 outline-none focus:border-orange-500"
            >
              <option value="all">ทั้งหมด</option>
              {activeCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
              <option value="uncategorized">ยังไม่มีหมวด</option>
            </select>
          </label>
        </div>
      </div>

      {filteredIngredients.length === 0 ? (
        <div className="px-6 py-14 text-center text-zinc-500">
          ไม่พบวัตถุดิบที่ตรงกับการค้นหาและตัวกรอง
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
                <th className="px-6 py-4 font-medium">ชื่อวัตถุดิบ</th>
                <th className="px-6 py-4 font-medium">หมวดหมู่</th>
                <th className="px-6 py-4 font-medium">คงเหลือ</th>
                <th className="px-6 py-4 font-medium">จุดแจ้งเตือน</th>
                <th className="px-6 py-4 font-medium">สถานะ</th>
                <th className="px-6 py-4 font-medium">อัปเดตล่าสุด</th>
                <th className="px-6 py-4 text-right font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredIngredients.map((ingredient, index) => {
                const stockQuantity = Number(ingredient.stock_quantity ?? 0);
                const minimumStock = Number(ingredient.minimum_stock ?? 0);
                const isOut = stockQuantity <= 0;
                const isLowStock = !isOut && stockQuantity <= minimumStock;
                const categoryName = ingredient.ingredient_categories?.name ?? "ยังไม่มีหมวด";
                const previousCategory = filteredIngredients[index - 1]?.ingredient_categories?.name ?? "ยังไม่มีหมวด";

                return (
                  <Fragment key={ingredient.id}>
                  {(index === 0 || categoryName !== previousCategory) && <tr className="bg-orange-50"><th colSpan={7} className="px-6 py-3 text-left font-semibold text-orange-800">{categoryName} · {filteredIngredients.filter((entry) => (entry.ingredient_categories?.name ?? "ยังไม่มีหมวด") === categoryName).length} รายการ</th></tr>}
                  <tr
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="px-6 py-5 font-semibold text-zinc-900">
                      {ingredient.name}
                    </td>
                    <td className="px-6 py-5 text-zinc-700">
                      {ingredient.ingredient_categories?.name ?? "ยังไม่มีหมวด"}
                    </td>
                    <td className="px-6 py-5 text-zinc-700">
                      {stockQuantity.toLocaleString("th-TH")} {ingredient.unit}
                    </td>
                    <td className="px-6 py-5 text-zinc-700">
                      {minimumStock.toLocaleString("th-TH")} {ingredient.unit}
                    </td>
                    <td className="px-6 py-5">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${
                          isOut || isLowStock
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isOut ? "หมด" : isLowStock ? "ใกล้หมด" : "ปกติ"}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm text-zinc-500">
                      {ingredient.updated_at
                        ? new Date(ingredient.updated_at).toLocaleString(
                            "th-TH",
                            { timeZone: "Asia/Bangkok" },
                          )
                        : "-"}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        href={`/dashboard/ingredients/${ingredient.id}/edit`}
                        className="inline-block rounded-lg border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-600 transition hover:bg-orange-50"
                      >
                        แก้ไข
                      </Link>
                      {canDelete && <CatalogDeleteButton kind="ingredient" id={ingredient.id} name={ingredient.name} />}
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
