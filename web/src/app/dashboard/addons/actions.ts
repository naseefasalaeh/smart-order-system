"use server";

import { isAddonCategory } from "@/lib/addon-categories";
import { revalidatePath } from "next/cache";
import { requireDashboardRole } from "@/lib/dashboard-auth";

export async function saveAddon(form: FormData) {
  const db = await requireDashboardRole(["admin"]);
  const id = form.get("id") ? Number(form.get("id")) : null;
  const name = String(form.get("name") ?? "").trim();
  const category = String(form.get("category") ?? "");
  if (!isAddonCategory(category)) return { error: "กรุณาเลือกประเภท" };
  const price = Number(form.get("price"));
  const maxQuantity = Number(form.get("max_quantity"));
  const displayOrder = Number(form.get("display_order"));
  const ingredientIds = form.getAll("ingredient_id").map(Number);
  const quantities = form.getAll("quantity_required").map(Number);
  if (!name || !Number.isFinite(price) || price < 0 || (id !== null && (!Number.isSafeInteger(id) || id <= 0)) ||
    !Number.isInteger(maxQuantity) || maxQuantity < 1 || maxQuantity > 3 ||
    !Number.isSafeInteger(displayOrder) || displayOrder < 0 ||
    ingredientIds.length !== quantities.length || new Set(ingredientIds).size !== ingredientIds.length ||
    ingredientIds.some((v) => !Number.isSafeInteger(v) || v <= 0) || quantities.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { error: "ตรวจชื่อ ราคา และสูตร: วัตถุดิบต้องไม่ซ้ำและปริมาณต้องมากกว่า 0" };
  }
  const { data, error } = await db.rpc("save_addon", {
    p_category: category, p_id: id, p_name: name, p_price: price, p_display_order: displayOrder,
    p_available: form.get("is_available") === "on", p_max_quantity: maxQuantity,
    p_recipe: ingredientIds.map((ingredient_id, i) => ({ ingredient_id, quantity_required: quantities[i] })),
  });
  if (error) return { error: error.code === "23505" ? "ชื่อซ้ำหรือวัตถุดิบซ้ำในสูตร" : "บันทึกไม่สำเร็จ ตัวเลือกที่เปิดขายต้องมีสูตร กรุณาตรวจข้อมูลแล้วลองใหม่" };
  revalidatePath("/dashboard/addons");
  revalidatePath("/dashboard/menus");
  revalidatePath("/table", "layout");
  return { addon: { id: Number(data), category, name, additional_price: price, is_available: form.get("is_available") === "on", max_quantity: maxQuantity, display_order: displayOrder } };
}

export async function toggleAddon(form: FormData) {
  const db = await requireDashboardRole(["admin"]);
  const id = Number(form.get("id"));
  const available = form.get("available") === "true";
  if (!Number.isSafeInteger(id) || id <= 0) return { error: "ข้อมูลตัวเลือกไม่ถูกต้อง" };
  if (available) {
    const { count, error } = await db.from("addon_ingredients").select("ingredient_id", { count: "exact", head: true }).eq("addon_id", id);
    if (error || !count) return { error: "เปิดขายไม่ได้: ยังไม่มีสูตรวัตถุดิบ" };
  }
  const { error } = await db.from("addons").update({ is_available: available, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) { console.error("Toggle addon failed", error); return { error: "เปลี่ยนสถานะไม่สำเร็จ" }; }
  revalidatePath("/dashboard/addons"); revalidatePath("/table", "layout");
  return { success: true };
}

export async function deleteAddon(id: number, name: string) {
  const db = await requireDashboardRole(["admin"]);
  if (!Number.isSafeInteger(id) || id <= 0 || !name.trim()) return { error: "ข้อมูลตัวเลือกไม่ถูกต้อง" };
  const { error } = await db.rpc("delete_addon_safely", { p_id: id, p_name: name });
  if (error) {
    console.error("Delete addon failed", error);
    return { error: error.message.includes("ADDON_IN_ACTIVE_ORDER") ? "ลบไม่ได้: มีออเดอร์ที่กำลังดำเนินการใช้ตัวเลือกนี้" : "ลบตัวเลือกไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่" };
  }
  revalidatePath("/dashboard/addons"); revalidatePath("/dashboard/menus"); revalidatePath("/table", "layout");
  return { success: true };
}
