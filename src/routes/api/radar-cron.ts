import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Called only by the trusted scheduler. Never send the credential to a browser. */
async function authorize(request: Request): Promise<Response | null> {
  const custom = process.env["SANAD_DIGEST_CRON_SECRET"];
  if (!custom) return authenticateCronRequest(request);
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return new Response("Unauthorized", { status: 401 });
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(token), hash(custom))) return new Response("Unauthorized", { status: 401 });
  return null;
}

export const Route = createFileRoute("/api/radar-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rejected = await authorize(request);
        if (rejected) return rejected;
        try {
          const { runBackgroundRadar } = await import("@/lib/digest.runner.server");
          const result = await runBackgroundRadar();
          return Response.json(result, { headers: { "Cache-Control": "no-store" } });
        } catch (err) {
          // Do not leak external service responses, SQL details or credentials.
          console.error("Radar scheduled run failed:", err instanceof Error ? err.message : "Unknown");
          return Response.json({ error: "Scheduled scan failed; check server logs" }, { status: 500 });
        }
      },
    },
  },
});
