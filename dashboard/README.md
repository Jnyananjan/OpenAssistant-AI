# OpenAssistant AI Dashboard

An open-source, local-first web operations dashboard for OpenAssistant AI.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Local dashboard data

The dashboard uses live HTTP only, with no demo fallback. Set `VITE_SETUP_API_BASE` to your local setup-server address before starting the app (default: `http://localhost:4000`). A separate local Node.js setup service is included. It is not a hosted server route and is not started by the preview.

### Local setup

Use Node.js 20 or later. From your local checkout:

```sh
npm install
npm run setup:configure
npm run setup
```

Configuration prompts collect credentials without echo. Enter the source values listed on Setup, numeric Telegram IDs, a valid timezone, and the follow-up limit. Optional providers can be skipped. No credential goes through chat or the browser. Configuration is stored outside the repository at `~/.jana-ai/config.enc`, encrypted with AES-256-GCM using a passphrase-derived key; the directory is owner-only and the file is owner-read/write. Keep an encrypted backup and the unlock passphrase separately. Losing both access and recovery information means reconfiguring. Local filesystem permissions are not a substitute for whole-disk security on shared computers.

`npm run setup` unlocks that file and prompts for the exact dashboard origin. For local development this is normally `http://localhost:8080`. For preview access, use the actual browser request origin; the browser may additionally require local-network permission. The service binds to `127.0.0.1:4000`, rejects unexpected Host/Origin headers, never enables wildcard CORS, and exposes credential-presence flags rather than values. Do not bind it to a LAN address or publish it as a multi-user service. It retains unlocked configuration only while running. Restart it after terminal edits.

Setup offers real Node/configuration/CLI checks, Telegram `getMe`, Gemini model-list credential verification, and a read-only inspection of the external database. Verification does not imply Telegram delivery or model generation. Saved settings are local configuration only; they are not synchronized to an absent deployed bot. Optional provider keys may be saved but are not reported as verified.

### Existing database deployment and Telegram

No OpenAssistant AI schema, migration files, or deployed handler source was provided. The service does not create a new schema or fabricate a dashboard response. Supply your existing `supabase/migrations` files, inspect/review schema compatibility and migration history, and link your local database CLI to the configured project. `npm run setup:deploy` checks the project link, inspects existing tables/extensions, performs the CLI dry run, requires terminal confirmation, and deploys pending migrations through the existing CLI. It does not deploy invented functions or auto-synchronize secrets. Check database migration history before retrying a failed deployment.

Webhook registration requires an existing public HTTPS handler which already verifies the secret header and allowed Telegram user IDs. The generated worker secret remains private in the encrypted config; an existing handler must be provisioned with the matching value through a secure deployment mechanism before registration. That provisioning mechanism and handler code are not present yet, so do not mark the handler ready until they are supplied. Registration requires terminal confirmation and is checked with `getWebhookInfo`; this is not end-to-end delivery verification. Telegram commands from the checklist are not implemented by this setup service. Never send provider keys in Telegram or return them in spoiler-marked messages.

Remaining blockers: existing database schema/migrations, existing Telegram handler and secure secret provisioning, runtime dashboard mapping, deployed reminder scheduler and delivery tests. Until those are supplied the data pages retain honest unavailable placeholders.

Read [DATA-AUDIT.md](./DATA-AUDIT.md) for removed values, the proposed validated API contract, missing capabilities, security obligations and actual test results. This is local-only without accounts; do not publish it as a private multi-user dashboard.
