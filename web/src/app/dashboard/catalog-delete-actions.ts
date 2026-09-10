"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deletionResult, parseCatalogId, type DeleteResult } from "@/lib/catalog-deletion";

export async function deleteCatalogItem(formData: FormData): Promise<DeleteResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { status: "error", message: "กรุณาเข้าสู่ระบบก่อนจัดการรายการ" };
    }

    const id = parseCatalogId(formData.get("id"));
    const kind = formData.get("kind");
    const mode = formData.get("mode");
    const confirmation = formData.get("confirmation");
    if (!id || (kind !== "menu" && kind !== "ingredient") ||
        (mode !== "delete" && mode !== "archive") ||
        (kind === "ingredient" && mode === "archive") ||
        typeof confirmation !== "string" || !confirmation) {
      return { status: "error", message: "ข้อมูลรายการหรือการยืนยันไม่ถูกต้อง" };
    }

    const { data: item, error } = await supabase
      .from(kind === "menu" ? "menus" : "ingredients")
      .select("id, name").eq("id", id).maybeSingle();
    if (error) return deletionResult(null);
    if (!item) return deletionResult({ status: "not_found" });
    if (confirmation !== item.name) return deletionResult({ status: "name_changed" });

    // The authenticated RPC rechecks names and references under locks, and
    // deletes children and parent atomically. Never split this into HTTP deletes.
    const response = await supabase.rpc("delete_catalog_item_safely", {
      p_kind: kind, p_id: id, p_name: confirmation, p_archive: mode === "archive",
    });
    if (response.error) {
      console.error("Catalog deletion failed", { code: response.error.code });
      return { status: "error", message: "ยังดำเนินการไม่ได้ อาจมีรายการอ้างอิงเพิ่มหรือระบบยังไม่พร้อม กรุณาโหลดหน้าแล้วลองใหม่" };
    }
    const result = deletionResult(response.data);
    if (result.status === "deleted" || result.status === "archived") {
      revalidatePath("/dashboard", "layout");
      revalidatePath("/table", "layout");
    }
    return result;
  } catch {
    return deletionResult(null);
  }
}
