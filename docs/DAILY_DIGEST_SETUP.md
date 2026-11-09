# Sanad — autonomous opportunity radar and complete daily Telegram digest

## User-facing behavior

- **Default:** one combined report per day, target **08:00 Asia/Riyadh**.
- **Optional:** two reports per day, target **08:00 and 20:00 Asia/Riyadh**.
- **Collection:** GitHub Actions triggers an owner-independent **server-side scan every two hours**. The app/browser may be closed.
- **Contents:** every new accounting opportunity found and not already included in a successful report, including its title, platform, optional budget, short description, work mode when available, and application link.
- **Public Telegram channel:** digests are posted to a channel and visible to all members. If lengthy, the report is split into numbered posts rather than truncating to the first five jobs. Private Telegram messages remain for owner testing only.
- **When no jobs are found:** one short report says no new opportunities. Previous opportunities are not resent.
- **Delayed runs:** GitHub cron jobs may start late. The next scan can retry a missing digest in that day's time slot.
- **Sources:** built-in sources are always searched, plus optional custom sources synchronized by pressing Save on the app Settings page. Blocked sources are not fabricated and may limit completeness.

## Production state and prerequisites

PostgreSQL tables have already been added to the Lovable Cloud database using:
`supabase/migrations/20261109070000_radar_daily_digest.sql`.

The owner's initial settings are **enabled = true**, **sends_per_day = 1**. This alone does **not** start background operation; the scheduler requires a deployed version and two repository secrets.

### 1. Configure one shared scheduler secret, never place it in chat or source code

Generate a strong random credential (e.g. a password manager's 40+ character random secret). In **Lovable Cloud → Secrets**, add:

`SANAD_DIGEST_CRON_SECRET` = that credential.

In **GitHub → repository → Settings → Secrets and variables → Actions**, add:

`SANAD_DIGEST_CRON_SECRET` = the same credential.

The server requires this header for `POST /api/radar-cron` and denies unauthenticated callers. The existing Lovable-provisioned `LOVABLE_CRON_SECRET` remains available as a fallback when the separate secret is not configured.

### 2. Configure the published endpoint

After the new code is merged and deployed to Lovable, take the **actual published URL** of your radar (not the GitHub URL). Add one GitHub Actions secret:

`SANAD_DIGEST_URL` = `https://YOUR-ACTUAL-PUBLISHED-DOMAIN/api/radar-cron`

Use a verified HTTPS domain; do not invent or assume the domain. This is an HTTPS URL, not an API key.

### 3. Configure and test Telegram

Create a public Telegram channel, add `@Ahmedelmadni_bot` as an administrator with **Post Messages** permission, and configure the following **server-only Lovable Cloud secrets**:

- `TELEGRAM_BOT_TOKEN`: your existing bot token.
- `TELEGRAM_CHANNEL_ID`: the public channel username (`@your_channel`) or the numeric channel ID starting with `-100`.
- `TELEGRAM_CHAT_ID`: your existing private owner test chat (optional for public reports, but needed for the old private test button).

**Important:** The public digest uses `TELEGRAM_CHANNEL_ID` only. It never falls back to a private `TELEGRAM_CHAT_ID`; followers must **join the channel** to see posts. Merely sending `/start` to the bot does not subscribe them.

From owner Settings click **نشر رسالة اختبار في القناة**, then verify the test post appears in the channel before enabling the schedule. No Telegram secrets are copied into GitHub Actions.

Open **Actions → Sanad background job discovery + daily digest → Run workflow** for a single test. The action should return JSON containing `owner_count:1`, source success counts, and either `scanned`, `sent`, or `already-handled`. A manual trigger outside the 08:00/20:00 Riyadh digest slots only scans and archives opportunities; it does not necessarily send immediately.

Check **Settings → التقرير التلقائي الشامل** in the app after logging in; choose 1 or 2 reports and press **Save**. This also copies your custom RSS/JSON source list to Cloud for offline scanning.

### 4. Monitor cost, security and reliability

- Every two hours = **12 background scans per day**. Some sources require multiple HTTP requests; monitor Lovable Cloud compute and external traffic limits.
- GitHub scheduled jobs may be delayed or occasionally skipped. Their schedule is a target, not an exact-time SLA.
- All three radar tables have Supabase RLS enabled. The browsing owner can read their data; server jobs use a Cloud-only service-role key.
- The cron shared secret and bot token must never be logged or delivered to the client.
- Duplicate notifications are suppressed by the persistent `notified_at` checkpoint. If Telegram accepts a message but the subsequent database acknowledgement fails, a rare repeated chunk can occur; this is an at-least-once delivery limitation.
- Source errors should be monitored in Actions/Cloud logs. Sources that demand CAPTCHA or login are **not** scraped around restrictions.
- Reverting code does not remove historical database tables. Back them up or migrate deliberately; do not drop on rollback.

## Test checklist

1. `bun run test` passes timezone/chunking tests.
2. `bunx tsc --noEmit` passes.
3. `bun run build` passes.
4. Owner authentication still works.
5. No immediate Telegram messages from opening the dashboard.
6. Cloud settings show the correct report frequency and pending count.
7. A manual schedule trigger discovers opportunities without browser interaction.
8. At the next digest slot, all pending opportunities are posted in part-numbered Telegram channel messages; repeats do not resend them.
