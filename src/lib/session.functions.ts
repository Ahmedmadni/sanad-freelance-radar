import { createServerFn } from "@tanstack/react-start";
import { requireOwner } from "./owner-auth";

/** The browser must not trust the mere presence of a Supabase session. */
export const verifyOwnerAccess = createServerFn({ method: "POST" })
  .middleware([requireOwner])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async () => ({ authorized: true as const }));
