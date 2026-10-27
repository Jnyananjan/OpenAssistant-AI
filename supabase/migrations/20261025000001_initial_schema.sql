-- 20261025000001_initial_schema.sql
-- Initial database schema for OpenAssistant AI

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- 1. App Users (Mapping Telegram ID to Internal Application User)
create table if not exists public.app_users (
    id uuid primary key default gen_random_uuid(),
    telegram_user_id bigint unique not null,
    telegram_chat_id bigint not null,
    display_name text,
    timezone text not null default 'Asia/Kolkata',
    settings jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 2. Tasks
create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    title text not null,
    notes text,
    due_at timestamptz null,
    priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
    status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
    source text not null default 'telegram',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Reminders
create table if not exists public.reminders (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    task_id uuid not null references public.tasks(id) on delete cascade,
    scheduled_at timestamptz not null,
    status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'awaiting_ack', 'acknowledged', 'rescheduled', 'cancelled', 'paused', 'failed')),
    follow_up_count integer not null default 0 check (follow_up_count >= 0),
    max_follow_ups integer not null default 8 check (max_follow_ups >= 0),
    last_sent_at timestamptz null,
    next_follow_up_at timestamptz null,
    acknowledged_at timestamptz null,
    lease_until timestamptz null,
    lease_token uuid null,
    last_error text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 4. Telegram Update Deduplication
create table if not exists public.telegram_updates (
    update_id bigint primary key,
    telegram_user_id bigint null,
    received_at timestamptz not null default now(),
    processed_at timestamptz null,
    status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
    error_message text null
);

-- 5. Reminder Events (Audit trail)
create table if not exists public.reminder_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    reminder_id uuid null references public.reminders(id) on delete set null,
    task_id uuid null references public.tasks(id) on delete set null,
    event_type text not null,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_tasks_user_status_due on public.tasks(user_id, status, due_at);
create index if not exists idx_reminders_user_status on public.reminders(user_id, status);
create index if not exists idx_reminders_task on public.reminders(task_id);
create index if not exists idx_reminders_scheduled on public.reminders(scheduled_at) where status = 'scheduled';
create index if not exists idx_reminders_follow_up on public.reminders(next_follow_up_at) where status = 'awaiting_ack';
create index if not exists idx_reminders_lease on public.reminders(lease_until) where status = 'sending';
create index if not exists idx_reminder_events_reminder_created on public.reminder_events(reminder_id, created_at);
create index if not exists idx_reminder_events_user_created on public.reminder_events(user_id, created_at);

-- Updated_at timestamp trigger function
create or replace function public.set_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Apply updated_at triggers
create or replace trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at_column();

create or replace trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at_column();

create or replace trigger trg_reminders_updated_at
before update on public.reminders
for each row execute function public.set_updated_at_column();

-- Atomic claim function for due reminders
create or replace function public.claim_due_reminders(
    p_batch_size integer,
    p_lease_seconds integer,
    p_worker_token uuid
)
returns table (
    reminder_id uuid,
    user_id uuid,
    task_id uuid,
    task_title text,
    task_due_at timestamptz,
    telegram_chat_id bigint,
    user_timezone text,
    scheduled_at timestamptz,
    status text,
    follow_up_count integer,
    max_follow_ups integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_lease_until timestamptz := now() + (p_lease_seconds || ' seconds')::interval;
begin
    return query
    with eligible as (
        select r.id
        from public.reminders r
        join public.tasks t on t.id = r.task_id
        join public.app_users u on u.id = r.user_id
        where u.is_active = true
          and t.status = 'open'
          and (
            -- New scheduled reminder ready to be sent
            (r.status = 'scheduled' and r.scheduled_at <= now() and (r.lease_until is null or r.lease_until < now()))
            or
            -- Follow-up reminder ready to be sent
            (r.status = 'awaiting_ack' and r.next_follow_up_at is not null and r.next_follow_up_at <= now() and (r.lease_until is null or r.lease_until < now()))
            or
            -- Recover expired lease on sending status
            (r.status = 'sending' and r.lease_until is not null and r.lease_until < now())
          )
        order by coalesce(r.next_follow_up_at, r.scheduled_at) asc
        limit p_batch_size
        for update of r skip locked
    ),
    claimed as (
        update public.reminders r
        set
            status = 'sending',
            lease_until = v_lease_until,
            lease_token = p_worker_token,
            updated_at = now()
        from eligible e
        where r.id = e.id
        returning r.id, r.user_id, r.task_id, r.scheduled_at, r.status, r.follow_up_count, r.max_follow_ups
    )
    select
        c.id as reminder_id,
        c.user_id,
        c.task_id,
        t.title as task_title,
        t.due_at as task_due_at,
        u.telegram_chat_id,
        u.timezone as user_timezone,
        c.scheduled_at,
        c.status,
        c.follow_up_count,
        c.max_follow_ups
    from claimed c
    join public.tasks t on t.id = c.task_id
    join public.app_users u on u.id = c.user_id;
end;
$$;

-- Enable Row Level Security (RLS)
alter table public.app_users enable row level security;
alter table public.tasks enable row level security;
alter table public.reminders enable row level security;
alter table public.telegram_updates enable row level security;
alter table public.reminder_events enable row level security;
