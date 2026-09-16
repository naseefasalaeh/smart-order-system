"use server";

import { isAddonCategory } from "@/lib/addon-categories";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveAddon(form: FormData) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { error: "กรุณาเข้าสู่ระบบใหม่" };
  const id = form.get("id") ? Number(form.get("id")) : null;
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "");
  if (!isAddonCategory(category)) return { error: "กรุณาเลือกประเภท" };
  const price = Number(form.get("price"));
  const maxQuantity = Number(form.get("max_quantity"));
  const ingredientIds = form.getAll("ingredient_id").map(Number);
  const quantities = form.getAll("quantity_required").map(Number);
  if (!name || !Number.isFinite(price) || price < 0 || (id !== null && (!Number.isSafeInteger(id) || id <= 0)) ||
    !Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 3 ||
    ingredientIds.length !== quantities.length || new Set(ingredientIds).size !== ingredientIds.length ||
    ingredientIds.some((v) => !Number.isSafeInteger(v) || v <= 0) || quantities.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { error: "ตรวจชื่อ ราคา และสูตร: วัตถุดิบต้องไม่ซ้ำและปริมาณต้องมากกว่า 0" };
  }
  const { data, error } = await db.rpc("save_addon", {
    p_category: category, p_id: id, p_name: name, p_price: price,
    p_available: form.get("is_available") === "on", p_max_quantity: maxQuantity,
    p_recipe: ingredientIds.map((ingredient_id, i) => ({ ingredient_id, quantity_required: quantities[i] })),
  });
  if (error) return { error: error.code === "23505" ? "ชื่อซ้ำหรือวัตถุดิบซ้ำในสูตร" : "บันทึกไม่สำเร็จ ตัวเลือกที่เปิดขายต้องมีสูตร กรุณาตรวจข้อมูลแล้วลองใหม่" };
  revalidatePath("/dashboard", "layout");
  revalidatePath("/table", "layout");
  return { addon: { id: Number(data), category, name, additional_price: price, is_available: form.get("is_available") === "on", max_quantity: maxQuantity } };
}
