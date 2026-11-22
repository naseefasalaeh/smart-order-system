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

export const MEMBER_PASSWORD_REGEX = /^[A-Za-z0-9]{6}$/;
export const MEMBER_PASSWORD_HINT = "ตั้งรหัสผ่าน 6 ตัวอักษร (ใช้ได้เฉพาะภาษาอังกฤษ A-Z และตัวเลข 0-9)";
export const MEMBER_PASSWORD_ERROR = "รหัสผ่านต้องมีความยาว 6 ตัวอักษรพอดี และใช้ได้เฉพาะภาษาอังกฤษ (A-Z, a-z) และตัวเลข (0-9) เท่านั้น";

export function validateMemberPassword(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== "string") {
    return { valid: false, error: MEMBER_PASSWORD_ERROR };
  }
  const trimmed = password.trim();
  if (trimmed.length !== 6) {
    return { valid: false, error: "รหัสผ่านต้องมีความยาว 6 ตัวอักษรพอดี" };
  }
  if (!MEMBER_PASSWORD_REGEX.test(trimmed)) {
    return { valid: false, error: "รหัสผ่านใช้ได้เฉพาะตัวอักษรภาษาอังกฤษ (A-Z, a-z) และตัวเลข (0-9) เท่านั้น" };
  }
  return { valid: true };
}

export function generateRandomMemberPassword(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
