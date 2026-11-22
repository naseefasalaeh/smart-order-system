/**
 * Formats an order number for clear, short display (e.g. #001, #012, #168).
 * Used for Kitchen, Staff serving, and Customer table screens.
 */
export function formatOrderNumber(orderNumber: number | string | null | undefined): string {
  if (orderNumber === null || orderNumber === undefined || orderNumber === "") return "-";
  const str = String(orderNumber).trim().replace(/^#/, "");
  const num = Number(str);
  if (Number.isFinite(num) && num > 0) {
    return `#${String(num).padStart(3, "0")}`;
  }
  return `#${str}`;
}

/**
 * Formats an order code with Bangkok date prefix (e.g. 261107-001).
 * Used for Admin overview tables, Receipts, and Historical reports.
 */
export function formatOrderCode(
  orderNumber: number | string | null | undefined,
  createdAt?: string | Date | null
): string {
  const shortNum = formatOrderNumber(orderNumber);
  if (shortNum === "-") return "-";
  const numOnly = shortNum.replace(/^#/, "");
  if (!createdAt) return shortNum;

  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return shortNum;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const datePrefix = `${part("year")}${part("month")}${part("day")}`;
  return `${datePrefix}-${numOnly}`;
}
