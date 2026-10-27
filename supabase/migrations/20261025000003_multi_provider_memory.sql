-- 20261025000003_multi_provider_memory.sql
-- Multi-Provider AI Credentials, Model Preferences, and Personal Graph Memory

-- 1. User AI Provider Credentials (AES-256-GCM Encrypted)
create table if not exists public.user_ai_credentials (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'xai', 'openrouter')),
    encrypted_key text not null,
    iv text not null,
    auth_tag text not null,
    masked_key text not null,
    base_url text null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, provider)
);

-- 2. User Model Routing Preferences
create table if not exists public.user_model_preferences (
    user_id uuid primary key references public.app_users(id) on delete cascade,
    default_provider text not null default 'gemini',
    default_model text not null default 'gemini-3.8-flash',
    routing_mode text not null default 'best_available' check (routing_mode in ('quick_answer', 'deep_reasoning', 'coding', 'budget', 'best_available', 'manual')),
    task_rules jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Persistent Personal Memory Records
create table if not exists public.user_memories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    category text not null check (category in ('preference', 'project', 'goal', 'relationship', 'fact')),
    content text not null,
    key text null,
    confidence real not null default 1.0,
    is_active boolean not null default true,
    source text not null default 'user',
    external_id text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 4. Memory Entity & Concept Relationships (Graph Edges)
create table if not exists public.memory_relationships (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    source_id uuid not null references public.user_memories(id) on delete cascade,
    target_id uuid not null references public.user_memories(id) on delete cascade,
    relation_type text not null default 'relates_to' check (relation_type in ('relates_to', 'depends_on', 'part_of', 'conflicts_with')),
    created_at timestamptz not null default now(),
    unique(source_id, target_id, relation_type)
);

-- 5. External Integrations (e.g. Supermemory)
create table if not exists public.user_external_integrations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    provider text not null check (provider in ('supermemory')),
    config jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, provider)
);

-- 6. Setup Sessions for Secure Web Key Entry
create table if not exists public.setup_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.app_users(id) on delete cascade,
    provider text not null,
    token text unique not null,
    expires_at timestamptz not null,
    used_at timestamptz null,
    created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_user_ai_credentials_user on public.user_ai_credentials(user_id);
create index if not exists idx_user_memories_user_cat on public.user_memories(user_id, category) where is_active = true;
create index if not exists idx_user_memories_key on public.user_memories(user_id, key) where is_active = true;
create index if not exists idx_memory_relationships_user on public.memory_relationships(user_id);
create index if not exists idx_setup_sessions_token on public.setup_sessions(token);

-- Triggers for updated_at
create or replace trigger trg_user_ai_credentials_updated_at
before update on public.user_ai_credentials
for each row execute function public.set_updated_at_column();

create or replace trigger trg_user_model_preferences_updated_at
before update on public.user_model_preferences
for each row execute function public.set_updated_at_column();

create or replace trigger trg_user_memories_updated_at
before update on public.user_memories
for each row execute function public.set_updated_at_column();

create or replace trigger trg_user_external_integrations_updated_at
before update on public.user_external_integrations
for each row execute function public.set_updated_at_column();

-- Enable RLS
alter table public.user_ai_credentials enable row level security;
alter table public.user_model_preferences enable row level security;
alter table public.user_memories enable row level security;
alter table public.memory_relationships enable row level security;
alter table public.user_external_integrations enable row level security;
alter table public.setup_sessions enable row level security;
