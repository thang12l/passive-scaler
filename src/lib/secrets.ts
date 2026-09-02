import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function verifySecret(secret: string, hash: string): boolean {
  const secretHash = hashSecret(secret);
  const bufA = Buffer.from(secretHash);
  const bufB = Buffer.from(hash);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
