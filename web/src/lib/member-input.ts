export const memberGenders = ["female", "male", "other", "unspecified"] as const;
export const memberAges = ["under18", "18-24", "25-34", "35-44", "45-54", "55plus", "unspecified"] as const;
export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^[+\d\s()-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()-]/g, "");
  if (phone.startsWith("+66")) phone = "0" + phone.slice(3);
  if (!/^0[689]\d{8}$/.test(phone)) return null;
  return "+66" + phone.slice(1);
}
export const memberCookie = "smart-order-member";
