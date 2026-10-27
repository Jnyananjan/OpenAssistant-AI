## Architecture

- All local setup-server requests pass through `src/lib/api.ts`, use real HTTP only, and validate runtime responses; the backend is external and missing operations must never be simulated.
- TanStack Query owns runtime data caching and mutation invalidation; `src/lib/store.ts` contains DTOs only, so private records are not held in a server-global store.
- Dashboard routes are client-rendered because the configured loopback setup server is on the browser's local machine, not the hosted SSR machine.
- Expected dashboard API failures use a discriminated unavailable result rendered by the shared data boundary, not thrown route errors; this keeps missing local services from triggering runtime-crash reporting.
- Unavailable page layouts live in `DashboardPlaceholders` as presentation-only shells, never fake DTOs in query data; disabled controls prevent pretend operations.
- Setup-server configuration uses `VITE_SETUP_API_BASE`; no credentials or persisted user records belong in frontend environment variables.
- The explicit local setup service lives in `scripts/` outside the hosted import graph; it runs only on the user's computer and unlocks owner-only encrypted configuration interactively, so operating-system work never runs in hosted routes.
- Setup UI receives credential-presence flags only; terminal configuration remains supported, and provider-modal draft keys may be submitted only to an explicitly capable encrypted server endpoint. Never retrieve stored keys, preserve master keys on edits, and require real inspection plus terminal approval of existing migrations.
- The provider hub renders its add/configure dialog even when dashboard data is unavailable; server capability flags gate writes and model catalogs come only from verified runtime data, so no local-store persistence or fabricated models are introduced.
- The workload advisor calls an LLM from a `createServerFn` handler (`src/lib/advisor.functions.ts`) with server-held `OPENAI_API_KEY`; it only recommends providers the setup server has verified as connected, and a recommendation that names anything outside that catalog is rejected server-side.
