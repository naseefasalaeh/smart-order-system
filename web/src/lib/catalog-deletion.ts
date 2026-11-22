export type DeleteResult = {
  status: "error" | "deleted";
  message: string;
};

export function parseCatalogId(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function deletionResult(value: unknown): DeleteResult {
  const result = value as { status?: unknown; orders?: Array<{ order_number?: unknown }> } | null;
  switch (result?.status) {
    case "deleted": return { status: "deleted", message: "ลบรายการเรียบร้อยแล้ว" };
    case "active_orders": return { status: "error", message: `ยังลบไม่ได้ กรุณาปิดหรือยกเลิกออเดอร์ที่หักสต็อกก่อน: ${Array.isArray(result.orders) ? result.orders.map((o) => `#${o.order_number ?? "-"}`).join(", ") : "มีออเดอร์ที่กำลังดำเนินการ"}` };
    case "not_found": return { status: "error", message: "ไม่พบรายการ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่" };
    case "name_changed": return { status: "error", message: "ชื่อรายการไม่ตรงกับข้อมูลล่าสุด กรุณาโหลดหน้าใหม่และพิมพ์ชื่อยืนยันอีกครั้ง" };
    default: return { status: "error", message: "ดำเนินการไม่สำเร็จ กรุณาโหลดหน้าแล้วลองใหม่" };
  }
}
