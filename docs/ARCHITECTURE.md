# OpenAssistant AI — Architecture & Design

## 1. Overview

OpenAssistant AI is an open-source, Telegram-first personal productivity assistant designed for **dependable follow-through**.

```text
[ Telegram User ]
       │
       ▼
[ Telegram Bot API ]
       │  (Webhook with Secret Token)
       ▼
[ Supabase Edge Function: telegram-webhook ]
       │
       ├──► [ Gemini Provider ] (Strict Intent Extraction & Zod Schema Validation)
       │
       ▼
[ Supabase Postgres ]
  ├── app_users
  ├── tasks
  ├── reminders
  ├── telegram_updates (Deduplication)
  └── reminder_events (Audit Log)
       ▲
       │  (Atomic claim: FOR UPDATE SKIP LOCKED)
[ Supabase Edge Function: process-reminders ]
       ▲
       │  (Every minute)
[ Supabase Cron (pg_cron + pg_net) ]
```

---

## 2. Core Components

### 2.1 Telegram Webhook & Ingestion Layer
- **Secret Verification:** Verifies the `X-Telegram-Bot-Api-Secret-Token` header on all inbound webhook calls.
- **Update Deduplication:** Inserts `update_id` into `telegram_updates`. If a duplicate `update_id` arrives (e.g. via Telegram retry), processing terminates immediately with HTTP 200 to prevent duplicate actions.
- **Access Control:** Evaluates sender against `UserAllowlist`. Unauthorized users are safely notified without executing commands or mutating state.

### 2.2 Intent Interpretation (Google Gemini)
- **Zero-Trust Model:** Gemini is strictly an intent interpreter, never an execution layer.
- **Schema Validation:** Model output is coerced to JSON and validated using strict Zod schemas (`AssistantIntentSchema`).
- **Resilience:** If the model returns malformed JSON, hallucinates unsupported fields, or fails, the system safely falls back to `ask_clarification`.

### 2.3 Reminder State Machine
Reminders undergo deterministic state transitions:

```text
scheduled
   └── Worker claims (with lease token) ──► sending
          ├── Telegram send success ──► awaiting_ack
          │                                  ├── User clicks "Done" ──► acknowledged (Task completed)
          │                                  ├── User clicks "Snooze" ──► scheduled (at snooze time)
          │                                  ├── User reschedules ──► scheduled (at new deadline)
          │                                  ├── Task cancelled ──► cancelled
          │                                  └── 8 follow-ups reached ──► paused (Final notice sent)
          └── Telegram send failure ──► scheduled (retry backoff in 2 minutes)
```

### 2.4 Worker Concurrency & Lease Recovery
- Reminders due for delivery are claimed in batches using `claim_due_reminders` with `FOR UPDATE SKIP LOCKED`.
- A lease token and expiration timestamp (`lease_until`) are attached to claimed rows.
- If a worker crashes or times out while sending, subsequent worker invocations recover the expired lease automatically.
- State updates check `lease_token = workerToken` to prevent stale workers from overwriting newer updates.

---

## 3. Database Entities & Security

- **Row Level Security (RLS):** Enabled on all tables.
- **Timestamps:** Canonical storage in UTC `timestamptz`. Interpretation and rendering use the user's configured IANA timezone (default `Asia/Kolkata`).
- **Data Isolation:** User identity is mapped from `telegram_user_id` to an internal `app_users.id` UUID. All queries enforce ownership checks.
