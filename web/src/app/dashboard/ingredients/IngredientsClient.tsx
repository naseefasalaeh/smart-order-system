"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import CatalogDeleteButton from "@/components/catalog-delete-button";
import { adjustIngredientStock, bulkRestockIngredients } from "./actions";

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
  reset_every_days: number | null;
  reset_time: string | null;
  reset_next_at: string | null;
  ingredient_categories: IngredientCategory | null;
};

// Preset quick add values based on measurement unit
function getQuickAddPresets(unit: string): number[] {
  const u = (unit || "").toLowerCase().trim();
  if (u.includes("กรัม") || u === "g" || u === "gram" || u === "grams") {
    return [500, 1000, 2000, 5000];
  }
  if (u.includes("มิลลิลิตร") || u === "ml" || u.includes("ซีซี")) {
    return [250, 500, 1000, 2000];
  }
  if (u.includes("กิโล") || u === "kg" || u === "กก." || u === "กก") {
    return [1, 2, 5, 10];
  }
  if (
    u.includes("ฟอง") ||
    u.includes("ชิ้น") ||
    u.includes("ถุง") ||
    u.includes("ขวด") ||
    u.includes("กระป๋อง") ||
    u.includes("กล่อง") ||
    u.includes("แพ็ค") ||
    u.includes("ซอง") ||
    u.includes("ลูก") ||
    u.includes("จาน")
  ) {
    return [10, 20, 50, 100];
  }
  return [5, 10, 20, 50];
}

// Dropdown Action Menu for Row ⋮
function RowActionMenu({
  ingredient,
  canDelete,
}: {
  ingredient: Ingredient;
  canDelete: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  if (!canDelete) return null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`ตัวเลือกเพิ่มเติมสำหรับ ${ingredient.name}`}
        title="ตัวเลือกเพิ่มเติม"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-orange-300"
      >
        <span className="text-base font-bold leading-none select-none">⋮</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-1 w-44 origin-top-right rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          <CatalogDeleteButton
            kind="ingredient"
            id={ingredient.id}
            name={ingredient.name}
            className="w-full block"
            buttonClassName="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 focus:outline-none"
            buttonContent={
              <>
                <span className="text-base">🗑️</span>
                <span>ลบวัตถุดิบ</span>
              </>
            }
          />
        </div>
      )}
    </div>
  );
}

export default function IngredientsClient({
  ingredients: initialIngredients,
  activeCategories,
  canDelete,
  initialSuccess,
}: {
  canDelete: boolean;
  ingredients: Ingredient[];
  activeCategories: IngredientCategory[];
  initialSuccess?: string;
}) {
  const [stockOverrides, setStockOverrides] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "normal">("all");
  const [notice, setNotice] = useState<string | null>(initialSuccess ?? null);

  const ingredients = useMemo(() => {
    return initialIngredients.map((item) =>
      stockOverrides[item.id] !== undefined
        ? {
            ...item,
            stock_quantity: stockOverrides[item.id],
            updated_at: new Date().toISOString(),
          }
        : item
    );
  }, [initialIngredients, stockOverrides]);

  // Status counts for quick filter buttons
  const statusCounts = useMemo(() => {
    let low = 0;
    let normal = 0;
    for (const item of ingredients) {
      const stock = Number(item.stock_quantity ?? 0);
      const min = Number(item.minimum_stock ?? 0);
      if (stock <= min) {
        low++;
      } else {
        normal++;
      }
    }
    return { all: ingredients.length, low, normal };
  }, [ingredients]);

  // Filtered ingredients for main table
  const filteredIngredients = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("th-TH");

    return ingredients
      .filter((ingredient) => {
        const matchesSearch = ingredient.name
          .toLocaleLowerCase("th-TH")
          .includes(normalizedSearch);

        const matchesCategory =
          categoryFilter === "all" ||
          (categoryFilter === "uncategorized"
            ? ingredient.ingredient_categories === null
            : String(ingredient.ingredient_categories?.id) === categoryFilter);

        const stock = Number(ingredient.stock_quantity ?? 0);
        const min = Number(ingredient.minimum_stock ?? 0);
        const isLow = stock <= min;

        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "low" && isLow) ||
          (statusFilter === "normal" && !isLow);

        return matchesSearch && matchesCategory && matchesStatus;
      })
      .sort(
        (a, b) =>
          (a.ingredient_categories?.name ?? "อื่น ๆ").localeCompare(
            b.ingredient_categories?.name ?? "อื่น ๆ",
            "th-TH"
          ) || a.name.localeCompare(b.name, "th-TH")
      );
  }, [categoryFilter, ingredients, search, statusFilter]);

  // ==========================================
  // 1. Single-Item Adjust / Restock Modal State
  // ==========================================
  const [adjustItem, setAdjustItem] = useState<Ingredient | null>(null);
  const [adjustMode, setAdjustMode] = useState<"in" | "out">("in");
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustNote, setAdjustNote] = useState<string>("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isAdjustPending, startAdjustTransition] = useTransition();

  const handleOpenAdjust = (item: Ingredient) => {
    setAdjustItem(item);
    setAdjustMode("in");
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
  };

  const handleCloseAdjust = () => {
    if (isAdjustPending) return;
    setAdjustItem(null);
    setAdjustAmount("");
    setAdjustNote("");
    setAdjustError(null);
  };

  const currentAdjustStock = adjustItem ? Number(adjustItem.stock_quantity ?? 0) : 0;
  const currentAdjustMin = adjustItem ? Number(adjustItem.minimum_stock ?? 0) : 0;
  const parsedAdjustDelta = parseFloat(adjustAmount) || 0;
  const calculatedAdjustNewStock =
    adjustMode === "in"
      ? currentAdjustStock + parsedAdjustDelta
      : currentAdjustStock - parsedAdjustDelta;
  const isAdjustNegative = calculatedAdjustNewStock < 0;

  const handleApplyPreset = (value: number) => {
    const current = parseFloat(adjustAmount) || 0;
    const next = current + value;
    setAdjustAmount(String(next));
    setAdjustError(null);
  };

  const handleSubmitAdjust = () => {
    if (!adjustItem) return;
    const amount = parseFloat(adjustAmount);
    if (!amount || amount <= 0) {
      setAdjustError("กรุณาระบุจำนวนที่มากกว่า 0");
      return;
    }
    if (isAdjustNegative) {
      setAdjustError("ยอดสต็อกคงเหลือไม่สามารถติดลบได้");
      return;
    }

    startAdjustTransition(async () => {
      setAdjustError(null);
      const res = await adjustIngredientStock({
        ingredientId: adjustItem.id,
        mode: adjustMode,
        amount,
        note: adjustNote.trim() || undefined,
      });

      if ("error" in res) {
        setAdjustError(res.error);
      } else {
        // Optimistically update item in local list
        setStockOverrides((prev) => ({
          ...prev,
          [adjustItem.id]: res.newStock,
        }));
        setNotice(res.message);
        handleCloseAdjust();
      }
    });
  };

  // ==========================================
  // 2. Bulk Restock Modal State
  // ==========================================
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkInputs, setBulkInputs] = useState<Record<number, string>>({});
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isBulkPending, startBulkTransition] = useTransition();

  // Ingredients sorted with "Out" and "Low" at the top
  const sortedBulkIngredients = useMemo(() => {
    const normalized = bulkSearch.trim().toLocaleLowerCase("th-TH");
    return [...ingredients]
      .filter((item) =>
        normalized
          ? item.name.toLocaleLowerCase("th-TH").includes(normalized) ||
            (item.ingredient_categories?.name ?? "")
              .toLocaleLowerCase("th-TH")
              .includes(normalized)
          : true
      )
      .sort((a, b) => {
        const stockA = Number(a.stock_quantity ?? 0);
        const minA = Number(a.minimum_stock ?? 0);
        const isOutA = stockA <= 0;
        const isLowA = !isOutA && stockA <= minA;

        const stockB = Number(b.stock_quantity ?? 0);
        const minB = Number(b.minimum_stock ?? 0);
        const isOutB = stockB <= 0;
        const isLowB = !isOutB && stockB <= minB;

        // Rank: 0 = Out, 1 = Low, 2 = Normal
        const rankA = isOutA ? 0 : isLowA ? 1 : 2;
        const rankB = isOutB ? 0 : isLowB ? 1 : 2;

        if (rankA !== rankB) return rankA - rankB;
        return a.name.localeCompare(b.name, "th-TH");
      });
  }, [ingredients, bulkSearch]);

  const bulkFilledCount = useMemo(() => {
    return Object.values(bulkInputs).filter((val) => {
      const num = parseFloat(val);
      return Number.isFinite(num) && num > 0;
    }).length;
  }, [bulkInputs]);

  const handleOpenBulk = () => {
    setBulkInputs({});
    setBulkSearch("");
    setBulkError(null);
    setIsBulkOpen(true);
  };

  const handleCloseBulk = () => {
    if (isBulkPending) return;
    setIsBulkOpen(false);
    setBulkInputs({});
    setBulkSearch("");
    setBulkError(null);
  };

  const handleBulkInputChange = (id: number, val: string) => {
    setBulkInputs((prev) => ({
      ...prev,
      [id]: val,
    }));
    setBulkError(null);
  };

  const handleSubmitBulk = () => {
    const itemsToSubmit = Object.entries(bulkInputs)
      .map(([id, val]) => ({
        ingredientId: Number(id),
        amount: parseFloat(val),
      }))
      .filter((it) => Number.isFinite(it.amount) && it.amount > 0);

    if (itemsToSubmit.length === 0) {
      setBulkError("กรุณากรอกจำนวนรับเข้าอย่างน้อย 1 รายการ");
      return;
    }

    startBulkTransition(async () => {
      setBulkError(null);
      const res = await bulkRestockIngredients(itemsToSubmit);
      if ("error" in res) {
        setBulkError(res.error);
      } else {
        // Optimistically update list
        setStockOverrides((prev) => {
          const next = { ...prev };
          for (const item of itemsToSubmit) {
            const orig = initialIngredients.find((it) => it.id === item.ingredientId);
            const cur = prev[item.ingredientId] ?? Number(orig?.stock_quantity ?? 0);
            next[item.ingredientId] = cur + item.amount;
          }
          return next;
        });
        setNotice(res.message);
        handleCloseBulk();
      }
    });
  };

  return (
    <>
      {/* ==========================================
          Header Section
          ========================================== */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-orange-500">จัดการคลังวัตถุดิบ</p>
          <h2 className="mt-1 text-3xl font-bold text-zinc-900">วัตถุดิบ</h2>
          <p className="mt-2 text-zinc-600">
            ค้นหา กรองหมวดหมู่ ตรวจสอบคงเหลือ และเติมสต็อกด่วน
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard/ingredients/categories"
            className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-center text-sm font-semibold text-orange-700 shadow-xs transition hover:bg-orange-50"
          >
            จัดการหมวดหมู่
          </Link>
          <button
            type="button"
            onClick={handleOpenBulk}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>รับของเข้าหลายรายการ</span>
          </button>
          <Link
            href="/dashboard/ingredients/new"
            className="rounded-xl bg-orange-500 px-5 py-3 text-center text-sm font-semibold text-white shadow-xs transition hover:bg-orange-600 active:scale-95"
          >
            + เพิ่มวัตถุดิบ
          </Link>
        </div>
      </header>

      {/* Global Notice Alert */}
      {notice && (
        <div
          role="status"
          className="mt-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-xs animate-in fade-in"
        >
          <div className="flex items-center gap-2.5 font-medium text-sm">
            <span className="text-lg">✓</span>
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-900"
          >
            ปิด
          </button>
        </div>
      )}

      {/* ==========================================
          Main Ingredients Card & Controls
          ========================================== */}
      <section className="mt-8 overflow-hidden rounded-2xl bg-white shadow-xs border border-orange-100/60">
        <div className="border-b border-zinc-100 px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-bold text-zinc-900">รายการวัตถุดิบ</h3>
              <p className="mt-1 text-xs text-zinc-500">
                แสดง {filteredIngredients.length} จาก {ingredients.length} รายการ
              </p>
            </div>

            {/* Quick Status Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  statusFilter === "all"
                    ? "bg-zinc-900 text-white shadow-xs"
                    : "border border-zinc-200 bg-zinc-50/70 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <span>ทั้งหมด</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    statusFilter === "all"
                      ? "bg-zinc-800 text-zinc-200"
                      : "bg-zinc-200/80 text-zinc-700"
                  }`}
                >
                  {statusCounts.all}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("low")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  statusFilter === "low"
                    ? "bg-rose-600 text-white shadow-xs ring-2 ring-rose-200"
                    : "border border-rose-200 bg-rose-50/70 text-rose-700 hover:bg-rose-100/80"
                }`}
              >
                <span>⚠️ ใกล้หมด / ต้องเติม</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                    statusFilter === "low"
                      ? "bg-rose-700 text-white"
                      : "bg-rose-200 text-rose-800"
                  }`}
                >
                  {statusCounts.low}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter("normal")}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  statusFilter === "normal"
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "border border-zinc-200 bg-zinc-50/70 text-zinc-600 hover:bg-zinc-100"
                }`}
              >
                <span>ปกติ</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    statusFilter === "normal"
                      ? "bg-emerald-800 text-emerald-100"
                      : "bg-zinc-200/80 text-zinc-700"
                  }`}
                >
                  {statusCounts.normal}
                </span>
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_260px]">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">
                ค้นหาวัตถุดิบ
              </span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="พิมพ์ชื่อวัตถุดิบ..."
                className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-700">
                กรองตามหมวดหมู่
              </span>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-orange-500"
              >
                <option value="all">ทั้งหมดทุกหมวดหมู่</option>
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

        {/* Table Content */}
        {filteredIngredients.length === 0 ? (
          <div className="px-6 py-16 text-center text-zinc-500">
            <span className="text-3xl">🔍</span>
            <p className="mt-2 font-medium text-sm">ไม่พบวัตถุดิบที่ตรงกับการค้นหาหรือตัวกรอง</p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setCategoryFilter("all");
                setStatusFilter("all");
              }}
              className="mt-3 text-xs font-semibold text-orange-600 hover:underline"
            >
              ล้างตัวกรองทั้งหมด
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-left">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/70 text-xs text-zinc-500">
                  <th className="px-6 py-3.5 font-semibold">ชื่อวัตถุดิบ</th>
                  <th className="px-6 py-3.5 font-semibold">หมวดหมู่</th>
                  <th className="px-6 py-3.5 font-semibold">คงเหลือ</th>
                  <th className="px-6 py-3.5 font-semibold">จุดแจ้งเตือน</th>
                  <th className="px-6 py-3.5 font-semibold">สถานะ</th>
                  <th className="px-6 py-3.5 font-semibold">อัปเดตล่าสุด</th>
                  <th className="px-6 py-3.5 text-right font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredIngredients.map((ingredient, index) => {
                  const stockQuantity = Number(ingredient.stock_quantity ?? 0);
                  const minimumStock = Number(ingredient.minimum_stock ?? 0);
                  const isOut = stockQuantity <= 0;
                  const isLowStock = !isOut && stockQuantity <= minimumStock;
                  const categoryName =
                    ingredient.ingredient_categories?.name ?? "ยังไม่มีหมวด";
                  const previousCategory =
                    filteredIngredients[index - 1]?.ingredient_categories?.name ??
                    "ยังไม่มีหมวด";

                  return (
                    <Fragment key={ingredient.id}>
                      {(index === 0 || categoryName !== previousCategory) && (
                        <tr className="bg-orange-50/60 border-t border-b border-orange-100/70">
                          <th
                            colSpan={7}
                            className="px-6 py-2.5 text-left text-xs font-bold text-orange-900"
                          >
                            🏷️ {categoryName} ·{" "}
                            {
                              filteredIngredients.filter(
                                (entry) =>
                                  (entry.ingredient_categories?.name ??
                                    "ยังไม่มีหมวด") === categoryName
                              ).length
                            }{" "}
                            รายการ
                          </th>
                        </tr>
                      )}
                      <tr className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 transition">
                        <td className="px-6 py-4 font-semibold text-zinc-900 text-sm">
                          {ingredient.name}
                          <p className="mt-0.5 text-xs font-normal text-zinc-400">
                            {ingredient.reset_every_days == null
                              ? "ไม่รีเซ็ต · ยกยอดต่อ"
                              : `${
                                  ingredient.reset_every_days === 1
                                    ? "รีเซ็ตทุกวัน"
                                    : `รีเซ็ตทุก ${ingredient.reset_every_days} วัน`
                                } เวลา ${ingredient.reset_time?.slice(0, 5)} น.`}
                          </p>
                          {ingredient.reset_next_at && (
                            <p className="mt-0.5 text-[11px] font-normal text-orange-600">
                              รอบถัดไป{" "}
                              {new Date(ingredient.reset_next_at).toLocaleString("th-TH", {
                                timeZone: "Asia/Bangkok",
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-600 font-medium">
                          {ingredient.ingredient_categories?.name ?? "ยังไม่มีหมวด"}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-zinc-900">
                          <span
                            className={
                              isOut
                                ? "text-red-600"
                                : isLowStock
                                ? "text-amber-600"
                                : "text-zinc-900"
                            }
                          >
                            {stockQuantity.toLocaleString("th-TH")}
                          </span>{" "}
                          <span className="text-xs font-normal text-zinc-500">
                            {ingredient.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500 font-medium">
                          {minimumStock.toLocaleString("th-TH")} {ingredient.unit}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              isOut
                                ? "bg-red-100 text-red-700"
                                : isLowStock
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isOut
                                  ? "bg-red-500"
                                  : isLowStock
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            {isOut ? "หมด" : isLowStock ? "ใกล้หมด" : "ปกติ"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-zinc-500">
                          {ingredient.updated_at
                            ? new Date(ingredient.updated_at).toLocaleString("th-TH", {
                                timeZone: "Asia/Bangkok",
                                dateStyle: "short",
                                timeStyle: "short",
                              })
                            : "-"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* 1. ปุ่ม + เติมสต็อก สีเขียว (Requirement 1) */}
                            <button
                              type="button"
                              onClick={() => handleOpenAdjust(ingredient)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95"
                            >
                              <span className="text-sm font-bold leading-none">+</span>
                              <span>เติมสต็อก</span>
                            </button>

                            {/* 2. ปุ่ม แก้ไข */}
                            <Link
                              href={`/dashboard/ingredients/${ingredient.id}/edit`}
                              className="inline-flex items-center rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 shadow-xs transition hover:bg-orange-50 active:scale-95"
                            >
                              แก้ไข
                            </Link>

                            {/* 3. เมนูจุดสามจุด ⋮ ด้านขวาสุด (ซ่อนปุ่มลบวัตถุดิบ) */}
                            {canDelete && (
                              <RowActionMenu
                                ingredient={ingredient}
                                canDelete={canDelete}
                              />
                            )}
                          </div>
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

      {/* ====================================================
          Modal: เติมสต็อก / ปรับยอด (Single Item Adjustment)
          ==================================================== */}
      {adjustItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/10">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 pb-4">
              <div>
                <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-full border border-orange-200/60">
                  {adjustItem.ingredient_categories?.name ?? "ยังไม่มีหมวด"}
                </span>
                <h3 className="mt-1.5 text-xl font-bold text-zinc-900">
                  {adjustItem.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseAdjust}
                disabled={isAdjustPending}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              >
                ✕
              </button>
            </div>

            {/* Current Stock Banner */}
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500 font-medium">ยอดคงเหลือปัจจุบัน</p>
                <p className="text-lg font-black text-zinc-900">
                  {currentAdjustStock.toLocaleString("th-TH")}{" "}
                  <span className="text-sm font-normal text-zinc-500">
                    {adjustItem.unit}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500 font-medium">จุดแจ้งเตือนขั้นต่ำ</p>
                <p className="text-sm font-semibold text-zinc-700">
                  {currentAdjustMin.toLocaleString("th-TH")} {adjustItem.unit}
                </p>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-zinc-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setAdjustMode("in");
                  setAdjustError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${
                  adjustMode === "in"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <span>➕</span>
                <span>รับเข้า (+)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjustMode("out");
                  setAdjustError(null);
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition ${
                  adjustMode === "out"
                    ? "bg-rose-600 text-white shadow-xs"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                <span>➖</span>
                <span>ตัดออก / ของเสีย (-)</span>
              </button>
            </div>

            {/* Amount Input */}
            <div className="mt-5">
              <label className="block">
                <span className="text-xs font-bold text-zinc-700">
                  {adjustMode === "in" ? "จำนวนที่ต้องการรับเข้า" : "จำนวนที่ต้องการตัดออก"}
                </span>
                <div className="relative mt-1.5 flex items-center">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={adjustAmount}
                    onChange={(e) => {
                      setAdjustAmount(e.target.value);
                      setAdjustError(null);
                    }}
                    placeholder="0"
                    autoFocus
                    className="w-full rounded-xl border border-zinc-300 py-3 pl-4 pr-16 text-xl font-bold font-mono outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                  />
                  <span className="pointer-events-none absolute right-4 text-sm font-bold text-zinc-400">
                    {adjustItem.unit}
                  </span>
                </div>
              </label>

              {/* Quick Preset Buttons */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-zinc-400 mr-1">ปุ่มลัด:</span>
                {getQuickAddPresets(adjustItem.unit).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => handleApplyPreset(val)}
                    className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 active:scale-95"
                  >
                    +{val.toLocaleString("th-TH")}
                  </button>
                ))}
                {adjustAmount && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustAmount("");
                      setAdjustError(null);
                    }}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:text-red-600 hover:bg-red-50"
                  >
                    ล้างค่า
                  </button>
                )}
              </div>
            </div>

            {/* Real-time Calculation Preview Box */}
            <div className="mt-5">
              <div
                className={`rounded-xl border p-4 transition ${
                  isAdjustNegative
                    ? "border-red-300 bg-red-50/70"
                    : adjustMode === "in"
                    ? "border-emerald-200 bg-emerald-50/50"
                    : "border-rose-200 bg-rose-50/50"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span
                    className={
                      isAdjustNegative
                        ? "text-red-700"
                        : adjustMode === "in"
                        ? "text-emerald-800"
                        : "text-rose-800"
                    }
                  >
                    พรีวิวยอดคงเหลือใหม่ {adjustMode === "in" ? "(หลังรับเข้า)" : "(หลังตัดออก)"}
                  </span>
                  {!isAdjustNegative && parsedAdjustDelta > 0 && (
                    <span
                      className={`font-bold ${
                        calculatedAdjustNewStock <= currentAdjustMin
                          ? "text-amber-700"
                          : "text-emerald-700"
                      }`}
                    >
                      {calculatedAdjustNewStock <= currentAdjustMin
                        ? "⚠️ สถานะ: ใกล้หมด"
                        : "✓ สถานะ: ปกติ"}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-baseline gap-2 font-mono text-sm text-zinc-700">
                  <span>เดิม {currentAdjustStock.toLocaleString("th-TH")}</span>
                  <span
                    className={`font-bold ${
                      adjustMode === "in" ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {adjustMode === "in" ? "+" : "-"} {parsedAdjustDelta.toLocaleString("th-TH")}
                  </span>
                  <span>=</span>
                  <span
                    className={`text-lg font-black ${
                      isAdjustNegative
                        ? "text-red-600"
                        : adjustMode === "in"
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {calculatedAdjustNewStock.toLocaleString("th-TH")} {adjustItem.unit}
                  </span>
                </div>

                {isAdjustNegative && (
                  <p className="mt-2 text-xs font-bold text-red-600">
                    ⚠️ ยอดสต็อกคงเหลือไม่สามารถติดลบได้ (ไม่สามารถตัดออกเกินยอดคงเหลือเดิม)
                  </p>
                )}
              </div>
            </div>

            {/* Optional Note */}
            <div className="mt-4">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">
                  หมายเหตุ (ไม่บังคับ)
                </span>
                <input
                  type="text"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  placeholder="เช่น รับของรอบเช้า, ของหมดอายุ, ทำหกเสียหาย"
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-xs outline-none focus:border-orange-500"
                />
              </label>
            </div>

            {/* Error Message */}
            {adjustError && (
              <p className="mt-3 text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-200">
                ⚠️ {adjustError}
              </p>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 border-t border-zinc-100 pt-4">
              <button
                type="button"
                onClick={handleCloseAdjust}
                disabled={isAdjustPending}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmitAdjust}
                disabled={
                  isAdjustPending ||
                  !parsedAdjustDelta ||
                  parsedAdjustDelta <= 0 ||
                  isAdjustNegative
                }
                className={`rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
                  adjustMode === "in"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {isAdjustPending
                  ? "กำลังบันทึก..."
                  : adjustMode === "in"
                  ? `+ บันทึกรับเข้า (+${parsedAdjustDelta.toLocaleString("th-TH")} ${adjustItem.unit})`
                  : `- บันทึกตัดออก (-${parsedAdjustDelta.toLocaleString("th-TH")} ${adjustItem.unit})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          Modal: รับของเข้าหลายรายการ (Bulk Restock)
          ==================================================== */}
      {isBulkOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-zinc-100 p-6 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">📦</span>
                  <h3 className="text-xl font-bold text-zinc-900">
                    รับของเข้าหลายรายการ (Bulk Restock)
                  </h3>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  กรอกจำนวนรับเข้าในรายการที่ต้องการ แล้วกดบันทึกพร้อมกันในครั้งเดียว
                  (จัดเรียงรายการที่ใกล้หมดและหมดขึ้นไว้บนสุด)
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseBulk}
                disabled={isBulkPending}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Search Bar */}
            <div className="border-b border-zinc-100 bg-zinc-50/60 px-6 py-3">
              <input
                type="search"
                value={bulkSearch}
                onChange={(e) => setBulkSearch(e.target.value)}
                placeholder="ค้นหาวัตถุดิบในรายการรับเข้า..."
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
              />
            </div>

            {/* Modal Body: Scrollable Table */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {sortedBulkIngredients.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500">
                  ไม่พบรายการวัตถุดิบที่ตรงกับคำค้นหา
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left">
                    <thead>
                      <tr className="border-b border-zinc-200 text-xs font-semibold text-zinc-500">
                        <th className="pb-3">วัตถุดิบ</th>
                        <th className="pb-3">สถานะ</th>
                        <th className="pb-3">คงเหลือปัจจุบัน</th>
                        <th className="pb-3">จุดแจ้งเตือน</th>
                        <th className="pb-3 w-56">จำนวนรับเข้า (+)</th>
                        <th className="pb-3 text-right">ยอดคำนวณใหม่</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-xs">
                      {sortedBulkIngredients.map((item) => {
                        const stock = Number(item.stock_quantity ?? 0);
                        const min = Number(item.minimum_stock ?? 0);
                        const isOut = stock <= 0;
                        const isLow = !isOut && stock <= min;
                        const inputVal = bulkInputs[item.id] ?? "";
                        const delta = parseFloat(inputVal) || 0;
                        const newStock = stock + delta;

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-zinc-50/70 transition ${
                              delta > 0 ? "bg-emerald-50/30" : ""
                            }`}
                          >
                            <td className="py-3 font-semibold text-zinc-900">
                              {item.name}
                              <p className="text-[11px] font-normal text-zinc-400">
                                {item.ingredient_categories?.name ?? "ยังไม่มีหมวด"}
                              </p>
                            </td>
                            <td className="py-3">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                                  isOut
                                    ? "bg-red-100 text-red-700"
                                    : isLow
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {isOut ? "หมด" : isLow ? "ใกล้หมด" : "ปกติ"}
                              </span>
                            </td>
                            <td className="py-3 font-medium text-zinc-700">
                              <span className={isOut ? "text-red-600 font-bold" : ""}>
                                {stock.toLocaleString("th-TH")}
                              </span>{" "}
                              <span className="text-zinc-400">{item.unit}</span>
                            </td>
                            <td className="py-3 text-zinc-500">
                              {min.toLocaleString("th-TH")} {item.unit}
                            </td>
                            <td className="py-3">
                              <div className="flex items-center gap-1.5">
                                <div className="relative flex-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0"
                                    value={inputVal}
                                    onChange={(e) =>
                                      handleBulkInputChange(item.id, e.target.value)
                                    }
                                    className={`w-full rounded-lg border px-3 py-1.5 text-xs font-mono font-bold outline-none transition ${
                                      delta > 0
                                        ? "border-emerald-500 bg-white ring-2 ring-emerald-100 text-emerald-800"
                                        : "border-zinc-200 bg-white focus:border-orange-500"
                                    }`}
                                  />
                                </div>
                                <span className="text-[11px] font-medium text-zinc-500 min-w-[36px]">
                                  {item.unit}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 text-right font-mono font-bold">
                              {delta > 0 ? (
                                <span className="text-emerald-700">
                                  {newStock.toLocaleString("th-TH")}{" "}
                                  <span className="text-[10px] font-normal text-emerald-600">
                                    {item.unit}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-zinc-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Error Message */}
            {bulkError && (
              <div className="border-t border-red-100 bg-red-50 px-6 py-2.5 text-xs font-semibold text-red-600">
                ⚠️ {bulkError}
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 p-6 pt-4">
              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    bulkFilledCount > 0 ? "text-emerald-700" : "text-zinc-500"
                  }`}
                >
                  <span className="text-base leading-none">✓</span>
                  <span>กรอกรับเข้า {bulkFilledCount} รายการ</span>
                </span>
                {bulkFilledCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setBulkInputs({})}
                    className="text-xs text-zinc-400 hover:text-red-600 underline"
                  >
                    ล้างค่าทั้งหมด
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleCloseBulk}
                  disabled={isBulkPending}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSubmitBulk}
                  disabled={isBulkPending || bulkFilledCount === 0}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isBulkPending
                    ? "กำลังบันทึก..."
                    : `บันทึกรับเข้าทั้งหมด (${bulkFilledCount} รายการ)`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
