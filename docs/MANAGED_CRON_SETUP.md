# Independent managed scheduler for Sanad

GitHub Actions schedules are best-effort and have repeatedly started after the
08:00/20:00 Riyadh reporting windows. The first-party Lovable Cloud HTTP
scheduler provides a separate trigger alongside the existing GitHub workflow.

## Scheduled endpoint

- `POST /api/public/radar-cron`
- Requires the private `LOVABLE_CRON_SECRET` via the existing generated
  `authenticateCronRequest()` function.
- This route is **not** an open public API despite the required URL prefix.
- The existing GitHub endpoint `POST /api/radar-cron` remains unchanged and
  requires `SANAD_DIGEST_CRON_SECRET`.
- Both invoke exactly the same checkpointed `runBackgroundRadar()` function.
  Successful slots are skipped without recrawling or reposting.

## Managed schedule

Use Lovable's managed `create_http_schedule` tool, not custom SQL with a
secret embedded in a Postgres table. Configure:

- Name: `sanad-managed-digest`
- Path: `/api/public/radar-cron`
- Method: `POST`
- Cron: `10,40 5,6,17,18 * * *` **UTC**
- In Riyadh (UTC+3): 08:10, 08:40, 09:10, 09:40 and 20:10, 20:40,
  21:10, 21:40 every day.
- Authentication: Lovable's built-in private cron bearer (not any user token).

Retain GitHub Actions as an independent fallback. The database slots
`YYYY-MM-DD-morning` and `YYYY-MM-DD-evening` prevent duplicate posts.
The server also recovers missed previous-day slots.

## Verification after activation

1. Ensure a managed schedule exists and is enabled, and record its name/ID.
2. Confirm the endpoint responds 401 without the managed credential.
3. Verify the scheduled invocation receives a valid response (including
   `owner_count: 1`) and does not expose secrets in output.
4. Query `radar_digest_runs` after the morning/evening reporting window:
   expect both slots to show `status=sent` with nonzero message counts.
5. Monitor `radar_found_opportunities` for `notified_at IS NULL` and check
   partial source failures, which are separate from scheduler failures.

Neither a GitHub green check nor an HTTP 200 with a prior-slot
`already-handled` response proves the current day's report was delivered.
The Telegram API acknowledgement and slot records are the stronger signals.
