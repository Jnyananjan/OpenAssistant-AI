# OpenAssistant AI — Deployment & Setup Guide

This document provides step-by-step instructions for deploying OpenAssistant AI to a production Supabase project with Telegram and Google Gemini API.

---

## 1. Prerequisites

Before starting, ensure you have:
1. **Telegram Bot Token**: Created via [@BotFather](https://t.me/BotFather) on Telegram.
2. **Telegram Webhook Secret**: A secure, high-entropy random string (e.g. generated via `openssl rand -hex 24`).
3. **Google Gemini API Key**: From [Google AI Studio](https://aistudio.google.com/).
4. **Supabase Project**: An active project on [Supabase](https://supabase.com/).
5. **Supabase CLI**: Installed locally (`npm install -g supabase` or via package manager).

---

## 2. Apply Database Migrations

Apply the version-controlled SQL migration to your Supabase Postgres database.

### Option A: Using Supabase CLI (Recommended)
```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

### Option B: Using Supabase SQL Editor
Open your Supabase Project Dashboard -> **SQL Editor** -> **New Query**, paste the contents of:
[`supabase/migrations/20261025000001_initial_schema.sql`](../supabase/migrations/20261025000001_initial_schema.sql)
and click **Run**.

---

## 3. Set Edge Function Secrets

Configure environment secrets in your Supabase project using the Supabase CLI:

```bash
supabase secrets set \
  TELEGRAM_BOT_TOKEN="your_bot_token_from_botfather" \
  TELEGRAM_WEBHOOK_SECRET="your_custom_webhook_secret_token" \
  GEMINI_API_KEY="your_gemini_api_key" \
  GEMINI_MODEL="gemini-3.8-flash" \
  DEFAULT_TIMEZONE="Asia/Kolkata" \
  MAX_FOLLOW_UPS="8" \
  ALLOWED_TELEGRAM_USERS="123456789" \
  WORKER_SECRET="your_cron_invocation_secret"
```

*Note: `ALLOWED_TELEGRAM_USERS` can be a comma-separated list of numeric Telegram User IDs for the private deployment allowlist, or left empty to allow all users.*

---

## 4. Deploy Edge Functions

Deploy both Edge Functions without requiring public JWT verification (authentication is handled via Telegram secret token and worker secret headers):

```bash
supabase functions deploy telegram-webhook --no-verify-jwt
supabase functions deploy process-reminders --no-verify-jwt
```

---

## 5. Register Telegram Webhook

Configure Telegram to deliver chat updates to your deployed `telegram-webhook` endpoint:

```bash
curl -F "url=https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
     -F "secret_token=<YOUR_TELEGRAM_WEBHOOK_SECRET>" \
     "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook"
```

Verify webhook registration status:
```bash
curl "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

---

## 6. Configure Supabase Cron for Reminder Processing

To automatically process and deliver reminders, configure Supabase `pg_cron` and `pg_net` to call `process-reminders` every minute.

Run this SQL query in your Supabase **SQL Editor**:

```sql
-- 1. Enable required extensions
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- 2. Schedule the reminder worker to run every minute
select cron.schedule(
  'open-assistant-reminders',
  '* * * * *',
  $$
  select
    net.http_post(
      url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/process-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <YOUR_WORKER_SECRET>'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

To monitor scheduled jobs:
```sql
select * from cron.job_run_details order by start_time desc limit 10;
```

---

## 7. Operational Testing & Verification

1. **Verify Bot Connection**:
   - Send `/start` in Telegram.
   - You should receive the OpenAssistant AI welcome message with command instructions.
2. **Verify Task & Reminder Creation**:
   - Send: `"Finish presentation tomorrow at 5 PM. Remind me 10 minutes before."`
   - Verify the bot confirms the task with the exact local deadline and reminder time.
3. **Verify Follow-up Delivery**:
   - Create a test reminder scheduled 1 minute ahead.
   - Ensure the notification arrives with `Done`, `Snooze 10m`, and `Reschedule` inline buttons.
   - Click `Done` and verify that follow-ups cease and the task is marked completed in `/tasks`.
