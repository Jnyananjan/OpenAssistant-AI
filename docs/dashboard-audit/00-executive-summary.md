# OpenAssistant AI — Executive Summary & Architecture Audit

**Document:** `docs/dashboard-audit/00-executive-summary.md`  
**Author:** Senior Product Designer, UX Architect & Technical Product Analyst  
**Project:** OpenAssistant AI (Open-Source Telegram-First Personal AI Productivity Assistant)  
**Date:** October 2026  
**Status:** Audit & Product Specification (Documentation-Only)

---

## 1. Product Overview

OpenAssistant AI is an open-source, Telegram-first personal productivity assistant with proactive follow-up reminder loops, multi-provider AI model routing, and persistent long-term personal memory.

### Core Value Proposition
1. **Telegram-First Frictionless Interaction:** Capture tasks, deadlines, and personal preferences in conversational natural language directly through Telegram.
2. **Persistent Escalating Reminders:** Unlike passive calendar notifications, OpenAssistant AI employs an active state machine (`scheduled` -> `sending` -> `awaiting_ack` -> `acknowledged` / `paused`), escalating follow-ups (10m, 30m, 60m up to 8 times) until explicitly resolved or snoozed.
3. **Multi-Provider AI Independence:** Users connect their own API keys (Google Gemini, OpenAI, Anthropic Claude, xAI/Grok, OpenRouter) or use OpenAI-compatible custom endpoints with client-side/database-level AES-256-GCM encryption.
4. **Task-Aware Smart Routing:** Directs requests to optimal models across 6 discrete modes (`quick_answer`, `deep_reasoning`, `coding`, `budget`, `best_available`, `manual`) and custom keyword rules.
5. **Personal Graph Memory:** Long-term episodic memory engine with category classification (`preference`, `project`, `goal`, `relationship`, `fact`), entity relationships (relates_to, depends_on, part_of, conflicts_with), bounded context prompt injection, and optional external synchronization with Supermemory.

---

## 2. Architecture Summary & Interaction Topology

The OpenAssistant AI product architecture consists of four distinct operational planes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT INTERFACES                                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          Telegram Client             │         Local Web Dashboard          │
│   (Mobile / Desktop / Web Client)    │        (Node.js Setup Server)        │
│    • Slash commands (/ai, /tasks)    │   • URL: http://localhost:3000       │
│    • Natural language text & voice   │   • Local CLI orchestrator           │
│    • Inline interactive keyboards    │   • CSRF-protected setup API         │
│    • Native ForceReply input boxes   │   • Single-use key connect forms     │
└───────────────────┬──────────────────┴───────────────────┬──────────────────┘
                    │                                      │
                    │ HTTPS Webhook                        │ Supabase Management API
                    │ Updates                              │ & Direct DB Connection
                    ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 SUPABASE BACKEND CLOUD (Project: <your-project-ref>)        │
├──────────────────────────────────────┬──────────────────────────────────────┤
│          Edge Functions              │          PostgreSQL Database         │
│  1. telegram-webhook                 │  • app_users & telegram_updates      │
│     - Webhook secret auth            │  • tasks & reminders                 │
│     - Deduplication via update_id    │  • reminder_events (audit trail)     │
│     - Allowlist authorization        │  • user_ai_credentials (AES-256-GCM) │
│     - Smart model routing            │  • user_model_preferences            │
│     - Natural language interpretation│  • user_memories & relationships     │
│                                      │  • setup_sessions & integrations     │
│  2. process-reminders                │                                      │
│     - Bearer WORKER_SECRET auth      │  Extensions & Background Engine:     │
│     - Atomic lease claiming          │  • pgcrypto (UUIDs & encryption)     │
│     - Telegram Bot API delivery      │  • pg_cron (1-min schedule: * * * * *)│
│     - Escalation follow-up calc      │  • pg_net (HTTP POST to worker)      │
└───────────────────┬──────────────────┴──────────────────────────────────────┘
                    │
                    ▼ HTTPS REST API Requests
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL AI & MEMORY PROVIDERS                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Google Gemini API (v1beta generateContent)                              │
│  • OpenAI API (v1/chat/completions)                                         │
│  • Anthropic API (v1/messages)                                              │
│  • xAI API (v1/chat/completions)                                            │
│  • OpenRouter API (v1/chat/completions)                                     │
│  • Supermemory API (v1/memories & v1/search)                                │
│  • Telegram Bot API (api.telegram.org)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Current Implementation Status Matrix

| Component / Subsystem | Repository Implementation | Verified Status | Notes / Limitations |
| :--- | :--- | :--- | :--- |
| **Telegram Bot Webhook** | `src/bot/webhook.ts` | **Implemented & Verified** | Full unit & integration test coverage (90 tests passing). Verifies webhook secret header. |
| **Update Deduplication** | `src/db/in-memory-repository.ts`, `src/db/supabase-repository.ts` | **Implemented & Verified** | Backed by `public.telegram_updates` table primary key. |
| **User Allowlist** | `src/bot/allowlist.ts` | **Implemented & Verified** | Restricts access by numeric Telegram ID from `ALLOWED_TELEGRAM_USERS` env. |
| **Reminder State Machine** | `src/reminders/policy.ts`, `src/reminders/worker.ts` | **Implemented & Verified** | Atomic lease claiming with UUID worker token; 10m/30m/60m backoff. |
| **pg_cron Scheduler** | `supabase/migrations/20261025000002_cron_schedule.sql` | **Implemented & Live** | Configured for `* * * * *` via `net.http_post` on remote project. |
| **Multi-Provider AI Adapters** | `src/ai/gemini.ts`, `openai.ts`, `anthropic.ts`, `xai.ts`, `openrouter.ts` | **Implemented & Verified** | Standard adapter interface; error sanitization; model fallback. |
| **Smart Model Router** | `src/ai/router.ts`, `src/ai/catalog.ts` | **Implemented & Verified** | 6 modes + keyword task rules (`coding`, `urgent`, `planning`). |
| **AES-256-GCM Encryption** | `src/security/encryption.ts` | **Implemented & Verified** | 96-bit random IV, SHA-256 derived master key, authenticated tag. |
| **Personal Memory Engine** | `src/memory/memory-engine.ts`, `src/memory/supermemory.ts` | **Implemented & Verified** | Keyword search, category filtering, graph model, Supermemory bridge. |
| **Local Setup Wizard Server** | `src/setup/server.ts`, `src/setup/ui.ts` | **Implemented & Verified** | Node http server; tabbed UI with deployment wizard, provider hub, memory graph. |
| **Single-Use Key Connect Page** | `src/setup/ui.ts` (`/connect-provider?token=`) | **Implemented & Verified** | 15-minute expiring token; AES-256-GCM encrypted persistence. |
| **Telegram ForceReply Key Setup**| `src/bot/commands.ts`, `src/bot/webhook.ts` | **Implemented & Verified** | Native input placeholder; automatic message deletion; spoiler blur `\|\|key\|\|`. |
| **Remote Web Dashboard (Hosted)**| Not present | **Missing** | Current dashboard is local-only (`http://localhost:3000`). No remote session auth. |
| **Token Usage & Cost Telemetry** | Database column absent | **Missing** | No request/token counters logged in database currently. |
| **Vector Embeddings (pgvector)** | Migrations 1-3 | **Missing / Planned** | Memory search currently relies on keyword matching and category filters. |

---

## 4. Overall Dashboard Recommendation

The future OpenAssistant AI web dashboard must evolve from a **ephemeral local setup wizard** into a **unified developer-grade operations cockpit**. 

### Strategic Design Principles:
1. **Developer-First Calm Aesthetic:** Zero neon clutter, zero decorative pseudo-metrics, and zero gratuitous animation. The interface should feel like a disciplined fusion of **Linear** (density, keyboard ergonomics, subtle borders), **Vercel** (monochrome surfaces, monospace accents, high-contrast typography), and **Supabase Studio** (structured table views, clear SQL/JSON status badges).
2. **Dual-Role Architecture:**
   - **Operator Mode (Local / Admin):** Complete infrastructure control, Supabase linking, migration triggers, webhook registration, environment secret configuration, and raw diagnostic logs.
   - **User Mode (Personal Cockpit):** Managing personal AI keys, inspecting active routing modes, visualizing personal memory graph nodes, browsing tasks/reminders, and configuring timezones.
3. **Strict Separation of Concerns:**
   - Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `ENCRYPTION_SECRET`, `WORKER_SECRET`) must **NEVER** be shipped to browser JavaScript or stored in frontend `localStorage`.
   - Client interactions must use authenticated session tokens (Supabase Auth or signed short-lived session cookies) and strict CSRF protection.

---

## 5. Major Gaps & Security Risks

1. **Local-Only vs. Remote Hosted Ambiguity:**
   * *Finding:* `src/setup/server.ts` currently runs as a local Node.js process using Node's `child_process.execFile` to invoke CLI commands (`supabase`, `npm`).
   * *Risk:* If this server is exposed to the public internet without an authentication layer, any visitor with network access could trigger `/api/deploy` or manipulate configuration.
   * *Recommendation:* Keep the Setup/Deployment wizard strictly local (`localhost`). For remote hosted management, create an authenticated Next.js/Vite dashboard hosted on Supabase or Vercel that interacts purely through Supabase Row-Level Security (RLS) and verified API routes.

2. **Absence of Usage & Cost Telemetry:**
   * *Finding:* Neither `public.telegram_updates`, `public.reminder_events`, nor `public.user_ai_credentials` store token counts or API latencies.
   * *Risk:* A dashboard displaying "Token Usage" or "Cost Analytics" would currently have to display fabricated or unverified estimates.
   * *Recommendation:* Add an explicit `ai_request_logs` table before designing cost tracking widgets.

3. **Single Telegram Allowlist Mechanism:**
   * *Finding:* User authorization is currently governed by a single environment variable `ALLOWED_TELEGRAM_USERS` in `src/bot/allowlist.ts`.
   * *Risk:* While effective for a single developer or private group, multi-user web dashboards require role-based access control (RBAC).

---

## 6. Structure of this Audit Specification Package

This specification package in `docs/dashboard-audit/` contains 9 exhaustive reference documents:
* **`00-executive-summary.md`**: Product overview, system topology, component status matrix, and risk overview.
* **`01-information-architecture.md`**: Complete navigation tree, user flows, permission scopes, and URL structure.
* **`02-page-specifications.md`**: Implementation-aware specifications for every single dashboard screen.
* **`03-component-inventory.md`**: Reusable component catalog with props, states, a11y, and reuse rules.
* **`04-data-api-mapping.md`**: Concrete mapping between UI components, database tables, and API contracts.
* **`05-design-system.md`**: Design tokens, typography hierarchy, spacing scale, colors, and layout rules.
* **`06-resources-and-documentation.md`**: Verified official links for all external APIs, tools, and libraries.
* **`07-prioritized-roadmap.md`**: 4-stage release plan with complexity scoring and acceptance criteria.
* **`08-open-questions-and-risks.md`**: Architectural constraints, edge-case risks, and decision logs.
