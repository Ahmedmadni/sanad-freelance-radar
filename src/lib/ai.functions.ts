import { createServerFn } from "@tanstack/react-start";

export const generateProposal = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { title: string; description: string; budget: string; client: string; name: string; bio: string }) => {
      if (!input?.title || input.title.length > 500) throw new Error("بيانات غير صالحة");
      if ((input.description ?? "").length > 4000) throw new Error("الوصف طويل جداً");
      return input;
    },
  )
  .handler(async ({ data }) => {
    const { streamText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");
    const apiKey = process.env.LOVABLE_API_KEY;
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

export const sendTelegramTest = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; chatId: string; text: string }) => {
    if (!/^\d+:[\w-]{20,}$/.test(input?.token ?? "")) throw new Error("صيغة التوكن غير صحيحة");
    if (!input.chatId || input.chatId.length > 64) throw new Error("معرف الشات مطلوب");
    return { ...input, text: (input.text ?? "").slice(0, 3500) };
  })
  .handler(async ({ data }) => {
    const res = await fetch(`https://api.telegram.org/bot${data.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: data.chatId, text: data.text, parse_mode: "HTML" }),
    });
    const body = (await res.json()) as { ok: boolean; description?: string };
    if (!body.ok) throw new Error(`تليجرام: ${body.description ?? res.status}`);
    return { ok: true };
  });
