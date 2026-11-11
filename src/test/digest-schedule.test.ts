import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { digestSlotGate, dueDigestSlot, riyadhClock } from "../lib/digest.logic";

const workflow = readFileSync(".github/workflows/radar-background.yml", "utf8");
const runner = readFileSync("src/lib/digest.runner.server.ts", "utf8");

describe("economical twice-daily Saudi report schedule", () => {
  it("runs just two primary scans per day at 08:07 and 20:07 Riyadh", () => {
    expect(workflow).toContain('cron: "7 5 * * *"');
    expect(workflow).toContain('cron: "7 17 * * *"');
    expect(riyadhClock(new Date("2026-11-11T05:07:00Z"))).toEqual({ day: "2026-11-11", hour: 8 });
    expect(riyadhClock(new Date("2026-11-11T17:07:00Z"))).toEqual({ day: "2026-11-11", hour: 20 });
    expect(dueDigestSlot(new Date("2026-11-11T05:07:00Z"), 2)).toBe("2026-11-11-morning");
    expect(dueDigestSlot(new Date("2026-11-11T17:07:00Z"), 2)).toBe("2026-11-11-evening");
  }, 15000);

  it("backs up a missing morning report at 09:07 without extra source scans after success", () => {
    expect(workflow).toContain('cron: "7 6 * * *"');
    expect(dueDigestSlot(new Date("2026-11-11T06:07:00Z"), 2)).toBe("2026-11-11-morning");
    expect(digestSlotGate({status: "sent", started_at: "2026-11-11T05:08:00Z"}, new Date("2026-11-11T06:07:00Z"))).toBe("already-handled");
    expect(runner.indexOf("digestSlotGate(previousRun, now)")).toBeLessThan(
      runner.indexOf("collectAllSources(sanitizedSources")
    );
    expect(runner).toContain("if (gate) {");
    expect(runner).toContain("skipped_collection: true");
  }, 15000);

  it("backs up a missing evening report at 21:07 but avoids a second report", () => {
    expect(workflow).toContain('cron: "7 18 * * *"');
    expect(dueDigestSlot(new Date("2026-11-11T18:07:00Z"), 2)).toBe("2026-11-11-evening");
    expect(digestSlotGate({status: "failed", started_at: "2026-11-11T17:08:00Z"}, new Date("2026-11-11T18:07:00Z"))).toBeNull();
    expect(digestSlotGate(null, new Date("2026-11-11T18:07:00Z"))).toBeNull();
  }, 15000);

  it("doesn't race an ongoing report, but recovers stale sends", () => {
    const now = new Date("2026-11-11T06:07:00Z");
    expect(digestSlotGate({status: "sending", started_at: "2026-11-11T06:00:00Z"}, now)).toBe("in-progress");
    expect(digestSlotGate({status: "sending", started_at: "2026-11-11T05:07:00Z"}, now)).toBeNull();
  });

  it("does not run any regular two-hour or quarter-hour feed scans", () => {
    const scheduled = workflow.split("\n").filter((line) => /^\s*- cron:/.test(line));
    expect(scheduled).toHaveLength(4);
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).not.toContain('cron: "17 1,3');
  });
});
