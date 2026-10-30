import { createHash, timingSafeEqual } from "node:crypto";

// Checks the `x-admin-key` header against ADMIN_EXPORT_KEY in constant time.
// An unset or empty server key never matches anything.
export function isAdminRequest(request: Request): boolean {
  const expected = process.env.ADMIN_EXPORT_KEY;
  if (!expected) return false;

  const provided = request.headers.get("x-admin-key") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
