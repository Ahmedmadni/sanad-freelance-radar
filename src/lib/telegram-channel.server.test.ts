import { afterEach, describe, expect, it, vi } from "vitest";
import { postTelegramChannel, telegramChannelId } from "./telegram-channel.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public Telegram channel destination", () => {
  it("accepts public usernames and Telegram channel numeric IDs", () => {
    expect(telegramChannelId("@SanadJobs2026")).toBe("@SanadJobs2026");
    expect(telegramChannelId(" -1001234567890 ")).toBe("-1001234567890");
  });

  it("does not allow private chat IDs, URLs, or arbitrary channel names", () => {
    for (const candidate of ["123456789", "-123456789", "https://t.me/channel", "", "@bot"]) {
      expect(() => telegramChannelId(candidate)).toThrow();
    }
  });

  it("never falls back to TELEGRAM_CHAT_ID when the channel is unset", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:FAKE_TEST_TOKEN_FOR_UNIT_TESTS");
    vi.stubEnv("TELEGRAM_CHAT_ID", "123456789");
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(postTelegramChannel("Test")).rejects.toThrow("TELEGRAM_CHANNEL_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends public messages only to the configured channel", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:FAKE_TEST_TOKEN_FOR_UNIT_TESTS");
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "@SanadJobs2026");
    vi.stubEnv("TELEGRAM_CHAT_ID", "123456789");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await postTelegramChannel("✅ اختبار");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      chat_id: "@SanadJobs2026",
      text: "✅ اختبار",
      parse_mode: "HTML",
    });
  });

  it("reports missing channel post permission without exposing the token", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "123456789:FAKE_TEST_TOKEN_FOR_UNIT_TESTS");
    vi.stubEnv("TELEGRAM_CHANNEL_ID", "@SanadJobs2026");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ ok: false }),
    }));
    await expect(postTelegramChannel("Test")).rejects.toThrow("مشرف");
  });
});
