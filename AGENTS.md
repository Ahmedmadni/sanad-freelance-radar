<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Opportunity data comes from public source fetchers in `feeds.functions.ts`; settings persist in browser localStorage via `useSettings` — no backend database yet.
- Saudi job-site parsers live in the browser-safe `saudi-job-sites.ts` module, with bounded detail fetches in `feeds.functions.ts`; structured postings share explicit country and expiry validation, so these rules and employment classification can be tested without network requests.
- AI proposals and Telegram sends run in server functions (`src/lib/ai.functions.ts`) so keys never reach the browser.
- Telegram auto-alerts run client-side in `useTelegramAlerts` (mounted in AppShell) while the app is open; sent IDs live in localStorage. Moving to background alerts requires Lovable Cloud + scheduled job.
