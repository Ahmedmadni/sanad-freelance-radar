import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const managed = readFileSync("src/routes/api/public/radar-cron.ts", "utf8");
const github = readFileSync("src/routes/api/radar-cron.ts", "utf8");
const logic = readFileSync("src/lib/digest.runner.server.ts", "utf8");

describe("Lovable Cloud managed radar scheduler security", () => {
  it("has a distinct POST endpoint and requires the platform cron authenticator", () => {
    expect(managed).toContain('createFileRoute("/api/public/radar-cron")');
    expect(managed).toContain("POST: async");
    expect(managed).toContain("authenticateCronRequest(request)");
    expect(managed).toContain("if (rejected) return rejected");
    expect(managed).not.toContain("GET: async");
    expect(managed).not.toContain("SANAD_DIGEST_CRON_SECRET");
    expect(managed).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  it("reuses the checkpointed background radar without duplicate delivery logic", () => {
    expect(managed).toContain('import("@/lib/digest.runner.server")');
    expect(managed).toContain("await runBackgroundRadar()");
    expect(logic).toContain("const missing = candidates.filter(");
    expect(logic).toContain('if (!missing.length)');
    expect(github).toContain('createFileRoute("/api/radar-cron")');
  });

  it("does not expose service error details to unauthenticated callers", () => {
    expect(managed).toContain("Cache-Control");
    expect(managed).toContain('{ error: "Managed radar schedule failed; see server logs" }');
    expect(managed).not.toContain("error.message.slice(");
  });
});
