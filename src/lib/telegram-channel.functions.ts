import { createServerFn } from "@tanstack/react-start";
import { requireOwner, limitOwnerAction } from "./owner-auth";

/**
 * Owner-only connection test: a fixed, clearly labeled message to the server
 * configured channel. The client cannot choose recipients or pass arbitrary text.
 */
export const sendTelegramChannelTest = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    limitOwnerAction(context.userId, "telegram-channel-test", 3, 60 * 60_000);
    const { postTelegramChannel } = await import("./telegram-channel.server");
    await postTelegramChannel("✅ <b>تم ربط قناة سند بنجاح</b>\n📡 هذه رسالة اختبار لإشعارات فرص المحاسبة.\nسيتم نشر التقارير المجمعة هنا بعد تفعيل الجدولة.");
    return { ok: true as const };
  });
