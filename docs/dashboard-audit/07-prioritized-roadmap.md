# OpenAssistant AI — Prioritized Dashboard Roadmap & Implementation Plan

**Document:** `docs/dashboard-audit/07-prioritized-roadmap.md`  
**Author:** Technical Product Analyst & Full-Stack Architect  
**Project:** OpenAssistant AI Operations Dashboard  
**Date:** October 2026  
**Status:** 4-Stage Release Plan

---

## Roadmap Strategy Overview

To prevent UI bloat, minimize security vulnerabilities, and ensure immediate operational stability, dashboard development is divided into four sequential milestones:

* **Stage 1 (Essential MVP):** The smallest complete interface to configure, deploy, verify, and recover OpenAssistant AI safely.
* **Stage 2 (Core Operations):** Full self-service provider credential hub, model routing selection, memory table/graph inspection, and task tracking.
* **Stage 3 (Advanced Observability):** Telemetry instrumentation, sanitized error streaming, worker batch metrics, and automated health checks.
* **Stage 4 (Ecosystem Enhancements):** Advanced graph clustering, pgvector embeddings, Supermemory two-way sync, and mobile PWA wrapping.

---

## Stage 1 — Essential: The Deploy & Recover Cockpit

*Goal: Give the developer 100% confidence in the live bot, database, and background worker without manual terminal hacking.*

### 1.1 Automated Setup & Deployment Wizard (`/setup`)
* **User Value:** One-click deployment from local machine to Supabase with automated verification.
* **Dependencies:** Node.js, npm, Supabase CLI, Git repo.
* **Backend Work Required:** **None** (Fully implemented in `src/setup/validator.ts` and `src/setup/deployer.ts`).
* **Frontend Complexity:** Medium.
* **Security Risk:** Low (Strictly local, secrets masked in logs).
* **Priority:** **P0 (Critical)**.
* **Acceptance Criteria:**
  - [x] Validates Node, npm, and Supabase CLI.
  - [x] Tests Telegram token format and calls `getMe`.
  - [x] Tests Gemini key and fetches available models.
  - [x] Applies Supabase migrations (0001, 0002, 0003).
  - [x] Deploys both Edge Functions and configures secrets.
  - [x] Configures `pg_cron` schedule `* * * * *`.
  - [x] Sets Telegram webhook with secret token header.

### 1.2 System Health Ticker (`/overview`)
* **User Value:** Instant confirmation that DB, Telegram Webhook, AI Model, and Worker are running.
* **Dependencies:** Setup Server running on `localhost:3000`.
* **Backend Work Required:** Implement `GET /api/overview/summary` aggregating existing DB queries.
* **Frontend Complexity:** Low (4 status cards with indicator dots).
* **Security Risk:** Low.
* **Priority:** **P0 (Critical)**.
* **Acceptance Criteria:**
  - Displays database ping latency and migration count (`3/3`).
  - Displays Telegram bot username and pending update count.
  - Displays active AI provider and model.
  - Displays last worker run timestamp.

### 1.3 Emergency Webhook Recovery Action (`/telegram`)
* **User Value:** Ability to recover from an update storm or broken webhook URL with one click.
* **Dependencies:** Telegram Bot Token in server env.
* **Backend Work Required:** Implement `POST /api/telegram/re-register`.
* **Frontend Complexity:** Low (Button with confirmation modal).
* **Security Risk:** Medium (Must require CSRF token).
* **Priority:** **P0 (Critical)**.
* **Acceptance Criteria:**
  - Calls `setWebhook` with current Supabase Edge Function URL and secret token.
  - Optionally calls `deleteWebhook?drop_pending_updates=true` if selected.

---

## Stage 2 — Core Operations: Personal Agency Hub

*Goal: Empower the user to manage their AI credentials, routing preferences, memory bank, and tasks.*

### 2.1 AI Provider Credential Hub (`/providers`)
* **User Value:** Connect personal API keys (Gemini, OpenAI, Anthropic, xAI, OpenRouter) with zero chat exposure.
* **Dependencies:** Database table `public.user_ai_credentials`, AES-256-GCM encryption service.
* **Backend Work Required:** Expose `GET /api/user/credentials` and `DELETE /api/user/credentials/:provider`.
* **Frontend Complexity:** Medium (5 provider cards, drawer with password inputs, masked key display).
* **Security Risk:** High (Sensitive keys handled; must never return raw keys in responses).
* **Priority:** **P1 (High)**.
* **Acceptance Criteria:**
  - Validates key against provider API before persisting.
  - Stores AES-256-GCM encrypted payload (`encrypted_key`, `iv`, `auth_tag`).
  - Renders masked key (`sk-...1234`) with spoiler blur.
  - Disconnect button purges key from database immediately.

### 2.2 Smart Model Routing Selector (`/routing`)
* **User Value:** Switch between Quick Answer, Deep Reasoning, Coding, Budget, and Best Available modes.
* **Dependencies:** `public.user_model_preferences`, `src/ai/router.ts`.
* **Backend Work Required:** Expose `GET /api/user/routing-preferences` and `PUT /api/user/routing-preferences`.
* **Frontend Complexity:** Medium (Segmented cards, task rule override rows).
* **Security Risk:** Low.
* **Priority:** **P1 (High)**.
* **Acceptance Criteria:**
  - Changes save to database and take effect on next Telegram message immediately.
  - Shows clear descriptions of which models are selected for each mode.

### 2.3 Memory Bank Table & SVG Graph (`/memory`)
* **User Value:** Total transparency into what the assistant remembers with search and deletion controls.
* **Dependencies:** `public.user_memories`, `public.memory_relationships`.
* **Backend Work Required:** Already implemented (`GET /api/memory/graph`, `GET /api/memory`, `POST /api/memory`, `POST /api/memory/delete`).
* **Frontend Complexity:** High (SVG/Canvas force layout + tabular search/filter).
* **Security Risk:** Medium (Contains personal user facts; strictly scoped by `userId`).
* **Priority:** **P1 (High)**.
* **Acceptance Criteria:**
  - Nodes rendered with category colors (Purple, Blue, Amber, Rose, Emerald).
  - Clicking node opens edit drawer.
  - Table search filters memories in real-time.
  - Delete memory removes record and associated relationship edges.

### 2.4 Task & Reminder Escalation Monitor (`/tasks`)
* **User Value:** View to-do list, see when next follow-up will fire, and force-complete or snooze tasks.
* **Dependencies:** `public.tasks`, `public.reminders`.
* **Backend Work Required:** Expose `GET /api/tasks`, `POST /api/tasks/:id/complete`, `POST /api/reminders/:id/snooze`.
* **Frontend Complexity:** Medium (Kanban pipeline lanes or filterable table).
* **Security Risk:** Low.
* **Priority:** **P1 (High)**.
* **Acceptance Criteria:**
  - Lists open, overdue, and completed tasks.
  - Displays follow-up progress (`Follow-up 2 of 8`).
  - Complete and Snooze buttons update state in DB.

---

## Stage 3 — Advanced Observability & Telemetry

*Goal: Provide deep operational insight into latency, error patterns, and audit logs.*

### 3.1 Sanitized Diagnostic Stream (`/diagnostics`)
* **User Value:** Debug failures without leaking authorization headers or API tokens.
* **Backend Work Required:** Connect `src/security/encryption.ts:redactString` to log capture stream.
* **Frontend Complexity:** Low (Monospace console viewer with auto-scroll lock).
* **Priority:** **P2 (Medium)**.

### 3.2 Audit Event Timeline (`/tasks` & `/overview`)
* **User Value:** Verifiable timeline of reminder lifecycle events (created -> scheduled -> sent -> acknowledged).
* **Backend Work Required:** Query `public.reminder_events` table.
* **Frontend Complexity:** Low (Timestamped vertical timeline component).
* **Priority:** **P2 (Medium)**.

### 3.3 Diagnostic Report Export (`/diagnostics`)
* **User Value:** Download one-click sanitized JSON bundle to share for debugging.
* **Backend Work Required:** Create `GET /api/diagnostics/export` compiling deployment status and recent events with all secrets stripped.
* **Frontend Complexity:** Low (Single download action).
* **Priority:** **P2 (Medium)**.

---

## Stage 4 — Optional Enhancements & Ecosystem

*Goal: Advanced power-user capabilities.*

### 4.1 pgvector Semantic Memory Embeddings
* **User Value:** Semantic similarity recall ("What was that book I liked?") instead of pure keyword matching.
* **Backend Work Required:** Supabase migration enabling `vector` extension and adding `embedding vector(1536)` to `user_memories`.
* **Frontend Complexity:** Low.
* **Priority:** **P3 (Future)**.

### 4.2 Supermemory Deep Synchronization Explorer
* **User Value:** Bi-directional sync with Supermemory external knowledge base.
* **Backend Work Required:** Webhook receiver for Supermemory sync events.
* **Frontend Complexity:** Medium.
* **Priority:** **P3 (Future)**.

---

## Deliberately Excluded from V1 (Anti-Bloat Checklist)

The following items are **intentionally omitted** from Version 1 to keep the dashboard focused, fast, and secure:
1. ❌ **Estimated Cost & Token Charts:** The database currently logs zero token counts. Showing fake or estimated cost numbers would be misleading.
2. ❌ **Full Chat History Viewer:** Storing and rendering raw user-bot conversation logs in a web UI introduces unnecessary privacy and data exposure risks. Telegram is the conversational interface; the dashboard is the operations cockpit.
3. ❌ **Voice Recording Audio Player:** Voice messages sent via Telegram are transcribed and discarded; raw audio files are not stored in Supabase Storage.
4. ❌ **Complex Micro-Billing / Multi-Tenant Subscriptions:** OpenAssistant AI is a personal, open-source productivity assistant, not a multi-tenant SaaS billing platform.
