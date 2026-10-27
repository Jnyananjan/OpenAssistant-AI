# Real-data audit

## Setup implementation update

The initial audit below records the state before the setup service was added. `scripts/setup-server.mjs` now supplies an explicit local-only Node service with encrypted owner-only disk configuration, hidden interactive credential prompts, strict Host/Origin checks, real prerequisite checks, Telegram/Gemini credential tests, read-only database schema inspection, reviewed existing migration deployment via the local database CLI, and registration to an already configured public Telegram handler. Setup shows credential sources and honest availability; optional keys can be stored without implying verification. Preferences persist locally and are not claimed to control an absent deployed bot. No hosted backend or new schema has been provisioned.

Verification: 24 tests passed, including encrypted disk read-back and encryption-key preservation. Browser testing launched the real local CLI in an isolated temporary home, ran prerequisites, saved a changed follow-up limit, reloaded and read it back through the UI. Desktop/mobile layouts were inspected. Automatic build is OK. Real external credential tests, schema deployment, scheduler operation, secret synchronization, incoming Telegram messages and delivery remain unverified because credentials and existing deployment source are not supplied. No dashboard database mapping or fake DTO response was introduced. See README for local commands and remaining blockers. Full-repository lint was not rerun.

At the initial audit the project had no connected database, migrations, setup-server implementation, or authentication. The user subsequently specified **local-only, no sign-in/profiles**. Consequently authenticated multi-user persistence is not verified or provided. Do not expose this dashboard or its local setup server to the public internet.

| Source | Fabricated/runtime finding | Replacement/source | Initial status |
| --- | --- | --- | --- |
| `lib/store.ts` | Six tasks, ten memories, six providers, masked keys, timestamps, routing and webhook defaults | Validated setup-server dashboard response backed by configured database | Backend missing |
| `lib/api.ts` | Random latency, migration counts, bot ID/username, cron times, ping successes, message IDs, deploy logs, simulated errors | Live HTTP only; no successful fallback | Existing paths not implemented in this checkout |
| `overview.tsx` | Bot name, health inferred from truthy response, mock totals | Real health response and database records | Unavailable until configured |
| `providers.tsx` | Locally saved masked key implies connection; static model lists | Server-provided catalog, verification and capability-gated mutations | Missing credential/catalog backend |
| `routing.tsx` | Hardcoded fallback chains and local preferences | Saved routing and accessible models from server | Missing configuration backend |
| `tasks.tsx` | Local escalation implies Telegram delivery | Persisted task actions and delivery acknowledgment from server | Missing scheduler/task backend |
| `memory.tsx` | Sample selection and static categories | Real memories, relationships and schema categories | Missing database backend |
| `bot.tsx` | Fake deployment details, local toggle, session activity log | Safe real metadata; supported backend webhook and send actions | Missing Telegram configuration |
| `setup.tsx` | Fake prerequisite results/deploy logs, sample URL, insecure random/browser-visible webhook secret | Actual setup endpoints; secrets stay on server | Missing setup server |
| `AppShell.tsx` | Mock/live switch and failure simulator | Explicit local server configuration only | Live only |

## Implemented

- Removed all seeded runtime records, fake credential masks, random metrics, mock responses, fabricated deploy output, and local-only data mutations.
- `src/lib/store.ts` now contains DTOs only. Query owns cached runtime records, deduplicates reads, supports cancellation, and invalidates after confirmed operations. Caches are created per router instance, not in a server-global singleton.
- Six data pages request the **proposed, not yet implemented** `GET /api/dashboard` contract. Missing or incompatible responses fail visibly; no empty-array fallback masks a failed request. Setup prerequisite checks retain the existing real HTTP path. Deployment and webhook registration are explicitly unavailable rather than unsafe arbitrary log/secret rendering.
- Provider status requires configured credentials and a verification timestamp before a response can display “connected”. Model catalog and accessible-model lists are separate fields.
- Task deadline and next reminder time remain separate nullable ISO timestamps. Display conversion uses the viewer's timezone. Snooze requests send a duration, not a fabricated delivery timestamp.
- Search/filter/page values are in the URL. Memory selection is transient and cannot select nonexistent records. All displayed relationships are limited to the records returned by the server.
- No API keys or webhook secrets are collected or displayed. The frontend cannot validate that an external server is secure; this remains a backend obligation.
- Existing palette, typography, navigation and page layout conventions retained; unavailable screens use existing panels and buttons. No redesign performed.

## Required local backend contract — not implemented or verified

Configure `VITE_SETUP_API_BASE` before running/building locally. Default loopback address is a configuration constant, not a claim that a server is running. The browser's loopback address is its own machine, not an external hosted server.

`GET /api/dashboard` must return the validated shape in `src/lib/api.ts`: complete task/memory/provider/category lists, nullable routing/bot configuration, and explicitly supported capabilities. Absence of the entire response is an error, not an empty state. The backend must source records from its actual configured database, not seed arrays. No implementation of this endpoint exists in this repository.

Capability-gated **proposed** mutation paths are `/api/tasks/:id/{ack,snooze,pause,trigger}`, `/api/routing/save`, `/api/test/ai`, `/api/bot/webhook`, and `/api/bot/test-message`. They require an application-level `{ ok: true }` acknowledgment. Capability names must only be advertised after actual backend implementation. Existing Telegram/prerequisite test paths remain live HTTP calls. No endpoint has been assumed operational.

The external local server must bind loopback only, reject unapproved Origin/Host headers and DNS rebinding, validate inputs, enforce ownership if accounts are ever added, keep secrets server-side, and provide safe DTOs. CORS must allow only the actual local dashboard origin. Merely running locally is **not** an authorization boundary.

## Still blocked

1. **Database persistence and migrations:** no existing Supabase connection/schema or local setup server supplied. No migrations applied. Tasks, memories, routing persistence and record mutations cannot be verified.
2. **Provider credentials/catalog:** no secure credential store, provider catalog or test backend supplied. Connection/rotation/removal intentionally unavailable.
3. **Telegram:** no configured bot/recipient or real metadata/webhook/send service supplied. No real message was sent. Webhook registration also needs a reachable HTTPS endpoint; loopback is not publicly reachable by Telegram.
4. **Setup/deployment:** no `npm run setup` script or implementation exists. Prerequisite endpoint is unreachable; deployment and webhook registration remain unavailable. No generated deployment logs shown.
5. **Health/activity/usage:** no real scheduler, migration, activity or usage source exists. Scheduler health is unavailable; usage/activity are not invented.
6. **Authentication/RLS/cross-user security:** intentionally not added after the local-only/no-sign-in clarification. Multi-user access, logout/account switching and RLS isolation are not implemented or tested. This is a release blocker for private network-accessible multi-user use.

## Actual verification results

- `bunx vitest run`: **13/13 passed**, across live-data (12) and route matching (1). HTTP fixtures exist only in tests. Coverage includes empty response integrity, unavailable/404 failures, HTTP-200 application failure, malformed responses, provider verification gating, safe DTO projection, separate task dates, routing request acknowledgment and independent caches.
- Browser: visited overview/providers/routing/tasks/memory/bot against the actual unavailable local server; all displayed understandable retryable failures and no demo records. Retried the bot page. Ran real prerequisite request; failure displayed and Continue remained disabled. Screenshots inspected.
- Live authenticated CRUD, persistence after refresh, actual provider catalogs, Telegram delivery, realtime, cross-user access, and populated backend flows: **not verified**, because the necessary backend does not exist.
- `bun run lint`: **failed**, 2013 formatting errors / 10 refresh warnings. Most output concerns pre-existing workspace assets and existing UI formatting; full output is in the sandbox validation log. No claim of lint success.
- Manual type-check/build commands: **not run** because this environment runs them automatically. Latest automatic validation entry at `2026-10-25T18:53:36Z`: **build OK**. A separate manually executed production build was not performed.
- Final production-source search for old mock toggles, random values, seeded names/models/IDs, shared-store mutation calls and fake delivery messages returned no matches. Static brand/copy/enums and test fixtures remain.

**Status: mock removal and honest frontend integration completed; the requested real-data persistence definition of done is not met until the missing local backend/database services are supplied and verified.**