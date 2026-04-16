import { createHash, randomBytes } from "node:crypto";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeUserCode(userCode: string): string {
  return userCode.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
}

export function formatUserCode(userCode: string): string {
  const normalized = normalizeUserCode(userCode);
  if (normalized.length <= 4) return normalized;
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}`;
}

export function generateUserCode(length = 8): string {
  let value = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = randomBytes(1)[0] % USER_CODE_ALPHABET.length;
    value += USER_CODE_ALPHABET[randomIndex]!;
  }

  return formatUserCode(value);
}
