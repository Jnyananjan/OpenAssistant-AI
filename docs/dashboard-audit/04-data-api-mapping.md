# OpenAssistant AI — Data & API Contract Audit

**Document:** `docs/dashboard-audit/04-data-api-mapping.md`  
**Author:** Full-Stack Software Architect & Technical Product Analyst  
**Project:** OpenAssistant AI Backend & Dashboard API Contracts  
**Date:** October 2026  
**Status:** Implementation-Aware API Audit

---

## 1. Architectural Classification of Current Dashboard

Based on direct inspection of [`src/setup/server.ts`](file:///d:/Projects/Jana%20AI/src/setup/server.ts), [`src/setup/deployer.ts`](file:///d:/Projects/Jana%20AI/src/setup/deployer.ts), and [`package.json`](file:///d:/Projects/Jana%20AI/package.json):

* **Current Architecture:** **Strictly Local-Only Single-Operator Setup UI.**
  * Binds to `127.0.0.1:3000` (`http://localhost:3000`).
  * Relies on local Node.js `child_process.execFile` to invoke the `supabase` CLI and local git repo filesystem.
  * Employs an in-memory random `csrfToken` (`this.csrfToken = crypto.randomBytes(24).toString('hex')`) and an Origin header verification check.
  * Has **no user authentication sessions** (no JWT, no user logins).
  * Has a dedicated single-use session route `/connect-provider?token=...` allowing an authenticated Telegram user to submit an API key via a temporary 15-minute token.

* **Target Hybrid Architecture:**
  1. *Local Setup & CLI Server (Port 3000):* Used strictly for provisioning, local deployment, migration pushes, and Supabase linking.
  2. *Hosted Management Cockpit (Supabase Edge Function or Next.js App):* Connects directly to Supabase with Row Level Security (RLS) and authenticates users via Telegram Login Widget or Supabase Auth.

---

## 2. Existing Backend Routes & API Contracts Audit

The table below audits every HTTP endpoint implemented in [`src/setup/server.ts`](file:///d:/Projects/Jana%20AI/src/setup/server.ts) and Edge Functions.

| Endpoint Path | Method | Auth / Protection | Input Validation | Database / Service Source | Secrets Handling | Implementation Status |
| :--- | :---: | :--- | :--- | :--- | :--- | :--- |
| `GET /` or `/setup` | `GET` | Origin check (`isAllowedOrigin`) | None | In-memory HTML template | No secrets in HTML. CSRF token rendered in hidden field. | **Implemented & Verified** |
| `GET /connect-provider` | `GET` | Token in query param (`?token=...`) | Token lookup in `setup_sessions` | `public.setup_sessions` | Validates `token` not used and `expires_at > now()`. No secrets revealed. | **Implemented & Verified** |
| `GET /api/prerequisites` | `GET` | Origin check | None | System CLI (`node -v`, `npm -v`, `supabase -v`, `config.toml`) | No secrets accessed. | **Implemented & Verified** |
| `GET /api/providers/catalog` | `GET` | Origin check | None | Static code `DEFAULT_MODEL_CATALOG` | Static public catalog. | **Implemented & Verified** |
| `GET /api/memory/graph` | `GET` | Origin check | Optional `userId` query param | `user_memories`, `memory_relationships` | Returns node labels and relation types. | **Implemented & Verified** |
| `GET /api/memory` | `GET` | Origin check | Optional `userId` query param | `user_memories` (limit 50) | Returns memory text. | **Implemented & Verified** |
| `POST /api/connect-provider` | `POST` | `x-csrf-token` header check | Zod-equivalent check: `token`, `apiKey` | `setup_sessions`, `user_ai_credentials` | **Secure:** Validates against live provider, encrypts with AES-256-GCM, stores IV/tag, discards raw key. | **Implemented & Verified** |
| `POST /api/providers/validate` | `POST` | `x-csrf-token` header check | `provider`, `apiKey`, optional `baseUrl` | Live external AI API via adapter | Key tested in ephemeral memory and discarded. Not logged. | **Implemented & Verified** |
| `POST /api/supermemory/test` | `POST` | `x-csrf-token` header check | `apiKey` string | Supermemory API `v1/search` ping | Ephemeral key test; not persisted. | **Implemented & Verified** |
| `POST /api/memory` | `POST` | `x-csrf-token` header check | `content` (required), `category`, `key` | `user_memories` via `MemoryEngine` | Memory record created/updated. | **Implemented & Verified** |
| `POST /api/memory/delete` | `POST` | `x-csrf-token` header check | `id`, `userId` | `user_memories` via `MemoryEngine` | Memory deleted; cascades to relations. | **Implemented & Verified** |
| `POST /api/validate/telegram` | `POST` | `x-csrf-token` header check | `token` string | Telegram API `api.telegram.org/bot<token>/getMe` | Validates bot token format and connectivity. | **Implemented & Verified** |
| `POST /api/validate/gemini` | `POST` | `x-csrf-token` header check | `apiKey`, `model` | Google AI Studio REST API `generateContent` | Ephemeral test with `maxOutputTokens: 2`. | **Implemented & Verified** |
| `POST /api/validate/gemini-models`| `POST` | `x-csrf-token` header check | `apiKey` | Google AI Studio REST API `v1beta/models` | Lists models supported for this key. | **Implemented & Verified** |
| `POST /api/validate/supabase` | `POST` | `x-csrf-token` header check | `projectRef` (20-char regex), `accessToken` | `api.supabase.com/v1/projects/:ref` | Verifies ref format & Management API. | **Implemented & Verified** |
| `POST /api/deploy` | `POST` | `x-csrf-token` header check | `SetupConfig` parameters | Supabase CLI execution pipeline | **High Sensitivity:** Injects secrets into Supabase vault. Redacts secrets in logs. | **Implemented & Verified** |
| `GET /api/status` | `GET` | Origin check | None | In-memory `this.latestDeployment` | Redacted log lines and progress object. | **Implemented & Verified** |
| `/functions/v1/telegram-webhook` | `POST` | `X-Telegram-Bot-Api-Secret-Token` | Telegram update JSON schema | `telegram_updates`, `tasks`, `reminders`, `user_ai_credentials` | Verifies secret header matches `TELEGRAM_WEBHOOK_SECRET`. | **Implemented & Live** |
| `/functions/v1/process-reminders` | `POST` | `Authorization: Bearer <WORKER_SECRET>` | Optional batch JSON | `reminders`, `tasks`, `app_users`, `reminder_events` | Verifies bearer token matches `WORKER_SECRET`. | **Implemented & Live** |

---

## 3. UI-to-Backend Mapping Matrix

| UI Dashboard Feature | Target Route / Function | Invocation | Parameters Required | Database Table / Source | Existing Status | Missing Backend Work |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- |
| **System Health Matrix** | `/api/overview/summary` | `GET` | None | `app_users`, `reminders`, `telegram_updates` | Partial (Queries exist in repo) | Aggregated endpoint combining health checks into one payload. |
| **Provider Cards List** | `/api/user/credentials` | `GET` | `userId` | `user_ai_credentials` | Implemented in `db.getUserCredentials()` | REST endpoint wrapper to expose masked keys to dashboard. |
| **Connect Key Modal** | `/api/providers/validate` -> `/api/connect-provider` | `POST` | `provider`, `apiKey`, `baseUrl` | `user_ai_credentials` | **Implemented & Verified** | None for direct connection. |
| **Disconnect Provider** | `/api/user/credentials/:provider`| `DELETE` | `userId`, `provider` | `user_ai_credentials` | Implemented in `db.deleteUserCredential()` | REST route handler in setup server. |
| **Model Routing Selector** | `/api/user/routing` | `GET` / `PUT` | `routingMode`, `defaultModel`, `taskRules` | `user_model_preferences` | Implemented in `db.saveUserModelPreferences()` | REST route handler in setup server. |
| **Searchable Model Catalog**| `/api/providers/catalog` | `GET` | None | Static Catalog | **Implemented & Verified** | None. |
| **Memory Graph Viewer** | `/api/memory/graph` | `GET` | `userId` | `user_memories`, `memory_relationships` | **Implemented & Verified** | None. |
| **Memory Records Table** | `/api/memory` | `GET` | `userId`, `category`, `query` | `user_memories` | **Implemented & Verified** | Add pagination / search query param support. |
| **Delete Memory Node** | `/api/memory/delete` | `POST` | `id`, `userId` | `user_memories` | **Implemented & Verified** | None. |
| **Tasks & Reminders List**| `/api/tasks` | `GET` | `userId`, `filter` (`open`/`completed`) | `tasks` left-joined with `reminders` | Implemented in `db.listTasks()` | REST route handler in setup server. |
| **Mark Task Done** | `/api/tasks/:id/complete` | `POST` | `taskId`, `userId` | `tasks`, `reminders` | Implemented in `db.completeTask()` | REST route handler in setup server. |
| **Snooze Reminder** | `/api/reminders/:id/snooze`| `POST` | `reminderId`, `minutes` | `reminders` | Implemented in `db.snoozeReminder()` | REST route handler in setup server. |
| **Telegram Webhook Info** | `/api/telegram/webhook-info`| `GET` | None | Telegram API `getWebhookInfo` | Implemented in setup CLI | Expose live metrics endpoint for dashboard. |
| **Diagnostic Log Export** | `/api/diagnostics/export` | `GET` | None | `reminder_events`, setup deployment log | Implemented redaction service | Bundle JSON builder with redaction filter. |
| **Execute Deployment** | `/api/deploy` | `POST` | `SetupConfig` JSON | Supabase CLI execution pipeline | **Implemented & Verified** | None. |

---

## 4. Proposed New Endpoints (Detailed Contracts)

The following endpoints must be added to the server/dashboard layer to transition from a setup-only UI to a full operations cockpit:

### 4.1 `GET /api/overview/summary`
* **Purpose:** Single lightweight poll for the Overview page ticker.
* **Response Shape (JSON):**
  ```json
  {
    "database": {
      "status": "connected",
      "latencyMs": 14,
      "migrationsApplied": 3,
      "totalMigrations": 3
    },
    "telegram": {
      "botUsername": "JanaAIBot",
      "webhookActive": true,
      "pendingUpdates": 0,
      "lastErrorDate": null
    },
    "aiHub": {
      "connectedCount": 2,
      "activeProvider": "gemini",
      "activeModel": "gemini-3.8-flash",
      "routingMode": "best_available"
    },
    "reminders": {
      "scheduled": 4,
      "awaitingAck": 1,
      "paused": 0,
      "totalTasks": 12,
      "lastWorkerRunAt": "2026-10-25T17:45:00.000Z"
    },
    "memory": {
      "totalCount": 18,
      "categories": {
        "preference": 4,
        "project": 6,
        "fact": 5,
        "goal": 2,
        "relationship": 1
      },
      "supermemorySync": false
    }
  }
  ```

### 4.2 `GET /api/tasks` & `POST /api/tasks/:id/complete`
* **Purpose:** Displaying task list and acknowledging completions from web dashboard.
* **Request:** `GET /api/tasks?filter=all&userId=<uuid>`
* **Response Shape (JSON):**
  ```json
  {
    "tasks": [
      {
        "id": "7b8e1f52-...",
        "title": "Submit GST tax returns",
        "dueAt": "2026-10-31T17:00:00Z",
        "priority": "urgent",
        "status": "open",
        "activeReminder": {
          "id": "a1c2...",
          "scheduledAt": "2026-10-31T16:45:00Z",
          "status": "scheduled",
          "followUpCount": 0,
          "maxFollowUps": 8,
          "nextFollowUpAt": null
        }
      }
    ]
  }
  ```

### 4.3 `GET /api/user/routing-preferences` & `PUT /api/user/routing-preferences`
* **Purpose:** Reading and updating model preferences.
* **Payload (PUT):**
  ```json
  {
    "routingMode": "deep_reasoning",
    "defaultProvider": "anthropic",
    "defaultModel": "claude-3-5-sonnet-latest",
    "taskRules": {
      "coding": { "provider": "anthropic", "model": "claude-3-5-sonnet-latest" },
      "urgent": { "provider": "gemini", "model": "gemini-3.8-flash" }
    }
  }
  ```

---

## 5. Security & Secret Leak Prevention Checklist

1. **Client-Facing Masking:** Under no circumstances should `encrypted_key`, `iv`, or `auth_tag` from `public.user_ai_credentials` be serialized in JSON responses to the browser. Endpoints must only return `provider`, `maskedKey` (`sk-...1234`), `baseUrl`, and `isActive`.
2. **Server Secret Segregation:** Server master keys (`ENCRYPTION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `WORKER_SECRET`) must only exist in server-side environment variables and Supabase Vault.
3. **Origin & CSRF Defense:** Every state-modifying POST/PUT/DELETE request requires `X-CSRF-Token` header validation matching the server session token.
4. **Log Redaction:** All diagnostic streams and error outputs must pass through `EncryptionService.redactString()` before writing to disk or sending over HTTP.
