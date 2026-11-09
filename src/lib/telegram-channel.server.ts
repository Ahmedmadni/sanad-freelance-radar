/**
 * All public opportunity summaries go to a Telegram channel, never to a user's
 * private TELEGRAM_CHAT_ID. Only server-side secrets can select a destination.
 */
export function telegramChannelId(value: string | undefined): string {
  const id = value?.trim() ?? "";
  if (/^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(id) || /^-100\d{5,}$/.test(id)) return id;
  throw new Error("أضف TELEGRAM_CHANNEL_ID كمعرّف قناة عام @username أو معرّف رقمي -100... في أسرار Cloud");
}

export async function postTelegramChannel(text: string): Promise<void> {
  if (!text || text.length > 4096) throw new Error("حجم رسالة القناة غير صالح");
  const bot = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  if (!bot) throw new Error("TELEGRAM_BOT_TOKEN غير مهيأ على الخادم");
  const channel = telegramChannelId(process.env["TELEGRAM_CHANNEL_ID"]);

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch("https://api.telegram.org/bot" + bot + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: channel,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as {
      ok?: boolean;
      parameters?: { retry_after?: number };
    };
    if (response.ok && body.ok) return;
    if (response.status === 429 && attempt < 2) {
      const retry = Math.min(30, Math.max(1, body.parameters?.retry_after ?? 3));
      await new Promise((resolve) => setTimeout(resolve, retry * 1000));
      continue;
    }
    // Do not include bot token, channel identifier or Telegram response body in logs.
    if (response.status === 400 || response.status === 403) {
      throw new Error("تعذر النشر في القناة؛ تأكد من المعرّف وأن البوت مشرف بصلاحية نشر الرسائل");
    }
    throw new Error("فشل إرسال تقرير القناة، HTTP " + response.status);
  }
}
