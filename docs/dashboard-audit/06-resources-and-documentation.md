# OpenAssistant AI — Curated External Documentation & Resource Directory

**Document:** `docs/dashboard-audit/06-resources-and-documentation.md`  
**Author:** Senior Product Architect & Technical Product Analyst  
**Project:** OpenAssistant AI Operations Dashboard  
**Date:** October 2026  
**Status:** Verified Resource Directory

---

## 1. Supabase & PostgreSQL Architecture

| Resource Name | Exact Verified URL | Content Documented | Target Page / Component | Official Status | Key Limitations & Notes |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Supabase Edge Functions** | https://supabase.com/docs/guides/functions | Deno-based serverless execution, secrets injection, CLI deployment | Setup & Deployment Wizard (`/setup`), Telegram Webhook | **Official** | Runs Deno runtime; Node built-ins require `node:` prefix or npm specifiers. |
| **Supabase pg_cron Guide** | https://supabase.com/docs/guides/database/extensions/pg_cron | Periodic background job scheduling in PostgreSQL | Setup Step 6, Tasks & Reminders (`/tasks`) | **Official** | Minimum resolution is 1 minute (`* * * * *`). Requires `pg_net` for HTTP triggers. |
| **Supabase pg_net Guide** | https://supabase.com/docs/guides/database/extensions/pgnet | Async non-blocking HTTP requests from Postgres triggers/cron | Worker execution trigger in migration 2 | **Official** | HTTP POST requests to Edge Functions must include Authorization Bearer header. |
| **Supabase CLI Reference** | https://supabase.com/docs/reference/cli | Commands for `db push`, `link`, `functions deploy`, `secrets set` | Setup Wizard execution engine (`deployer.ts`) | **Official** | Requires Docker running locally only for local emulation, not for remote `--project-ref` deploys. |
| **Supabase Management API**| https://supabase.com/docs/reference/api/introduction | REST API for project inspection, billing, and health checks | Setup Validator (`/api/validate/supabase`) | **Official** | Requires Personal Access Token with Organization read privileges. |

---

## 2. Telegram Bot API

| Resource Name | Exact Verified URL | Content Documented | Target Page / Component | Official Status | Key Limitations & Notes |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Telegram Bot API Reference** | https://core.telegram.org/bots/api | Core HTTP API methods: `sendMessage`, `setWebhook`, `deleteMessage` | Bot Management (`/telegram`), Telegram Client | **Official** | Message rate limits: 30 msgs/sec global, 1 msg/sec in single private chat. |
| **Telegram Webhooks Guide** | https://core.telegram.org/bots/webhooks | Webhook security, SSL verification, secret token header, port requirements | Bot Management (`/telegram`), Webhook Handler | **Official** | `secret_token` header must be 1-256 characters (A-Z, a-z, 0-9, _, -). |
| **Telegram ForceReply Markup** | https://core.telegram.org/bots/api#forcereply | Shows reply interface with `input_field_placeholder` | Chat Key Entry, `/connect` command | **Official** | Requires client supporting Bot API 5.7+ for placeholder display. |
| **Telegram Formatting Options** | https://core.telegram.org/bots/api#formatting-options | MarkdownV2, HTML, spoiler blur syntax `||text||` | Key Confirmation blur, Alert messages | **Official** | Special characters in MarkdownV2 must be escaped with `\` outside code spans. |

---

## 3. AI Providers & Model Catalog

### 3.1 Google Gemini
* **Official API Docs:** https://ai.google.dev/api/rest
* **Models Documentation:** https://ai.google.dev/gemini-api/docs/models/gemini
* **Key Management Page:** https://aistudio.google.com/app/apikey
* **Target Component:** AI Provider Hub (`/providers`), Model Catalog (`/routing`), Setup Wizard (`/setup`).
* **Relevance:** Default fallback AI provider in OpenAssistant AI using `gemini-3.8-flash` and `gemini-3.5-flash-lite`.
* **Official:** **Yes**.
* **Limitations:** Gemini 3.8/3.0 models have dynamic rate limits on free tiers; requires backoff retry on status 429/503.

### 3.2 OpenAI
* **Official API Docs:** https://platform.openai.com/docs/api-reference
* **Model Overview:** https://platform.openai.com/docs/models
* **Pricing & Limits:** https://openai.com/api/pricing/
* **Key Management:** https://platform.openai.com/api-keys
* **Target Component:** AI Provider Hub (`/providers`), Smart Routing (`/routing`).
* **Relevance:** Powers reasoning (`o3-mini`), coding, and general tasks (`gpt-4o-mini`, `gpt-4o`).
* **Official:** **Yes**.

### 3.3 Anthropic Claude
* **Official API Docs:** https://docs.anthropic.com/en/api/getting-started
* **Models Overview:** https://docs.anthropic.com/en/docs/about-claude/models
* **Console Key Management:** https://console.anthropic.com/settings/keys
* **Target Component:** AI Provider Hub (`/providers`), Smart Routing (`/routing`).
* **Relevance:** Powers coding and nuanced reasoning via `claude-3-5-sonnet-latest` and `claude-3-5-haiku-latest`.
* **Official:** **Yes**.
* **Limitations:** Requires `x-api-key` header and `anthropic-version: 2023-06-01`.

### 3.4 xAI (Grok)
* **Official API Docs:** https://docs.x.ai/api
* **Models Overview:** https://docs.x.ai/docs/models
* **Console Key Management:** https://console.x.ai/
* **Target Component:** AI Provider Hub (`/providers`), Smart Routing (`/routing`).
* **Relevance:** High-speed inference and reasoning via `grok-2-1212` and `grok-2-mini`.
* **Official:** **Yes**.
* **Compatibility:** Fully compatible with OpenAI REST request shape via `https://api.x.ai/v1`.

### 3.5 OpenRouter
* **Official API Docs:** https://openrouter.ai/docs
* **Models & Pricing:** https://openrouter.ai/models
* **Key Management:** https://openrouter.ai/settings/keys
* **Target Component:** AI Provider Hub (`/providers`), Model Catalog (`/routing`).
* **Relevance:** Aggregator providing free-tier access (e.g. `meta-llama/llama-3.3-70b-instruct:free`) and low-cost DeepSeek R1 models.
* **Official:** **Yes**.

---

## 4. Personal Memory & External Sync

| Resource Name | Exact Verified URL | Content Documented | Target Page / Component | Official Status | Key Limitations & Notes |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Supermemory API Docs** | https://supermemory.ai/docs | External vector memory search, document ingestion, entity graphs | Memory Explorer (`/memory`), Integration Settings | **Official** | Optional external plugin; OpenAssistant AI uses built-in SQL memory engine as local ground truth. |
| **PostgreSQL Full-Text Search** | https://www.postgresql.org/docs/current/textsearch.html | Native `to_tsvector` and `websearch_to_tsquery` ranking | Built-in memory recall in `supabase-repository.ts` | **Official** | Zero external dependencies; operates natively within Postgres. |
| **pgvector Extension Guide** | https://supabase.com/docs/guides/database/extensions/pgvector | Vector embeddings storage and HNSW indexing in Supabase | Future Planned Memory Upgrade (Roadmap Stage 4) | **Official** | Requires embedding generation model (e.g. `text-embedding-3-small` or `text-embedding-004`). |

---

## 5. UI Libraries, Design Systems & Icons

| Resource Name | Exact Verified URL | Content Documented | Target Page / Component | Official Status | Why Needed |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **Radix UI Primitives** | https://www.radix-ui.com/primitives | Headless, accessible UI primitives (Dialog, Dropdown, Tabs, Popover) | All dashboard interactive components | **Official** | Complete WAI-ARIA compliance, keyboard navigation, zero CSS runtime. |
| **shadcn/ui Design System** | https://ui.shadcn.com/ | Copy-paste Tailwind + Radix component source code | Dashboard Component Library | **Official** | Developer-tool aesthetic (identical to Supabase/Vercel); clean code ownership. |
| **Lucide Icons** | https://lucide.dev/icons | 24x24 SVG stroke icon library | Navigation icons, status indicators, button icons | **Official** | Unified visual weight across all 40+ required dashboard icons. |
| **@xyflow/react (React Flow)**| https://reactflow.dev/ | Interactive node-link graph visualization library | Memory Explorer Graph (`/memory`) | **Official** | Far cleaner and lighter than raw D3; native drag, zoom, pan, and custom nodes. |
| **Tailwind CSS v3/v4** | https://tailwindcss.com/docs | Utility-first styling framework | Global styling system | **Official** | Deterministic token enforcement matching the design system hex specifications. |

---

## 6. Accessibility & Security References

| Resource Name | Exact Verified URL | Content Documented | Target Page / Component | Official Status | Notes |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **WAI-ARIA Authoring Practices (APG)** | https://www.w3.org/WAI/ARIA/apg/patterns/ | Accessible patterns for Combobox, Dialog, Alert, Tabs, Tree | All interactive UI elements | **Official (W3C)** | Mandatory guide for keyboard focus traps and screen-reader roles. |
| **Web Content Accessibility (WCAG 2.2)** | https://www.w3.org/TR/WCAG22/ | Color contrast ratios (4.5:1 text, 3:1 UI), focus visibility | Global Design System tokens | **Official (W3C)** | All dark mode tokens audited to satisfy Level AA requirements. |
| **OWASP Cheat Sheet: CSRF** | https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html | Custom header checks (`X-CSRF-Token`) and Origin validation | Setup Server & API Endpoints | **Official (OWASP)** | Enforced in `src/setup/server.ts` line 143 and line 220. |
| **NIST SP 800-38D (AES-GCM)** | https://csrc.nist.gov/publications/detail/sp/800-38d/final | Recommendation for Block Cipher Modes of Operation: Galois/Counter Mode | Credential Storage Engine | **Official (NIST)** | Enforces 96-bit unique IVs and authenticated 128-bit authentication tags. |
