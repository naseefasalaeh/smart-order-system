"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
}: {
  ingredients: Ingredient[];
  activeCategories: IngredientCategory[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

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

      return matchesSearch && matchesCategory;
    });
  }, [categoryFilter, ingredients, search]);

  return (
    <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-6 py-5">
        <h3 className="text-xl font-bold text-zinc-900">รายการวัตถุดิบ</h3>
        <p className="mt-1 text-sm text-zinc-500">
          แสดง {filteredIngredients.length} จาก {ingredients.length} รายการ
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_260px]">
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
              {filteredIngredients.map((ingredient) => {
                const stockQuantity = Number(ingredient.stock_quantity ?? 0);
                const minimumStock = Number(ingredient.minimum_stock ?? 0);
                const isLowStock = stockQuantity <= minimumStock;

                return (
                  <tr
                    key={ingredient.id}
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
                          isLowStock
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {isLowStock ? "ใกล้หมด" : "ปกติ"}
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
                      <CatalogDeleteButton kind="ingredient" id={ingredient.id} name={ingredient.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
