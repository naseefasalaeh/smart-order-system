"use server";

import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";

export type AdjustStockResult =
  | { success: true; newStock: number; ingredientName: string; message: string }
  | { error: string };

export async function adjustIngredientStock(input: {
  ingredientId: number;
  mode: "in" | "out";
  amount: number;
  note?: string;
}): Promise<AdjustStockResult> {
  const db = await requireDashboardRole(["admin"]);
  const { ingredientId, mode, amount } = input;

  if (!Number.isSafeInteger(ingredientId) || ingredientId <= 0) {
    return { error: "รหัสวัตถุดิบไม่ถูกต้อง" };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "กรุณาระบุจำนวนที่มากกว่า 0" };
  }

  // Attempt up to 3 times to handle potential concurrent updates
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: item, error: fetchError } = await db
      .from("ingredients")
      .select("id, name, unit, minimum_stock, category_id, stock_quantity, updated_at, reset_every_days, reset_start_date, reset_time")
      .eq("id", ingredientId)
      .maybeSingle();

    if (fetchError || !item) {
      return { error: "ไม่พบข้อมูลวัตถุดิบที่ต้องการปรับสต็อก" };
    }

    const currentStock = Number(item.stock_quantity ?? 0);
    const newStock = mode === "in" ? currentStock + amount : currentStock - amount;

    if (newStock < 0) {
      return {
        error: `ยอดสต็อกคงเหลือไม่สามารถติดลบได้ (คงเหลือปัจจุบัน: ${currentStock.toLocaleString("th-TH")} ${item.unit})`,
      };
    }

    const { error: rpcError } = await db.rpc("save_ingredient", {
      p_id: item.id,
      p_expected_updated_at: item.updated_at,
      p_values: {
        name: item.name,
        unit: item.unit,
        minimum_stock: item.minimum_stock,
        category_id: item.category_id,
        reset_every_days: item.reset_every_days,
        reset_start_date: item.reset_start_date,
        reset_time: item.reset_time,
        stock_quantity: newStock,
      },
    });

    if (rpcError) {
      if (rpcError.message === "INGREDIENT_CHANGED" && attempt < 2) {
        continue;
      }
      console.error("adjustIngredientStock failed:", rpcError);
      return { error: "บันทึกสต็อกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/ingredients");
    revalidatePath("/dashboard/menus");

    return {
      success: true,
      newStock,
      ingredientName: item.name,
      message:
        mode === "in"
          ? `รับเข้า "${item.name}" สำเร็จ (+${amount.toLocaleString("th-TH")} ${item.unit} ยอดคงเหลือใหม่: ${newStock.toLocaleString("th-TH")} ${item.unit})`
          : `ตัดสต็อก "${item.name}" สำเร็จ (-${amount.toLocaleString("th-TH")} ${item.unit} ยอดคงเหลือใหม่: ${newStock.toLocaleString("th-TH")} ${item.unit})`,
    };
  }

  return { error: "ข้อมูลสต็อกมีการเปลี่ยนแปลงพร้อมกัน กรุณาลองใหม่อีกครั้ง" };
}

export type BulkRestockItem = {
  ingredientId: number;
  amount: number;
};

export type BulkRestockResult =
  | { success: true; updatedCount: number; message: string }
  | { error: string };

export async function bulkRestockIngredients(
  items: BulkRestockItem[]
): Promise<BulkRestockResult> {
  const db = await requireDashboardRole(["admin"]);

  const validItems = items.filter(
    (item) =>
      Number.isSafeInteger(item.ingredientId) &&
      item.ingredientId > 0 &&
      Number.isFinite(item.amount) &&
      item.amount > 0
  );

  if (validItems.length === 0) {
    return { error: "กรุณาระบุจำนวนที่ต้องการรับเข้าอย่างน้อย 1 รายการ" };
  }

  let updatedCount = 0;

  for (const entry of validItems) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: item, error: fetchError } = await db
        .from("ingredients")
        .select("id, name, unit, minimum_stock, category_id, stock_quantity, updated_at, reset_every_days, reset_start_date, reset_time")
        .eq("id", entry.ingredientId)
        .maybeSingle();

      if (fetchError || !item) break;

      const currentStock = Number(item.stock_quantity ?? 0);
      const newStock = currentStock + entry.amount;

      const { error: rpcError } = await db.rpc("save_ingredient", {
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
        p_values: {
          name: item.name,
          unit: item.unit,
          minimum_stock: item.minimum_stock,
          category_id: item.category_id,
          reset_every_days: item.reset_every_days,
          reset_start_date: item.reset_start_date,
          reset_time: item.reset_time,
          stock_quantity: newStock,
        },
      });

      if (rpcError) {
        if (rpcError.message === "INGREDIENT_CHANGED" && attempt < 2) {
          continue;
        }
        console.error(`bulkRestock failed for ingredient ${entry.ingredientId}:`, rpcError);
        break;
      }

      updatedCount++;
      break;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ingredients");
  revalidatePath("/dashboard/menus");

  if (updatedCount === 0) {
    return { error: "ไม่สามารถบันทึกรายการรับเข้าได้ กรุณาลองใหม่อีกครั้ง" };
  }

  return {
    success: true,
    updatedCount,
    message: `บันทึกรับเข้าสำเร็จทั้งหมด ${updatedCount} รายการ`,
  };
}
