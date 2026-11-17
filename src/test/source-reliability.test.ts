import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MANUAL_JOB_SOURCES } from "../lib/manual-job-sources";
import { classifySourceError, safeSourceLabel } from "../lib/source-health";

describe("job source reliability", () => {
  it("excludes fundamentally unverifiable manual-only sites from auto-scans", () => {
    const scanner = readFileSync("src/lib/feeds.functions.ts", "utf8");
    expect(scanner).not.toContain("checkBuyerPage");
    expect(scanner).not.toContain('run("مستقل"');
    expect(scanner).not.toContain('run("خمسات"');
    expect(scanner).not.toContain('run("بعيد"');
    expect(MANUAL_JOB_SOURCES.map((s) => s.name)).toEqual(["مستقل", "خمسات", "بعيد"]);
    expect(MANUAL_JOB_SOURCES.every((s) => s.url.startsWith("https://"))).toBe(true);
    const ui = readFileSync("src/components/LiveSourcesPanel.tsx", "utf8");
    expect(ui).toContain("MANUAL_JOB_SOURCES");
    expect(ui).toContain("ليست ضمن الفحص التلقائي");
  });

  it("classifies source failures safely without returning private endpoints", () => {
    expect(classifySourceError("HTTP 403")).toBe("blocked");
    expect(classifySourceError("HTTP 429")).toBe("rate-limited");
    expect(classifySourceError("انتهت مهلة المصدر")).toBe("timed-out");
    expect(classifySourceError("تعذرت قراءة قائمة الوظائف")).toBe("format-changed");
    expect(classifySourceError("HTTP 503")).toBe("unavailable");
    expect(classifySourceError("UNKNOWN abc secret-token")).toBe("unknown");
    expect(safeSourceLabel("Hi <script>evil</script>")).not.toContain("<");
  });

  it("claims recovering slots with compare-and-swap instead of overwriting other workers", () => {
    const sender = readFileSync("src/lib/digest.runner.server.ts", "utf8");
    expect(sender).toContain('claim.eq("started_at", existing.started_at)');
    expect(sender).toContain('.eq("status", existing.status)');
    expect(sender).toContain("if (!claimed || claimed.length !== 1) return false");
    expect(sender).toContain("failed_sources:");
  });
});
