# OpenAssistant AI — Information Architecture & User Flows

**Document:** `docs/dashboard-audit/01-information-architecture.md`  
**Author:** Senior Product Designer & UX Architect  
**Project:** OpenAssistant AI Setup & Operations Dashboard  
**Date:** October 2026  
**Status:** Architecture Blueprint

---

## 1. Global Navigation & Layout Architecture

The OpenAssistant AI dashboard employs a persistent, compact left-hand sidebar navigation combined with a lightweight top breadcrumb bar. This structure accommodates both the single-developer operator administering the backend and personal users inspecting their AI preferences and tasks.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] OpenAssistant AI  v0.1.0        [Breadcrumb: AI Hub / Providers]    [Status: Live] [User] │
├─────────────────────────┬──────────────────────────────────────────────────────────────┤
│ CORE                    │                                                              │
│  📊 Overview            │                                                              │
│  🔌 AI Providers        │                                                              │
│  🔀 Smart Routing       │                      PAGE CONTENT AREA                       │
│  🧠 Memory Explorer     │                                                              │
│  ⏰ Tasks & Reminders   │                                                              │
│                         │                                                              │
│ OPERATIONS              │                                                              │
│  🤖 Telegram Bot        │                                                              │
│  🩺 Health & Logs       │                                                              │
│                         │                                                              │
│ SYSTEM                  │                                                              │
│  🚀 Setup & Deployment  │                                                              │
│  ⚙️ Settings & Security │                                                              │
│                         │                                                              │
│ ─────────────────────── │                                                              │
│ [Docs] [GitHub] [Local] │                                                              │
└─────────────────────────┴──────────────────────────────────────────────────────────────┘
```

---

## 2. Information Architecture Tree

```
OpenAssistant AI Dashboard
├── 1.0 Overview (/ or /overview)
│   ├── 1.1 System Health Summary (Supabase, Telegram, AI Hub, Worker)
│   ├── 1.2 Active AI Configuration (Provider, Model, Routing Mode)
│   ├── 1.3 Reminder Pipeline Status (Scheduled, Awaiting Ack, Paused)
│   ├── 1.4 Memory Bank Snapshot (Total Nodes, Categories, Supermemory Sync)
│   └── 1.5 Quick Actions (Test Telegram, Connect Key, Trigger Worker)
│
├── 2.0 AI Provider Hub (/providers)
│   ├── 2.1 Provider Cards (Google Gemini, OpenAI, Anthropic, xAI, OpenRouter)
│   ├── 2.2 Credential Drawer / Modal (Input field, Base URL, Test Connection, Save)
│   ├── 2.3 Single-Use Token Session Generator (/connect-provider?token=...)
│   └── 2.4 Custom OpenAI-Compatible Endpoint Form
│
├── 3.0 Model Catalog & Smart Routing (/routing)
│   ├── 3.1 Global Routing Mode Selector (Quick Answer, Deep Reasoning, Coding, Budget, Best Available, Manual)
│   ├── 3.2 Task-Specific Keyword Rules (Coding rule, Urgent rule, Planning rule)
│   ├── 3.3 Searchable Model Catalog (Provider filter, Context window, Capabilities, Cost tier)
│   └── 3.4 Fallback Priority Chain Configuration
│
├── 4.0 Personal Memory Explorer (/memory)
│   ├── 4.1 Memory Graph Visualization (Interactive SVG/Canvas Node-Link diagram)
│   ├── 4.2 Tabular Memory Records List (Search, Category filters, Confidence, Source)
│   ├── 4.3 Memory Editor Dialog (Add, edit content, assign category, define key)
│   ├── 4.4 Relationship Linker (Source -> Target -> Relation Type)
│   └── 4.5 External Sync Settings (Supermemory connection & status)
│
├── 5.0 Tasks & Reminders (/tasks)
│   ├── 5.1 Active Reminder Escalation Pipeline (Scheduled, Sending, Awaiting Ack, Paused)
│   ├── 5.2 Task Master List (Open, Completed, Cancelled, Overdue)
│   ├── 5.3 Reminder Event Audit Log (Historical timeline of sent/acked/snoozed notifications)
│   └── 5.4 Manual Task Operations (Force complete, Snooze 10m/1h/1d, Reschedule)
│
├── 6.0 Telegram Bot Management (/telegram)
│   ├── 6.1 Bot Identity & Connection Health (getMe check, Bot ID, Username)
│   ├── 6.2 Webhook Diagnostics (URL, Pending updates, Last sync, SSL cert status)
│   ├── 6.3 Update Ingestion Stream (Recent update IDs, processed status, deduplication)
│   └── 6.4 Webhook Control Actions (Re-register webhook, Delete webhook, Send test ping)
│
├── 7.0 System Health & Logs (/diagnostics)
│   ├── 7.1 Real-Time Service Health Checkers (Database, Edge Functions, pg_cron, API APIs)
│   ├── 7.2 Worker Execution History (Batch claims, lease renewals, failure retry backoffs)
│   ├── 7.3 Redacted Error Log (Sanitized error traces with secrets masked)
│   └── 7.4 Diagnostic Report Export (Download sanitized JSON bundle)
│
├── 8.0 Setup & Deployment Wizard (/setup - Operator Only)
│   ├── 8.1 Step 1: Local Tooling & Prerequisites (Node, npm, Supabase CLI)
│   ├── 8.2 Step 2: Supabase Project Link & Access Token
│   ├── 8.3 Step 3: Database Migration Execution (Schema 1, 2, 3)
│   ├── 8.4 Step 4: Environment Secrets Configuration (AES-256 key, bot token, worker secret)
│   ├── 8.5 Step 5: Edge Function Deployment (telegram-webhook & process-reminders)
│   ├── 8.6 Step 6: pg_cron Reminder Scheduler Activation (* * * * *)
│   └── 8.7 Step 7: Telegram Webhook Registration & Live Ping
│
└── 9.0 Settings & Security (/settings)
    ├── 9.1 User Profile & Locale (Timezone IANA selector, Display name)
    ├── 9.2 Encryption Vault Status (AES-256-GCM master key SHA-256 fingerprint)
    ├── 9.3 Access Allowlist Management (Allowed Telegram User IDs)
    └── 9.4 Data Export & Privacy Controls (Purge memories, Reset preferences)
```

---

## 3. Core User Flows

### Flow 1: First-Time Setup & Deployment
```
[Start Setup] 
      │
      ▼
Check Local Tools (Node >= 20, npm, Supabase CLI)
      │ All installed
      ▼
Input Supabase Project Ref & Access Token
      │ Tested against api.supabase.com/v1/projects/:ref
      ▼
Input Telegram Bot Token & Default Gemini Key
      │ Validated via getMe & v1beta/models
      ▼
Execute Deployment Pipeline (Automated Steps 1-11 with Real-time Console Log)
      │
      ├─► Link Supabase project
      ├─► Push database migrations (0001, 0002, 0003)
      ├─► Set Edge Function secrets (SUPABASE_URL, SERVICE_ROLE, BOT_TOKEN, etc.)
      ├─► Deploy Deno edge functions (telegram-webhook, process-reminders)
      ├─► Schedule pg_cron worker (* * * * *)
      └─► Register Telegram webhook with secret token
      │
      ▼
Success Summary Card ──► [Launch Dashboard Cockpit]
```

### Flow 2: Connecting a Personal AI Provider Key Securely
```
[User on /providers or Telegram /connect]
      │
      ├── Path A: Direct Telegram In-Chat "Fill-in-the-Box"
      │     1. User types /connect openai
      │     2. Bot displays ForceReply with placeholder: "Paste OPENAI API key here..."
      │     3. User pastes key and hits Send
      │     4. Bot executes deleteMessage on user message (immediate removal from chat)
      │     5. Bot executes deleteMessage on prompt message
      │     6. Key encrypted with AES-256-GCM and stored in public.user_ai_credentials
      │     7. Bot sends blurred spoiler confirmation: 🔒 Connected OPENAI (Key: ||sk-...1234||)
      │
      └── Path B: Web Setup Card (/connect-provider?token=...)
            1. Bot sends single-use link with 15-minute expiration
            2. User clicks link on browser; opens minimal secure card
            3. User enters key in <input type="password"> (masked dots)
            4. User clicks "Connect & Test"
            5. Server verifies key with adapter (validateCredentials)
            6. Server encrypts with AES-256-GCM, stores in DB, marks token used
            7. Success screen displayed; session token invalidated
```

### Flow 3: Inspecting & Correcting Long-Term Memory
```
[User on /memory]
      │
      ├── Visual Mode: Interactive Graph
      │     1. User sees colored nodes (Purple=Preference, Blue=Project, Amber=Goal, Green=Fact)
      │     2. User clicks a node: detail panel opens on right showing full content & confidence
      │     3. User edits text or changes relationship link -> auto-persists to DB
      │
      └── Table Mode: Search & Filter
            1. User searches keyword (e.g. "Python")
            2. Real-time recall query hits local DB (and Supermemory if active)
            3. User clicks "Delete" -> Confirmation dialog pops up
            4. Upon confirm: deletes from user_memories, drops edges, deletes from Supermemory
```

---

## 4. Permission & Operational Scopes

| Scope | Environment | Authorized Actors | Allowed Pages | Sensitive Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Operator / Admin** | `localhost:3000` (Local CLI process) | Local developer / system owner | All pages (1.0 to 9.0) | Run CLI commands, push DB migrations, deploy edge functions, set server secrets, view raw logs. |
| **End User / Telegram Subscriber** | Remote Web App / Telegram Client | Authenticated Telegram user on allowlist | Personal views (1.0 Overview, 2.0 Providers, 3.0 Routing, 4.0 Memory, 5.0 Tasks) | Connect personal API keys, configure routing mode, view personal memory/tasks. No access to server secrets or deployment CLI. |
