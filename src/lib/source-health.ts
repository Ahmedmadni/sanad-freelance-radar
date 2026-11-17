/** Fixed safe classifications of feed errors: never echo feed response bodies,
 * request URLs, auth headers, or API tokens to workflow logs. */
export type SourceErrorCode = "blocked" | "rate-limited" | "timed-out" | "unavailable" | "format-changed" | "unknown";

export function classifySourceError(message: string | null | undefined): SourceErrorCode {
  const m = (message ?? "").toLowerCase();
  // Only fixed internal source-batch error codes enter this branch;
  // source text, untrusted URLs and access tokens must never be propagated.
  const coded = /source_batch_failed:(blocked|rate-limited|timed-out|unavailable|format-changed|unknown)/.exec(m)?.[1];
  if (coded) return coded as SourceErrorCode;
  if (/\b(429)\b|too many requests|rate.?limit/.test(m)) return "rate-limited";
  if (/\b(401|403)\b|forbidden|access denied|captcha|human|لا تتيح قراءة|يمنع الجلب/.test(m)) return "blocked";
  if (/timeout|timed.?out|مهلة|aborted/.test(m)) return "timed-out";
  if (/\b(404|500|502|503|504)\b|unavailable|bad gateway|fetch failed|network|econnreset/.test(m)) return "unavailable";
  if (/تعذرت قراءة|تعذر التحقق|تعذرت قراءة قائمة|لا توجد روابط|تغيّر/.test(m)) return "format-changed";
  return "unknown";
}

/** Clamp source labels before returning from server APIs or publishing workflow logs. */
export function safeSourceLabel(value: string): string {
  return value.replace(/[^\p{L}\p{N}\s._-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 64) || "مصدر غير معروف";
}
