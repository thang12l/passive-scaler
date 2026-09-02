import { timingSafeEqual } from "crypto";
import { getPlatformConfig } from "./platform-config";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function validateAdminAuth(authHeader: string | null): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  return safeCompare(authHeader.slice(7), getPlatformConfig().ADMIN_SECRET);
}

export function getAdminAuthHeader(request: Request): string | null {
  return request.headers.get("authorization");
}

export function requireAdminAuth(request: Request): { authorized: true } | { authorized: false; status: 401 } {
  if (!validateAdminAuth(getAdminAuthHeader(request))) {
    return { authorized: false, status: 401 };
  }
  return { authorized: true };
}
