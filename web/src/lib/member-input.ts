export const memberGenders = ["female", "male", "other", "unspecified"] as const;
export type MemberGender = (typeof memberGenders)[number];

export const memberGenderLabels: Record<MemberGender, string> = {
  female: "หญิง",
  male: "ชาย",
  other: "อื่นๆ",
  unspecified: "ไม่ระบุ",
};

export const memberAges = ["under18", "18-24", "25-34", "35-44", "45-54", "55plus", "unspecified"] as const;
export type MemberAge = (typeof memberAges)[number];

export const memberAgeLabels: Record<MemberAge, string> = {
  under18: "ต่ำกว่า 18 ปี",
  "18-24": "18 - 24 ปี",
  "25-34": "25 - 34 ปี",
  "35-44": "35 - 44 ปี",
  "45-54": "45 - 54 ปี",
  "55plus": "55 ปีขึ้นไป",
  unspecified: "ไม่ระบุ",
};

export function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 40 || !/^[+\d\s()-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()-]/g, "");
  if (phone.startsWith("+66")) phone = "0" + phone.slice(3);
  if (!/^0[689]\d{8}$/.test(phone)) return null;
  return "+66" + phone.slice(1);
}

export function formatThaiPhone(phone?: string | null): string {
  if (!phone) return "-";
  let clean = phone;
  if (clean.startsWith("+66")) {
    clean = "0" + clean.slice(3);
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

export const memberCookie = "smart-order-member";
