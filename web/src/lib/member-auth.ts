import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashMemberPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyMemberPassword(password: string, combinedHash: string): boolean {
  try {
    const [salt, storedHash] = combinedHash.split(":");
    if (!salt || !storedHash) return false;
    const computed = scryptSync(password, salt, 32).toString("hex");
    return timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(storedHash, "hex"));
  } catch {
    return false;
  }
}
