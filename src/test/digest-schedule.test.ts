import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { digestSlotGate, recoverableDigestSlots, riyadhClock } from "../lib/digest.logic";

const workflow = readFileSync(".github/workflows/radar-background.yml", "utf8");
const runner = readFileSync("src/lib/digest.runner.server.ts", "utf8");

describe("recoverable twice-daily Saudi digest schedule", () => {
  it("provides repeated attempts near 08:00 and 20:00 Riyadh", () => {
    expect(workflow).toContain('cron: "7,37 5,17 * * *"');
    expect(workflow).toContain('cron: "7 6,18 * * *"');
    expect(riyadhClock(new Date("2026-11-13T05:07:00Z"))).toEqual({ day: "2026-11-13", hour: 8 });
    expect(riyadhClock(new Date("2026-11-13T17:07:00Z"))).toEqual({ day: "2026-11-13", hour: 20 });
    expect(recoverableDigestSlots(new Date("2026-11-13T05:07:00Z"), 2)).toContain("2026-11-13-morning");
    expect(recoverableDigestSlots(new Date("2026-11-13T17:07:00Z"), 2)).toContain("2026-11-13-evening");
  }, 15000);

  it("can recover missed evening reports on the following morning", () => {
    expect(workflow).toContain('cron: "23 1,3,5,7,9,11,13,15,17,19,21,23 * * *"');
    expect(recoverableDigestSlots(new Date("2026-11-13T00:30:00Z"), 2))
      .toEqual(["2026-11-12-morning", "2026-11-12-evening"]);
    expect(recoverableDigestSlots(new Date("2026-11-13T09:54:00Z"), 2))
      .toContain("2026-11-12-evening");
  });

  it("skips expensive collection once every recoverable slot is already sent", () => {
    const scan = runner.indexOf('const candidates = recoverableDigestSlots');
    const gate = runner.indexOf('const missing = candidates.filter');
    const fetch = runner.indexOf('collectAllSources(sanitizedSources');
    expect(scan).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(scan);
    expect(fetch).toBeGreaterThan(gate);
    expect(runner).toContain('if (!missing.length)');
    expect(runner).toContain('skipped_collection: true');
    expect(digestSlotGate({status: "sent", started_at: "2026-11-12T17:05:00Z"},
      new Date("2026-11-13T00:30:00Z"))).toBe("already-handled");
  });

  it("backs up a failed report and avoids racing a currently sending report", () => {
    const now = new Date("2026-11-13T09:54:00Z");
    expect(digestSlotGate({status: "failed", started_at: "2026-11-13T06:00:00Z"}, now)).toBeNull();
    expect(digestSlotGate({status: "sending", started_at: "2026-11-13T09:45:00Z"}, now)).toBe("in-progress");
    expect(digestSlotGate({status: "sending", started_at: "2026-11-13T08:30:00Z"}, now)).toBeNull();
  });

  it("doesn't silently mark an out-of-window response as successful", () => {
    expect(workflow).not.toContain('.status == "outside-window"');
    expect(workflow).toContain('.status == "sent"');
    expect(workflow).toContain('.status == "already-handled"');
    expect(workflow).toContain("cancel-in-progress: false");
    const scheduled = workflow.split("\n").filter((line) => /^\s*- cron:/.test(line));
    expect(scheduled).toHaveLength(3);
  });
});
