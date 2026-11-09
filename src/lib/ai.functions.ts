import { createServerFn } from "@tanstack/react-start";
import { requireOwner, limitOwnerAction } from "./owner-auth";

export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator(
    (input: { title: string; description: string; budget: string; client: string; name: string; bio: string }) => {
      if (!input?.title || input.title.length > 500) throw new Error("بيانات غير صالحة");
      if ((input.description ?? "").length > 4000 || (input.bio ?? "").length > 4000) throw new Error("الوصف طويل جداً");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    limitOwnerAction(context.userId, "ai-proposal", 10, 60 * 60_000);
    const { streamText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("مفتاح الذكاء الاصطناعي غير مهيأ");

    let runId: string | undefined;
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
      fetch: async (input, init) => {
        const headers = new Headers(init?.headers);
        if (runId) headers.set("X-Lovable-AIG-Run-ID", runId);
        const res = await fetch(input, { ...init, headers });
        runId ??= res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined;
        return res;
      },
    });

    const result = streamText({
      model: openai.responses("openai/gpt-6-astra"),
      system:
        "أنت كاتب عروض محترف لمحاسب مستقل على منصات العمل الحر العربية. اكتب عرضاً عربياً فصيحاً مقنعاً وموجزاً (150-220 كلمة) موجهاً لصاحب المشروع: تحية، فهم دقيق للمطلوب، خطة تنفيذ مرقمة مختصرة، الأدوات/المعايير ذات الصلة، مدة تقديرية، سؤال توضيحي ذكي، وخاتمة بدعوة للتواصل. لا تستخدم Markdown ثقيلاً ولا تخترع شهادات.",
      prompt: `اسم المحاسب: ${data.name}\nنبذة: ${data.bio}\n\nالمشروع: ${data.title}\nالعميل: ${data.client}\nالميزانية: ${data.budget}\nالوصف: ${data.description}`,
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    try {
      const text = await result.text;
      if (!text.trim()) throw new Error("لم يتم توليد نص");
      return { text };
    } catch (e: any) {
      const status = e?.statusCode ?? e?.lastError?.statusCode;
      if (status === 429) throw new Error("تم تجاوز الحد المسموح مؤقتاً، حاول بعد قليل.");
      if (status === 402) throw new Error("نفد رصيد الذكاء الاصطناعي في مساحة العمل.");
      throw new Error(e?.message ?? "تعذر توليد العرض");
    }
  });

/** Server secrets: set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Lovable Cloud. */
export const sendTelegramTest = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: { text: string }) => {
    if (typeof input?.text !== "string" || !input.text || input.text.length > 3500) {
      throw new Error("رسالة تليجرام غير صالحة");
    }
    return { text: input.text };
  })
  .handler(async ({ data, context }) => {
    limitOwnerAction(context.userId, "telegram", 60, 60 * 60_000);
    const botToken = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
    const chatId = process.env["TELEGRAM_CHAT_ID"]?.trim();
    if (!botToken || !chatId) {
      throw new Error("أضف TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في أسرار Lovable Cloud");
    }
    if (!/^\d+:[\w-]{20,}$/.test(botToken) || !/^-?\d+$/.test(chatId)) {
      throw new Error("إعدادات بوت تليجرام غير صالحة");
    }
    const res = await fetch("https://api.telegram.org/bot" + botToken + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: data.text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10000),
    });
    const body = (await res.json()) as { ok?: boolean; description?: string };
    if (!res.ok || !body.ok) throw new Error("تليجرام: " + (body.description ?? String(res.status)));
    return { ok: true };
  });
