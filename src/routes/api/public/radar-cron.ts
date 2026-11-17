import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/**
 * Separate endpoint for Lovable Cloud's first-party managed HTTP scheduler.
 * The /api/public prefix is required by the platform, but this POST endpoint
 * is not publicly callable: every request needs the server-only cron bearer.
 * Existing GitHub Actions keep using /api/radar-cron without any change.
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore The TanStack plugin generates route path types on the first build.
export const Route = createFileRoute("/api/public/radar-cron")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rejected = await authenticateCronRequest(request);
        if (rejected) return rejected;
        try {
          const { runBackgroundRadar } = await import("@/lib/digest.runner.server");
          const result = await runBackgroundRadar();
          return Response.json(result, {
            headers: { "Cache-Control": "no-store" },
          });
        } catch (error) {
          // Keep API responses free of SQL errors and service credentials.
          console.error(
            "Managed radar schedule failed:",
            error instanceof Error ? error.message : "Unknown error",
          );
          return Response.json(
            { error: "Managed radar schedule failed; see server logs" },
            { status: 500, headers: { "Cache-Control": "no-store" } },
          );
        }
      },
    },
  },
});
