# Sanad — Owner sign-in rollout

## Requirements before merging and publishing

- Exactly one Supabase Auth email/password user exists, with confirmed email. Confirmed on 2026-11-09 in Lovable Cloud.
- Set `SANAD_OWNER_EMAIL` as a **server-only** secret and ensure it exactly matches the confirmed user's email (case-insensitive). Alternatively `SANAD_OWNER_USER_ID` may match the user's Auth UUID. If both are present, both must match.
- Enable Email sign-in in Cloud Authentication Settings; disable public sign-up once the owner account has been created. Anonymous sign-in stays disabled.
- Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` as server-only Cloud secrets for notifications. **Never** place them in GitHub, `VITE_*`, or browser localStorage.
- The Telegram token posted in a chat has previously been exposed. Rotating it is strongly advised. The app can use an existing valid token, but that does not make it safe.

## Behavior

- The app has an Arabic login screen and a logout button.
- After sign-in, the app calls a server-owned authorization check and renders the dashboard **only after owner authorization succeeds**.
- All resource-consuming server functions (feed discovery, AI proposal, Telegram) require the same verified owner.
- Login does not provide account registration, and the Supabase user itself is not a database administrator.
- Telegram is sent from the server using the configured chat ID and token, not supplied by the browser. Older stored browser bot credentials are purged when the new settings hook loads.

## Known operational limitations

- Invalid or missing `SANAD_OWNER_EMAIL` will block dashboard access. Correct it in Cloud secrets.
- A successful CI build does not prove a production login or Telegram delivery. Test sign-in, owner restriction, dashboard operations, and one Telegram test from deployed preview before promoting to production.
- In-process rate limits are not distributed across replicas; Cloud/WAF limits remain recommended.
- Custom URL fetches reject obvious private/loopback addresses, limit payload size and check redirects, but DNS rebinding protection also requires an outbound network policy.
- The five-minute alert watcher still requires an open browser tab. Background 24/7 polling is a separate phase.
