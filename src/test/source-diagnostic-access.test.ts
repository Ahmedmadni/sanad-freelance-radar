import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const cron = readFileSync("src/routes/api/radar-cron.ts", "utf8");
const workflow = readFileSync(".github/workflows/radar-source-health.yml", "utf8");

describe("protected source diagnostics", () => {
  it("requires server cron authorization before reading diagnostic mode", () => {
    expect(cron).toContain("if (rejected) return rejected;");
    expect(cron).toContain('searchParams.get("source_health") === "1"');
    expect(cron).toContain('request.headers.get("X-Sanad-Source-Health") === "1"');
    expect(cron.indexOf("if (rejected) return rejected;")).toBeLessThan(
      cron.indexOf('searchParams.get("source_health")'),
    );
  });

  it("collects built-in job sources without saving or publishing opportunities", () => {
    const begin = cron.indexOf('if (request.headers.get("X-Sanad-Source-Health")');
    const end = cron.indexOf('const { runBackgroundRadar }', begin);
    const diagnostic = cron.slice(begin, end);
    expect(diagnostic).toContain('collectAllSources([], 2_000)');
    expect(diagnostic).not.toContain("postTelegramChannel");
    expect(diagnostic).not.toContain("runBackgroundRadar()");
    expect(diagnostic).not.toContain("TELEGRAM_BOT_TOKEN");
    expect(diagnostic).toContain("classifySourceError(source.error)");
    expect(diagnostic).toContain("safeSourceLabel(source.name)");
  });

  it("does not put the cron key into the workflow output", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('source_health=1"');
    expect(workflow).toContain("X-Sanad-Source-Health: 1");
    expect(workflow).toContain('$SANAD_DIGEST_CRON_SECRET');
    expect(workflow).toContain('"$GITHUB_STEP_SUMMARY"');
    expect(workflow).not.toContain("cat \"$response_file\"");
  });
});
