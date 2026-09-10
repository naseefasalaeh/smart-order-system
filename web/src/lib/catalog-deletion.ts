export type DeleteResult = {
  status: "error" | "deleted" | "archived" | "used";
  message: string;
};

export function parseCatalogId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function deletionResult(value: unknown): DeleteResult {
  const result = value as { status?: unknown; recipes?: unknown } | null;
  switch (result?.status) {
    case "deleted": return { status: "deleted", message: "ลบรายการเรียบร้อยแล้ว" };
    case "archived": return { status: "archived", message: "ปิดขายเมนูแล้ว โดยเก็บประวัติออเดอร์และสูตรไว้ครบ" };
    case "used": return { status: "used", message: "ลบไม่ได้ แต่ปิดขายได้: เมนูหรือตัวเลือกนี้มีประวัติออเดอร์ ต้องเก็บไว้เพื่อรักษาประวัติและรายงาน" };
    case "recipe": {
      const recipes = Array.isArray(result.recipes)
        ? result.recipes.filter((name): name is string => typeof name === "string")
        : [];
      return { status: "error", message: `ลบวัตถุดิบไม่ได้ กรุณานำออกจากสูตรก่อน: ${recipes.join(", ") || "สูตรที่ยังใช้งานวัตถุดิบนี้"}` };
    }
    case "usage": return { status: "error", message: "ลบวัตถุดิบไม่ได้ เพราะมีประวัติการหัก/คืน stock ต้องเก็บไว้เพื่อรักษาประวัติออเดอร์" };
    case "not_found": return { status: "error", message: "ไม่พบรายการ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่" };
    case "name_changed": return { status: "error", message: "ชื่อรายการไม่ตรงกับข้อมูลล่าสุด กรุณาโหลดหน้าใหม่และพิมพ์ชื่อยืนยันอีกครั้ง" };
    default: return { status: "error", message: "ดำเนินการไม่สำเร็จ กรุณาโหลดหน้าแล้วลองใหม่" };
  }
}
