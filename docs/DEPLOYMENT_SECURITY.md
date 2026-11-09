# Sanad Freelance Radar — deployment and security requirements

Phase 1 work is tracked in pull request #1. Do not merge until checks pass and owner access is configured.

## Required one-time setup in Lovable Cloud

1. Create a single Supabase Auth email/password account for the owner. Disable public sign-ups where possible.
2. Add **server-only** secret `SANAD_OWNER_EMAIL` (the verified account's exact email) **or** `SANAD_OWNER_USER_ID` (the Supabase Auth UUID). If both are configured, both must match.
3. To enable Telegram, add server-only secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Never expose them as `VITE_*` variables or enter them into browser storage.
4. Verify the owner can sign in, a non-owner cannot call server functions, and Telegram test sends only to the configured chat.
5. Set Cloud budget / AI limits and platform-level rate limits before inviting any other user.

## Changes and limitations

- Owner authentication is enforced in each sensitive `createServerFn` via `requireOwner`. The login screen alone is not the authorization boundary.
- The previous `botToken` and `chatId` fields are removed from browser settings and purged when an existing user opens the updated application. A previous browser backup or snapshot might still contain these values; rotate any previously exposed bot token if in doubt.
- Server-side in-memory request limits are a **best-effort** per-instance defense, not a globally enforced quota. Apply edge / Cloud rate limits as well.
- URL checks reject local hosts and direct non-public IPv4 literals, reject IPv6 literals and verify each redirect. Public DNS names can still resolve to private IPs; enforce a network egress policy or approved feed-domain allowlist before accepting untrusted feeds.
- There is no scheduled background crawler or persistent opportunity database yet. Five-minute refreshing still depends on the website being open.
- Lint was failing on hundreds of repository-wide Prettier issues before this work. CI tests, TypeScript, production build, and changed-module lint are required; the full formatting backlog is shown as a separate non-blocking report.

## Safety before merge

- Keep this PR as draft until CI checks, deployment preview and owner sign-in are verified.
- Never commit service-role keys, JWTs, Telegram bot tokens or other secrets.
- Check source status cards and open real job links after deploying to preview.
