import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const server = readFileSync("src/lib/digest.functions.ts", "utf8");
const screen = readFileSync("src/routes/settings.tsx", "utf8");

describe("owner-only missed report recovery", () => {
  it("does not allow anonymous use or client-selected Telegram destinations", () => {
    const action = server.slice(server.indexOf("export const runDueDigestNow"));
    expect(action).toContain(".middleware([requireOwner])");
    expect(action).toContain('limitOwnerAction(context.userId, "manual-digest-recovery"');
    expect(action).toContain('import("./digest.runner.server")');
    expect(action).toContain("await runBackgroundRadar()");
    expect(action).not.toContain("TELEGRAM_CHAT_ID");
    expect(action).not.toContain("TELEGRAM_CHANNEL_ID");
    expect(action).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  it("offers an explicit catch-up button without changing scheduled settings", () => {
    expect(screen).toContain("runDueDigestNow");
    expect(screen).toContain("فحص وإرسال التقارير المستحقة الآن");
    expect(screen).toContain("لا يعيد نشر الفرص أو التقارير");
  });
});
