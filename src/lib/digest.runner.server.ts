import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { collectAllSources } from "./feeds.functions";
import { postTelegramChannel } from "./telegram-channel.server";
import { dueDigestSlot, formatDigestParts, type RadarFrequency } from "./digest.logic";
import type { Source } from "./settings";
import type { Opportunity } from "./opportunities";

/** Generated Supabase schema types are updated by Lovable; new tables exist in the DB already. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;
const BATCH_SIZE = 100;

type Preference = {
  user_id: string;
  enabled: boolean;
  sends_per_day: RadarFrequency;
  sources: Source[];
};
type Stored = {
  opportunity_id: string;
  title: string;
  source: string;
  url: string;
  description: string;
  currency: "SAR" | "USD" | null;
  budget_min: number;
  budget_max: number;
  employment: Opportunity["employment"] | null;
  work_mode: Opportunity["workMode"] | null;
  first_seen: string;
};

async function requireOk<T>(result: { data: T; error: { message: string } | null }, label: string): Promise<T> {
  if (result.error) throw new Error(label + ": " + result.error.message);
  return result.data;
}

function toRow(op: Opportunity, owner: string) {
  return {
    user_id: owner,
    opportunity_id: op.id,
    title: op.title.slice(0, 400),
    source: op.sourceName ?? op.platform,
    url: op.url,
    description: op.description.slice(0, 600),
    currency: op.budgetCurrency ?? null,
    budget_min: op.budgetMin,
    budget_max: op.budgetMax,
    employment: op.employment ?? null,
    work_mode: op.workMode ?? null,
    published_at: op.publishedAt ?? null,
  };
}

async function getPending(owner: string): Promise<Stored[]> {
  const entries: Stored[] = [];
  for (let start = 0; ; start += 500) {
    const rows = await requireOk<Stored[]>(
      await db.from("radar_found_opportunities")
        .select("opportunity_id,title,source,url,description,currency,budget_min,budget_max,employment,work_mode,first_seen")
        .eq("user_id", owner).is("notified_at", null)
        .order("first_seen", { ascending: true })
        .range(start, start + 499),
      "Read pending opportunities",
    );
    entries.push(...(rows ?? []));
    if (!rows || rows.length < 500) break;
  }
  return entries;
}

async function claimSlot(owner: string, slot: string, now: Date): Promise<boolean> {
  const { data: existing, error } = await db.from("radar_digest_runs")
    .select("status,started_at")
    .eq("user_id", owner).eq("slot_key", slot).maybeSingle();
  if (error) throw new Error("Read digest state: " + error.message);
  if (existing?.status === "sent") return false;
  // Another worker is sending. Recover only after a 30-minute stale window.
  if (existing?.status === "sending" &&
      now.getTime() - new Date(existing.started_at).getTime() < 30 * 60_000) return false;

  if (existing) {
    const { error: updateError } = await db.from("radar_digest_runs")
      .update({ status: "sending", started_at: now.toISOString(), error: null, finished_at: null })
      .eq("user_id", owner).eq("slot_key", slot);
    if (updateError) throw new Error("Recover digest state: " + updateError.message);
  } else {
    const { error: insertError } = await db.from("radar_digest_runs")
      .insert({ user_id: owner, slot_key: slot, status: "sending" });
    if (insertError) {
      if (insertError.code === "23505") return false;
      throw new Error("Claim digest slot: " + insertError.message);
    }
  }
  return true;
}

async function markStatus(owner: string, slot: string, patch: Record<string, unknown>) {
  const { error } = await db.from("radar_digest_runs")
    .update(patch).eq("user_id", owner).eq("slot_key", slot);
  if (error) throw new Error("Save digest status: " + error.message);
}

async function sendDueDigest(owner: string, slot: string, now: Date) {
  if (!(await claimSlot(owner, slot, now))) return { status: "already-handled" as const };
  let delivered = 0;
  let messageCount = 0;
  try {
    const pending = await getPending(owner);
    const items = pending.map((x) => ({
      id: x.opportunity_id,
      title: x.title, platform: x.source, url: x.url, description: x.description,
      budgetMin: x.budget_min, budgetMax: x.budget_max, budgetCurrency: x.currency,
      employment: x.employment ?? undefined, workMode: x.work_mode ?? undefined,
    }));
    const messages = formatDigestParts(items, slot);
    for (const part of messages) {
      await postTelegramChannel(part.text);
      messageCount++;
      // Mark each successfully sent chunk, so retrying never discards unsent work.
      for (let i = 0; i < part.ids.length; i += BATCH_SIZE) {
        await requireOk(
          await db.from("radar_found_opportunities").update({ notified_at: new Date().toISOString() })
            .eq("user_id", owner).in("opportunity_id", part.ids.slice(i, i + BATCH_SIZE)),
          "Save sent opportunities",
        );
      }
      delivered += part.ids.length;
      await markStatus(owner, slot, { opportunity_count: delivered, message_count: messageCount });
    }
    await markStatus(owner, slot, {
      status: "sent", opportunity_count: delivered,
      message_count: messageCount, finished_at: new Date().toISOString(), error: null,
    });
    return { status: "sent" as const, opportunities: delivered, telegram_messages: messageCount };
  } catch (error) {
    await markStatus(owner, slot, {
      status: "failed", opportunity_count: delivered, message_count: messageCount,
      finished_at: new Date().toISOString(),
      error: error instanceof Error ? error.message.slice(0, 250) : "Unknown error",
    });
    throw error;
  }
}

/**
 * Server-side hourly scan. GitHub Actions (or an approved cloud cron) invokes it
 * with a separate cron credential; it is NOT a browser-accessible server function.
 */
export async function runBackgroundRadar(now = new Date()) {
  // Broadcast only the confirmed owner’s single report; avoid duplicate posts
  // if extra Auth accounts or preferences are ever added to the database.
  const expectedId = process.env["SANAD_OWNER_USER_ID"]?.trim();
  const expectedEmail = process.env["SANAD_OWNER_EMAIL"]?.trim().toLowerCase();
  if (!expectedId && !expectedEmail) throw new Error("The radar owner must be configured");

  const { data: usersPage, error: usersError } = await db.auth.admin.listUsers({
    page: 1, perPage: 100,
  });
  if (usersError) throw new Error("Could not verify radar owner");
  const owners = (usersPage?.users ?? []).filter((user: { id: string; email?: string }) =>
    (!expectedId || user.id === expectedId) &&
    (!expectedEmail || user.email?.trim().toLowerCase() === expectedEmail),
  );
  if (owners.length !== 1) throw new Error("Could not uniquely identify radar owner");

  const ownerId: string = owners[0].id;
  const configs = await requireOk<Preference[]>(
    await db.from("radar_digest_preferences")
      .select("user_id,enabled,sends_per_day,sources")
      .eq("user_id", ownerId).eq("enabled", true).limit(1),
    "Read digest preferences",
  );
  const results: unknown[] = [];
  for (const config of configs ?? []) {
    const sources = Array.isArray(config.sources) ? config.sources : [];
    const sanitizedSources = sources.slice(0, 20).filter(
      (s): s is Source => typeof s?.url === "string" && /^https?:\/\//.test(s.url) &&
        typeof s.name === "string" && (s.type === "RSS" || s.type === "Webhook"),
    );
    const collection = await collectAllSources(sanitizedSources, Number.MAX_SAFE_INTEGER);
    if (!collection.statuses.some((s) => s.ok)) {
      throw new Error("All opportunity sources are unavailable; no incomplete digest will be sent");
    }

    const opportunities = collection.items;
    for (let start = 0; start < opportunities.length; start += BATCH_SIZE) {
      await requireOk(
        await db.from("radar_found_opportunities")
          .upsert(opportunities.slice(start, start + BATCH_SIZE).map((o) => toRow(o, config.user_id)), {
            onConflict: "user_id,opportunity_id", ignoreDuplicates: true,
          }),
        "Store discovered opportunities",
      );
    }
    const slot = dueDigestSlot(now, config.sends_per_day);
    const summary = slot ? await sendDueDigest(config.user_id, slot, now) : { status: "scanned" };
    results.push({
      status: summary.status,
      discovered: opportunities.length,
      sources_ok: collection.statuses.filter((s) => s.ok).length,
      sources_failed: collection.statuses.filter((s) => !s.ok).length,
      ...(slot ? { slot } : {}),
    });
  }
  return { timestamp: now.toISOString(), owner_count: configs?.length ?? 0, results };
}
