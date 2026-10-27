# OpenAssistant AI — Page-by-Page UI & Functional Specifications

**Document:** `docs/dashboard-audit/02-page-specifications.md`  
**Author:** Senior Product Designer, UX Architect & Technical Product Analyst  
**Project:** OpenAssistant AI Operations & Setup Dashboard  
**Date:** October 2026  
**Status:** Comprehensive Page Specifications

---

## Page 1: Overview (Operations Cockpit)

### 1. Page Name & Purpose
* **Page Name:** System Overview
* **Purpose:** Single-pane-of-glass status dashboard showing the live operational state of OpenAssistant AI: infrastructure connectivity, active AI routing, pending reminder escalations, memory bank volume, and recent system health.
* **Primary User:** Developer/Operator maintaining the bot and the primary end-user monitoring their personal assistant status.
* **Navigation Location:** Primary sidebar item `/` or `/overview` (Top item in navigation).

### 2. Page Hierarchy & Layout
* **Header:** Title "Overview", environment badge (`Live / Supabase`), quick refresh icon button, and last-updated relative timestamp (`Updated 2m ago`).
* **Section 1 (Health Ticker Cards - 4 Columns):**
  1. *Supabase DB:* Ping latency, connection pool status, migrations count (`3/3 applied`).
  2. *Telegram Bot:* Bot username (`@JanaAIBot`), webhook status (`Active`), pending updates (`0`).
  3. *AI Provider Hub:* Active provider name, default model, routing mode.
  4. *Reminder Worker:* Next scheduled run (`pg_cron: * * * * *`), active leases, 24h sent count.
* **Section 2 (Two-Column Main Content):**
  * *Left Column (60%):* Upcoming Tasks & Escalating Reminders widget; Recent Audit Events stream.
  * *Right Column (40%):* Personal Memory Bank snapshot (Category breakdown); Connected AI Providers status list.
* **Footer Actions:** Links to Telegram Bot chat, GitHub repository, and Documentation.

### 3. Components & UI Elements
* `StatusCard`: Compact card with title, large numerical/text state, indicator pill (`healthy`, `warning`, `error`), and subtext.
* `Badge`: Pill badge with dot indicator for connection statuses.
* `DataTable`: Mini-table for upcoming reminders (Task Title, Scheduled At, Follow-up #, Status).
* `CategoryDistributionBar`: Stacked bar chart showing percentage of memories by category.
* `ActionButton`: Quick actions (`Send Test Ping`, `Run Worker Now`, `Add Memory`).

### 4. Displayed Fields & Exact Labels
* `Database Status`: "Connected" | "Unreachable" | "Error"
* `Migrations Applied`: "3 of 3 migrations active"
* `Telegram Bot`: "@<username>" (ID: `<bot_id>`)
* `Webhook Status`: "Active" (Pending: `0`)
* `Active AI Model`: `<defaultModel>` via `<defaultProvider>`
* `Routing Mode`: "Best Available" | "Quick Answer" | "Deep Reasoning" | "Coding" | "Budget" | "Manual"
* `Scheduled Reminders`: Count of records where `status = 'scheduled'`
* `Awaiting Acknowledgment`: Count of records where `status = 'awaiting_ack'`
* `Paused Reminders`: Count of records where `status = 'paused'` (hit max 8 follow-ups)
* `Total Memories`: Count of active records in `public.user_memories`

### 5. Data Sources & Backend Endpoints
* **Database Tables:** `public.app_users`, `public.reminders`, `public.tasks`, `public.user_ai_credentials`, `public.user_memories`, `public.telegram_updates`, `public.reminder_events`.
* **Existing Functions:** `db.listTasks()`, `db.getUserCredentials()`, `db.getUserModelPreferences()`, `validator.validateTelegramToken()`.
* **API Endpoints:**
  * *Existing:* `GET /api/status` (Setup server deployment status).
  * *Required New:* `GET /api/overview/summary` (Aggregated status returning DB health, counts, active model, and worker heartbeats).

### 6. Actions & Interaction Behavior
* **Primary Action:** Click "Connect AI Provider" if 0 providers configured, or "Chat on Telegram" to open `https://t.me/<bot_username>`.
* **Secondary Actions:** "Refresh Status" (refetches summary JSON), "Trigger Worker Batch" (calls `/functions/v1/process-reminders` manually).
* **Click Behavior:** Clicking on the "Reminders" card navigates to `/tasks`; clicking on "AI Model" card navigates to `/routing`.

### 7. States (Loading, Empty, Error)
* **Loading State:** Skeleton blocks for the 4 status cards and table rows with subtle pulse animation.
* **Empty State:** If no tasks exist: "No active tasks or reminders. Talk to Jana on Telegram to schedule your first reminder."
* **Error State:** If Supabase is unreachable: Red alert banner across top with error message and "Retry Connection" button.

### 8. Accessibility, Security & Implementation Status
* **Accessibility:** WCAG AA contrast on all status badges. Full keyboard tabbing across cards. `aria-live="polite"` on refresh updates.
* **Security:** No raw API keys or bot tokens rendered. User Telegram IDs truncated/masked if in multi-user view.
* **Implementation Status:** **Partially Implemented** (The individual DB queries and setup status exist; unified overview summary API endpoint needs implementation).
* **Source Files:**
  * Backend: [`src/db/repository.ts`](file:///d:/Projects/Jana%20AI/src/db/repository.ts#L38-L195), [`src/setup/server.ts`](file:///d:/Projects/Jana%20AI/src/setup/server.ts#L399-L403)
  * UI Template: [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L180-L300)

---

## Page 2: AI Provider Hub (`/providers`)

### 1. Page Name & Purpose
* **Page Name:** AI Provider Hub
* **Purpose:** Manage personal AI model API credentials, test provider connectivity, view masked keys, configure custom OpenAI-compatible endpoints, and generate secure single-use key-entry web sessions.
* **Primary User:** End user or developer connecting their Gemini, OpenAI, Claude, xAI, or OpenRouter accounts.
* **Navigation Location:** Primary sidebar item `/providers`.

### 2. Page Hierarchy & Layout
* **Header:** Title "AI Provider Hub", subtitle "Connect and manage your personal API keys securely. All credentials are encrypted with client-side AES-256-GCM before database persistence.", action button "Add Custom Endpoint".
* **Main Grid (Cards for each supported provider):**
  1. *Google Gemini* (Official SDK / REST)
  2. *OpenAI* (GPT-4o, GPT-4o-mini, o3-mini)
  3. *Anthropic Claude* (Claude 3.5 Sonnet, Haiku)
  4. *xAI (Grok)* (Grok 2, Grok 2 Mini)
  5. *OpenRouter* (Llama 3.3, DeepSeek R1, Free models)
* **Card Anatomy:**
  * Provider icon, Provider Display Name, Architecture badge (`Official SDK` / `REST`)
  * Connection Status Badge (`Connected` [Green], `Disconnected` [Slate], `Invalid Key` [Red])
  * Masked Key Display (`sk-...1234` or `AIza...5678`)
  * Actions: "Test Connection", "Update Key", "Disconnect"
  * Single-Use Setup Link generator button
* **Drawer / Modal (Connect Provider):**
  * Provider name, API Key input (`type="password"` with show/hide toggle), Optional Base URL input (for custom proxy or OpenAI-compatible hosts), "Test Credentials" button, "Save & Encrypt" button.

### 3. Displayed Fields & Exact Labels
* `Provider Name`: "Google Gemini", "OpenAI", "Anthropic Claude", "xAI (Grok)", "OpenRouter"
* `Status`: "Connected" | "Not Configured" | "Validation Failed"
* `Stored Key`: `sk-...1234` (or `••••••••` if short)
* `Custom Base URL`: `https://api.openai.com/v1` (default or custom URL)
* `Last Tested`: "Passed (200 OK) - 10 mins ago" or "Failed: 401 Unauthorized"

### 4. Data Sources & Backend Endpoints
* **Database Tables:** `public.user_ai_credentials` (`user_id`, `provider`, `encrypted_key`, `iv`, `auth_tag`, `masked_key`, `base_url`, `is_active`).
* **Existing Functions:**
  * `db.getUserCredentials(userId)`
  * `db.saveUserCredential(userId, provider, encrypted, maskedKey, baseUrl)`
  * `db.deleteUserCredential(userId, provider)`
  * `router.getAdapter(provider).validateCredentials({ apiKey, baseUrl })`
* **API Endpoints:**
  * *Existing:* `GET /api/providers/catalog`
  * *Existing:* `POST /api/providers/validate`
  * *Existing:* `POST /api/connect-provider` (Single-use token entry)
  * *Required New:* `GET /api/user/credentials` (Returns list of active providers with masked keys for current user).
  * *Required New:* `DELETE /api/user/credentials/:provider` (Disconnects and purges key).

### 5. Interaction Behavior & Security
* **Key Submission:** When user enters key and clicks "Save & Encrypt":
  1. Front-end calls `POST /api/providers/validate` to verify key against the live provider.
  2. If valid, server encrypts key using AES-256-GCM with master `ENCRYPTION_SECRET`.
  3. Stored in `user_ai_credentials` table with random 96-bit IV and auth tag.
  4. Raw key is discarded from memory; only `masked_key` is returned to client.
* **Disconnect:** Requires explicit confirmation dialog: "Disconnecting OpenAI will disable models dependent on this provider. Existing memories and tasks are unaffected."
* **Implementation Status:** **Implemented & Verified** (Backend adapter validation, encryption, database storage, and `/api/connect-provider` tested; dashboard management UI is currently embedded in `src/setup/ui.ts`).
* **Source Files:**
  * Backend: [`src/ai/router.ts`](file:///d:/Projects/Jana%20AI/src/ai/router.ts#L44-L70), [`src/security/encryption.ts`](file:///d:/Projects/Jana%20AI/src/security/encryption.ts#L10-L53)
  * UI Template: [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L80-L160)

---

## Page 3: Model Catalog & Smart Routing (`/routing`)

### 1. Page Name & Purpose
* **Page Name:** Model Catalog & Smart Routing
* **Purpose:** Configure global and task-specific model routing rules, inspect supported capabilities across models, set budget limits, and designate fallback priorities.
* **Primary User:** Developer or power user optimizing performance, latency, reasoning depth, and cost.
* **Navigation Location:** Primary sidebar item `/routing`.

### 2. Page Hierarchy & Layout
* **Header:** Title "Model Routing", subtitle "Define how OpenAssistant AI selects models for conversations based on task intent and complexity."
* **Section 1: Active Routing Strategy Selector (Segmented Cards):**
  * ⚡ **Quick Answer:** Fast lightweight models (`gemini-3.8-flash`, `gpt-4o-mini`, `claude-3-5-haiku`).
  * 🧠 **Deep Reasoning:** Complex planning and math (`o3-mini`, `gemini-3.8-pro`, `claude-3-5-sonnet`, `deepseek-r1`).
  * 💻 **Coding Mode:** Specialized code generation (`claude-3-5-sonnet`, `gpt-4o`).
  * 💰 **Budget Mode:** Prioritizes zero-cost and lowest-tier models (`llama-3.3-70b:free`, `gemini-3.5-flash-lite`).
  * ✨ **Best Available:** Selects highest quality model among currently connected user keys.
  * ⚙️ **Manual Mode:** Strictly forces user's default chosen model for every turn.
* **Section 2: Task-Specific Routing Overrides (Table/Rule Builder):**
  * Rule Builder: "When message matches [Coding Keywords] -> Route to [Claude 3.5 Sonnet (Anthropic)]"
  * Rule Builder: "When message matches [Urgent Keywords] -> Route to [Gemini 3.8 Flash (Google)]"
  * Rule Builder: "When message matches [Planning Keywords] -> Route to [o3-mini (OpenAI)]"
* **Section 3: Searchable Model Catalog (Data Table):**
  * Search bar + Provider filters (Gemini, OpenAI, Anthropic, xAI, OpenRouter).
  * Table columns: Model Display Name, Provider, Context Window (tokens), Capabilities badges, Cost Tier, Availability status (Connected/Locked).

### 3. Displayed Fields & Exact Labels
* `Routing Mode`: `quick_answer` | `deep_reasoning` | `coding` | `budget` | `best_available` | `manual`
* `Default Provider`: Dropdown showing currently connected providers.
* `Default Model`: Dropdown showing verified models for selected provider.
* `Context Window`: Formatted number (e.g. `1,048,576 tokens` for Gemini Flash, `128,000 tokens` for GPT-4o).
* `Cost Tier`: Badge (`Free`, `Low`, `Medium`, `High`).
* `Capabilities`: Badges (`Quick Answer`, `Coding`, `Deep Reasoning`, `Structured Output`, `Streaming`, `Tools`).

### 4. Data Sources & Backend Endpoints
* **Database Tables:** `public.user_model_preferences` (`user_id`, `default_provider`, `default_model`, `routing_mode`, `task_rules`).
* **Existing Functions:**
  * `db.getUserModelPreferences(userId)`
  * `db.saveUserModelPreferences(userId, prefs)`
  * `catalog.DEFAULT_MODEL_CATALOG` in [`src/ai/catalog.ts`](file:///d:/Projects/Jana%20AI/src/ai/catalog.ts#L4-L122)
* **API Endpoints:**
  * *Existing:* `GET /api/providers/catalog`
  * *Required New:* `GET /api/user/routing-preferences`
  * *Required New:* `PUT /api/user/routing-preferences` (Saves mode, default model, and task rules JSON).

### 5. Implementation Status & Source Files
* **Implementation Status:** **Implemented & Verified** (Catalog and router logic fully tested in unit suites; persistence supported by migration 3).
* **Source Files:**
  * Catalog: [`src/ai/catalog.ts`](file:///d:/Projects/Jana%20AI/src/ai/catalog.ts#L1-L135)
  * Router: [`src/ai/router.ts`](file:///d:/Projects/Jana%20AI/src/ai/router.ts#L18-L181)

---

## Page 4: Personal Memory Explorer (`/memory`)

### 1. Page Name & Purpose
* **Page Name:** Personal Memory Explorer
* **Purpose:** Visualize, search, curate, edit, and purge the assistant's long-term semantic and episodic memory bank.
* **Primary User:** End user wanting full transparency and agency over what the AI remembers about them.
* **Navigation Location:** Primary sidebar item `/memory`.

### 2. Page Hierarchy & Layout
* **Header:** Title "Memory Explorer", subtitle "Inspect what Jana remembers across conversations. Memories are dynamically injected into prompts to personalize responses.", View toggle (`Graph View` | `Table View`), Action "Add Memory".
* **Section 1: Filter & Search Bar:**
  * Search input ("Filter by keyword, topic, or entity...")
  * Category Pills: `All`, `Preferences (Purple)`, `Projects (Blue)`, `Goals (Amber)`, `Relationships (Rose)`, `Facts (Emerald)`.
  * External Sync Status indicator (`Supermemory: Connected / Local Only`).
* **Section 2A: Interactive Graph View (Canvas / SVG):**
  * Interactive node-link visualization.
  * Nodes sized by relationship count, colored by category.
  * Edges labeled by relationship type (`relates_to`, `depends_on`, `part_of`, `conflicts_with`).
  * Click node -> opens Slide-over Detail Drawer on right.
* **Section 2B: Accessible Table View:**
  * Columns: Key / Label, Content, Category, Confidence, Source (`user` / `telegram` / `supermemory`), Created Date, Actions (Edit, Delete).
* **Section 3: Slide-Over Detail & Edit Drawer:**
  * Selected node/record detail: Full content editor, category select, explicit key identifier, list of related memories with "Add Connection" dropdown.
  * Delete memory button with confirmation.

### 3. Displayed Fields & Exact Labels
* `Memory Key`: Optional slug identifier (e.g. `pref_dark_mode`, `project_jana`)
* `Content`: Full text note (e.g. "User prefers concise bullet points and dark mode themes")
* `Category`: `preference` | `project` | `goal` | `relationship` | `fact`
* `Confidence`: Numeric score `0.0` - `1.0` (Default `1.0`)
* `Source`: `user` | `telegram` | `supermemory`
* `Relation Type`: `relates_to` | `depends_on` | `part_of` | `conflicts_with`

### 4. Data Sources & Backend Endpoints
* **Database Tables:** `public.user_memories`, `public.memory_relationships`, `public.user_external_integrations`.
* **Existing Functions:**
  * `memoryEngine.buildGraph(userId)`
  * `memoryEngine.recall(userId, query, category)`
  * `memoryEngine.remember(userId, content, category, key)`
  * `memoryEngine.forget(userId, query)`
* **API Endpoints:**
  * *Existing:* `GET /api/memory/graph?userId=...` (Returns `{ nodes, edges }`).
  * *Existing:* `GET /api/memory?userId=...` (Returns array of memory objects).
  * *Existing:* `POST /api/memory` (Creates or updates memory).
  * *Existing:* `POST /api/memory/delete` (Deletes single memory).
  * *Required New:* `POST /api/memory/clear` (Deletes all memories for user with confirmation).
  * *Required New:* `POST /api/memory/relationship` (Creates link between two nodes).

### 5. Implementation Status & Source Files
* **Implementation Status:** **Implemented & Verified** (Backend engine, graph builder, local SVG rendering, and database schema 3 tested).
* **Source Files:**
  * Engine: [`src/memory/memory-engine.ts`](file:///d:/Projects/Jana%20AI/src/memory/memory-engine.ts#L28-L172)
  * Types: [`src/memory/types.ts`](file:///d:/Projects/Jana%20AI/src/memory/types.ts#L1-L38)
  * UI Component: [`src/setup/ui.ts`](file:///d:/Projects/Jana%20AI/src/setup/ui.ts#L1300-L1530)

---

## Page 5: Tasks & Reminders Management (`/tasks`)

### 1. Page Name & Purpose
* **Page Name:** Tasks & Reminder Engine
* **Purpose:** Monitor scheduled reminders, active lease states, follow-up escalation counts, and full lifecycle execution history.
* **Primary User:** User tracking their to-do pipeline and developer verifying cron worker reliability.
* **Navigation Location:** Primary sidebar item `/tasks`.

### 2. Page Hierarchy & Layout
* **Header:** Title "Tasks & Reminders", subtitle "Proactive follow-up pipeline. Reminders escalate automatically until completed or acknowledged.", Action "New Task".
* **Section 1: Escalation State Pipeline (Kanban / Step Swimlanes):**
  1. *Scheduled:* Future reminders waiting for their due timestamp.
  2. *Sending / Claimed:* Active worker leases under execution.
  3. *Awaiting Acknowledgment:* Sent reminders currently waiting for user response; shows next follow-up timer (10m -> 30m -> 60m).
  4. *Acknowledged / Completed:* Tasks marked done via Telegram button or `/done`.
  5. *Paused:* Reminders that exhausted all 8 follow-ups without response.
* **Section 2: Task Master Table:**
  * Search and filters (`Status: All / Open / Completed / Overdue`).
  * Columns: Task Title, Deadline, Scheduled Reminder, Follow-ups (`x / 8`), Timezone, Status Badge, Actions.
  * Inline Action Buttons: `✅ Complete`, `💤 Snooze 10m`, `📅 Reschedule`, `🗑️ Cancel`.
* **Section 3: Reminder Events Audit Trail:**
  * Collapsible stream showing timestamped delivery events, worker lease claims, callback acknowledgments, and failure retries.

### 3. Displayed Fields & Exact Labels
* `Task Title`: Text string (e.g. "Submit quarterly GST return")
* `Deadline`: Formatted local time (e.g. "Oct 31, 2026, 05:00 PM IST")
* `Scheduled Reminder`: Formatted local time with offset ("15 mins before")
* `Follow-up Count`: e.g. "2 of 8 sent"
* `Reminder Status`: `scheduled` | `sending` | `awaiting_ack` | `acknowledged` | `rescheduled` | `cancelled` | `paused` | `failed`
* `Priority`: `low` | `normal` | `high` | `urgent`
* `Worker Lease`: "Leased until 10:01:00 UTC (Token: 8f4a...)"

### 4. Data Sources & Backend Endpoints
* **Database Tables:** `public.tasks`, `public.reminders`, `public.reminder_events`, `public.app_users`.
* **Existing Functions:**
  * `db.listTasks(userId, filter, timezone)`
  * `db.completeTask(userId, taskId)`
  * `db.snoozeReminder(reminderId, userId, newScheduledAt)`
  * `db.rescheduleTaskAndReminder(...)`
* **API Endpoints:**
  * *Required New:* `GET /api/tasks` (Lists tasks with joined active reminder and follow-up counts).
  * *Required New:* `POST /api/tasks/:id/complete` (Triggers task completion).
  * *Required New:* `POST /api/reminders/:id/snooze` (Snoozes reminder by specified minutes).
  * *Required New:* `GET /api/reminders/events` (Returns audit trail for reminder lifecycle).

### 5. Implementation Status & Source Files
* **Implementation Status:** **Partially Implemented** (The complete database models, lifecycle state machine, worker, and Telegram interaction buttons are fully functional and tested; REST endpoints for web dashboard viewing need implementation).
* **Source Files:**
  * Worker: [`src/reminders/worker.ts`](file:///d:/Projects/Jana%20AI/src/reminders/worker.ts#L36-L168)
  * Policy: [`src/reminders/policy.ts`](file:///d:/Projects/Jana%20AI/src/reminders/policy.ts#L9-L45)
  * Schema: [`supabase/migrations/20261025000001_initial_schema.sql`](file:///d:/Projects/Jana%20AI/supabase/migrations/20261025000001_initial_schema.sql#L20-L73)

---

## Page 6: Telegram Bot Management (`/telegram`)

### 1. Page Name & Purpose
* **Page Name:** Telegram Bot & Webhook Management
* **Purpose:** Inspect bot identity, check webhook delivery health, verify SSL/secret token validation, review update deduplication, and execute recovery actions.
* **Primary User:** Developer/Operator monitoring the Telegram Bot API integration.
* **Navigation Location:** Operations section `/telegram`.

### 2. Page Hierarchy & Layout
* **Header:** Title "Telegram Bot Management", Bot Username badge (`@JanaAIBot`), status badge (`Webhook Active`), button "Re-register Webhook".
* **Section 1: Bot Health & Identity Cards:**
  * Bot ID, Username, Display Name, Can Join Groups (`false`), Supports Inline (`false`).
  * Live status from `api.telegram.org/bot<token>/getMe`.
* **Section 2: Webhook Diagnostics Panel:**
  * Webhook URL: `https://<ref>.supabase.co/functions/v1/telegram-webhook`
  * Secret Token: `Configured (Matches X-Telegram-Bot-Api-Secret-Token)`
  * Pending Update Count: Numerical badge (`0` is healthy)
  * Last Error Date: "None" or timestamp of last Telegram delivery error
  * Last Error Message: Sanitized error description from Telegram API
  * Allowed Updates: `["message", "callback_query"]`
* **Section 3: Recent Ingestion Stream (Deduplication Table):**
  * Table backed by `public.telegram_updates`.
  * Columns: Update ID, Telegram User ID, Received At, Processed At, Status (`processed` / `ignored` / `failed`), Error Message.
* **Section 4: Control Actions:**
  * "Test Ping": Sends a lightweight test confirmation to the operator's chat.
  * "Re-register Webhook": Re-runs `setWebhook` with current secret token.
  * "Drop Pending Updates": Calls `deleteWebhook?drop_pending_updates=true` in case of update storm.

### 3. Data Sources & Backend Endpoints
* **Database Tables:** `public.telegram_updates`.
* **External APIs:** `https://api.telegram.org/bot<token>/getMe`, `https://api.telegram.org/bot<token>/getWebhookInfo`, `setWebhook`.
* **Existing Functions:**
  * `validator.validateTelegramToken(botToken)` in [`src/setup/validator.ts`](file:///d:/Projects/Jana%20AI/src/setup/validator.ts#L84-L119)
  * `deployer.registerWebhook(...)` in [`src/setup/deployer.ts`](file:///d:/Projects/Jana%20AI/src/setup/deployer.ts#L430-L470)
* **API Endpoints:**
  * *Required New:* `GET /api/telegram/webhook-info` (Calls `getWebhookInfo` and returns live metrics).
  * *Required New:* `POST /api/telegram/re-register` (Re-registers webhook URL).

### 4. Implementation Status & Source Files
* **Implementation Status:** **Implemented & Verified** (Token validation, webhook registration, and database deduplication working live).
* **Source Files:**
  * Client: [`src/bot/telegram-client.ts`](file:///d:/Projects/Jana%20AI/src/bot/telegram-client.ts#L14-L108)
  * Webhook: [`src/bot/webhook.ts`](file:///d:/Projects/Jana%20AI/src/bot/webhook.ts#L74-L165)

---

## Page 7: System Health, Logs & Diagnostics (`/diagnostics`)

### 1. Page Name & Purpose
* **Page Name:** System Health & Diagnostics
* **Purpose:** Inspect end-to-end system reliability, view sanitized execution logs, review worker batch metrics, and export troubleshooting reports with all credentials redacted.
* **Primary User:** Developer troubleshooting failures.
* **Navigation Location:** Operations section `/diagnostics`.

### 2. Page Hierarchy & Layout
* **Header:** Title "System Health & Diagnostics", overall status badge (`Operational`), action "Run Self-Check", action "Download Diagnostic Report".
* **Section 1: Automated Health Check Matrix:**
  * Card 1: *PostgreSQL Database* (Checks table access and RLS).
  * Card 2: *Edge Function (telegram-webhook)* (Checks HTTP 200 on OPTIONS/POST).
  * Card 3: *Edge Function (process-reminders)* (Verifies worker secret authentication).
  * Card 4: *pg_cron Job Scheduler* (Verifies job `jana-ai-process-reminders` is scheduled).
  * Card 5: *AI Provider Connectivity* (Validates primary fallback provider).
* **Section 2: Sanitized Error Log Stream:**
  * Real-time console log viewer with auto-scroll toggle.
  * Level badges (`INFO`, `WARN`, `ERROR`).
  * Automatic redaction of API keys (`sk-...`), bot tokens, and Bearer tokens via `EncryptionService.redactString()`.
* **Section 3: Worker Batch Performance Metrics:**
  * Chart/Metric: Reminders claimed per batch, sent successfully, paused, or failed.
  * Average delivery latency.

### 3. Data Sources & Backend Endpoints
* **Database Tables:** `public.reminder_events`, `cron.job` (via SQL).
* **Existing Functions:**
  * `deployer.runSafeCommand(...)`
  * `deployer.verifyDeployment(...)` in [`src/setup/deployer.ts`](file:///d:/Projects/Jana%20AI/src/setup/deployer.ts#L475-L540)
  * `EncryptionService.redactString(...)` in [`src/security/encryption.ts`](file:///d:/Projects/Jana%20AI/src/security/encryption.ts#L54-L62)
* **API Endpoints:**
  * *Required New:* `GET /api/diagnostics/health` (Runs full test matrix and returns JSON).
  * *Required New:* `GET /api/diagnostics/export` (Generates downloadable redacted JSON diagnostic bundle).

---

## Page 8: Setup & Deployment Wizard (`/setup` - Operator Mode)

### 1. Page Name & Purpose
* **Page Name:** Setup & Deployment Wizard
* **Purpose:** Guiding the developer through first-time provisioning, prerequisite checks, Supabase database linking, secret injection, Edge function bundling, and webhook configuration.
* **Primary User:** Developer setting up a new OpenAssistant AI instance.
* **Navigation Location:** System section `/setup`.

### 2. Page Hierarchy & Layout
* **Header:** Title "OpenAssistant AI — Setup & Deployment Wizard", step tracker (`Step 1 of 4`).
* **Step 1: Local Tooling Prerequisites:**
  * Visual status checklist for `Node.js (>=20)`, `npm`, and `Supabase CLI`.
* **Step 2: Project Credentials & Keys:**
  * Inputs: Supabase Project Reference (20 chars), Supabase Access Token (optional), Telegram Bot Token, Google Gemini API Key.
  * Inline validation with real-time green checkmarks.
* **Step 3: Configuration Review:**
  * Review detected timezone (`Asia/Kolkata`), allowlist user IDs, encryption master key generation.
* **Step 4: Automated Deployment Console:**
  * 11-step progress stepper:
    1. Verify prerequisites -> 2. Validate API credentials -> 3. Update local config -> 4. Link Supabase project -> 5. Apply migrations -> 6. Set function secrets -> 7. Deploy webhook function -> 8. Deploy worker function -> 9. Configure pg_cron -> 10. Register Telegram webhook -> 11. Run health checks.
  * Live streaming terminal console with monospace font, color-coded output, and redacted secrets.
* **Success Banner:** Direct link to Telegram bot and button to enter dashboard cockpit.

### 3. Data Sources & Backend Endpoints
* **Existing Functions:**
  * `validator.checkPrerequisites()`
  * `validator.validateTelegramToken()`
  * `validator.validateGeminiApiKey()`
  * `validator.validateSupabaseProject()`
  * `deployer.executeDeployment(config)`
* **API Endpoints (All Implemented & Verified in `src/setup/server.ts`):**
  * `GET /api/prerequisites`
  * `POST /api/validate/telegram`
  * `POST /api/validate/gemini`
  * `POST /api/validate/supabase`
  * `POST /api/deploy`
  * `GET /api/status`

---

## Page 9: Settings, Profile & Security (`/settings`)

### 1. Page Name & Purpose
* **Page Name:** Settings & Security
* **Purpose:** Configure user locale/timezone, manage the Telegram user allowlist, inspect encryption master key status, configure external Supermemory integration, and execute GDPR-style data export or purge.
* **Primary User:** System operator and individual user.
* **Navigation Location:** System section `/settings`.

### 2. Page Hierarchy & Layout
* **Section 1: General Preferences:**
  * Display Name, Default Timezone (IANA dropdown with autocomplete, e.g. `Asia/Kolkata`, `America/New_York`, `UTC`), Max Follow-ups limit (`Default: 8`).
* **Section 2: Security & Encryption:**
  * Master Encryption Key status: `AES-256-GCM Active`.
  * Key Fingerprint: SHA-256 hash preview (`e3b0c442...`).
  * Private Allowlist Editor: Comma-separated Telegram User IDs (`ALLOWED_TELEGRAM_USERS`).
* **Section 3: External Integrations (Supermemory):**
  * Supermemory API Key input, "Test Connection" button, Auto-sync toggle.
* **Section 4: Data Agency & Danger Zone:**
  * "Export All Data" button (Downloads ZIP containing JSON of tasks, reminders, memories, and audit logs).
  * "Purge All Memories" button (Red confirmation dialog with text input: "Type DELETE to confirm").
  * "Reset Account" button.

### 3. Data Sources & Backend Endpoints
* **Database Tables:** `public.app_users`, `public.user_external_integrations`, `public.user_memories`.
* **API Endpoints:**
  * *Existing:* `POST /api/supermemory/test`
  * *Required New:* `GET /api/user/settings`
  * *Required New:* `PUT /api/user/settings`
  * *Required New:* `GET /api/user/export-data`
  * *Required New:* `POST /api/user/purge-data`
