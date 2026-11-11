import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dueDigestSlot, riyadhClock } from "../lib/digest.logic";

const workflow = readFileSync(".github/workflows/radar-background.yml", "utf8");

describe("morning and evening digest fallback schedule", () => {
  it("runs extra morning attempts at 08:07–09:47 Riyadh local time", () => {
    expect(workflow).toContain('cron: "7,27,47 5,6 * * *"');
    expect(riyadhClock(new Date("2026-11-11T05:07:00Z"))).toEqual({ day: "2026-11-11", hour: 8 });
    expect(riyadhClock(new Date("2026-11-11T06:07:00Z"))).toEqual({ day: "2026-11-11", hour: 9 });
    expect(dueDigestSlot(new Date("2026-11-11T06:07:00Z"), 2)).toBe("2026-11-11-morning");
  }, 15000);

  it("retries a missed evening report at 21:07 Riyadh time", () => {
    expect(workflow).toContain('cron: "7,27,47 17,18 * * *"');
    expect(dueDigestSlot(new Date("2026-11-11T18:07:00Z"), 2)).toBe("2026-11-11-evening");
    expect(dueDigestSlot(new Date("2026-11-11T18:07:00Z"), 1)).toBe("2026-11-11-morning");
  }, 15000);

  it("still scans other hours and never cancels in-progress retries", () => {
    expect(workflow).toContain('cron: "17 1,3,7,9,11,13,15,19,21,23 * * *"');
    expect(workflow).toContain("cancel-in-progress: false");
  });
});
