-- Meridian call guide: Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- One row per call.
create table if not exists public.calls (
  id                uuid primary key default gen_random_uuid(),
  prospect_name     text not null check (char_length(prospect_name) between 1 and 120),
  prospect_role     text check (char_length(prospect_role) <= 120),
  company           text not null check (char_length(company) between 1 and 160),
  company_kind      text,
  call_type         text not null default 'first' check (call_type in ('first', 'follow_up')),
  caller_name       text check (char_length(caller_name) <= 80),

  status            text not null default 'in_progress' check (status in ('in_progress', 'closed')),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  duration_seconds  integer check (duration_seconds >= 0),

  -- Furthest stage (1-8) the caller recorded anything at.
  stage_reached     smallint not null default 1 check (stage_reached between 1 and 8),

  -- Filled at close.
  outcome           text check (outcome in (
                      'next_step_agreed', 'agreed_to_receive_report', 'interested',
                      'follow_up', 'call_again', 'not_interested', 'do_not_call',
                      'wrong_person', 'moved_company')),
  next_step_channel text check (next_step_channel in ('WhatsApp', 'Email', 'Call', 'Meeting', 'Referral', 'None')),
  next_step_when    text check (char_length(next_step_when) <= 120),
  need_words        text check (char_length(need_words) <= 2000),  -- the prospect's words from stage 5
  summary           text check (char_length(summary) <= 200),      -- one line for the past-calls list
  ai_check          jsonb,                                         -- what the LLM said about the outcome
  transcript        text check (char_length(transcript) <= 200000) -- from an uploaded recording, if any
);

-- Added after first deploy; safe to re-run.
alter table public.calls add column if not exists transcript text check (char_length(transcript) <= 200000);

create index if not exists calls_started_at_idx on public.calls (started_at desc);
create index if not exists calls_outcome_idx on public.calls (outcome);

-- What happened at each stage: one tap and the prospect's words.
create table if not exists public.stage_results (
  id          uuid primary key default gen_random_uuid(),
  call_id     uuid not null references public.calls (id) on delete cascade,
  stage       smallint not null check (stage between 1 and 8),
  tap         text check (char_length(tap) <= 40),
  words       text check (char_length(words) <= 2000),
  updated_at  timestamptz not null default now(),
  unique (call_id, stage)
);

create index if not exists stage_results_call_idx on public.stage_results (call_id);

-- The backend talks to Supabase with the service-role key, which bypasses RLS.
-- RLS is on with no policies, so the anon key (if it ever leaks to a browser)
-- can read and write nothing.
alter table public.calls enable row level security;
alter table public.stage_results enable row level security;
