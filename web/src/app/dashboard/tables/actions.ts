"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDashboardRole } from "@/lib/dashboard-auth";

export async function saveTable(form: FormData) {
  const db = await requireDashboardRole(["admin"]);
  const id = form.get("id") ? Number(form.get("id")) : null;
  const number = String(form.get("table_number") ?? "").trim();
  const active = form.get("is_active") === "on";
  if ((id !== null && (!Number.isSafeInteger(id) || id <= 0)) || !number || number.length > 40) {
    redirect("/dashboard/tables?error=" + encodeURIComponent("ข้อมูลโต๊ะไม่ถูกต้อง"));
  }
  const { error } = await db.rpc("manage_restaurant_table", { p_id: id, p_number: number, p_active: active });
  if (error) {
    console.error("Save table failed", error);
    redirect("/dashboard/tables?error=" + encodeURIComponent(error.code === "23505" || error.message.includes("TABLE_NUMBER_RESERVED") ? "หมายเลขโต๊ะนี้ถูกใช้แล้ว" : "บันทึกโต๊ะไม่สำเร็จ"));
  }
  revalidatePath("/dashboard/tables");
  redirect("/dashboard/tables?success=" + encodeURIComponent("บันทึกโต๊ะแล้ว"));
}
