import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Personal application: both account authentication and an explicit owner allowlist
 * are required. If SANAD_OWNER_USER_ID or SANAD_OWNER_EMAIL is missing, fail closed.
 * Set one of these as a server secret; never add them to VITE_* variables.
 */
export const requireOwner = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const expectedId = process.env["SANAD_OWNER_USER_ID"]?.trim();
    const expectedEmail = process.env["SANAD_OWNER_EMAIL"]?.trim().toLowerCase();
    const actualEmail = typeof context.claims.email === "string"
      ? context.claims.email.trim().toLowerCase()
      : "";

    if (!expectedId && !expectedEmail) throw new Error("لم يتم إعداد حساب مالك النظام على الخادم");
    if (expectedId && expectedId !== context.userId) throw new Error("غير مصرح لهذا الحساب");
    if (expectedEmail && expectedEmail !== actualEmail) throw new Error("غير مصرح لهذا الحساب");
    return next();
  });

/**
 * Defense in depth only. Per-process counters aren't a global distributed quota.
 * Configure Cloud/WAF edge limits for a production deployment as well.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function limitOwnerAction(userId: string, action: string, max: number, periodMs: number) {
  const now = Date.now();
  const key = action + ":" + userId;
  if (windows.size > 2048) {
    for (const [id, record] of windows) if (record.resetAt <= now) windows.delete(id);
  }
  const current = windows.get(key);
  const next = !current || current.resetAt <= now
    ? { count: 1, resetAt: now + periodMs }
    : { count: current.count + 1, resetAt: current.resetAt };
  windows.set(key, next);
  if (next.count > max) throw new Error("تم تجاوز الحد المؤقت للطلبات، حاول لاحقاً");
}
