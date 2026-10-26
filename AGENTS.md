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
- Opportunity data is sample data in `src/lib/opportunities.ts`; settings persist in browser localStorage via `useSettings` — no backend database yet.
- AI proposals and Telegram sends run in server functions (`src/lib/ai.functions.ts`) so keys never reach the browser.
