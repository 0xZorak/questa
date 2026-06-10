-- Migration 002: post_text column + RLS policies for demo seed script
-- Run this in the Supabase SQL editor after 001_agent_tables.sql

-- ── Add post_text to submissions ──────────────────────────────────────────────
-- Stores the raw text of the submitted post so the Verifier Agent can run
-- near-duplicate content hashing for sybil detection without hitting Twitter API.

alter table submissions
  add column if not exists post_text text;

-- ── RLS policies ──────────────────────────────────────────────────────────────
-- Supabase enables RLS on all new tables by default, blocking anon key writes.
-- These policies allow the demo seed script and server API routes to write using
-- the anon key. In production you would tighten these to authenticated users only.

-- agent_config: writable by anyone (internal agent config, not user PII)
alter table agent_config enable row level security;

create policy "agent_config_select_all"
  on agent_config for select using (true);

create policy "agent_config_insert_all"
  on agent_config for insert with check (true);

create policy "agent_config_update_all"
  on agent_config for update using (true) with check (true);

-- agent_actions: readable by anyone; writable by anyone (server routes use service role key)
alter table agent_actions enable row level security;

create policy "agent_actions_select_all"
  on agent_actions for select using (true);

create policy "agent_actions_insert_all"
  on agent_actions for insert with check (true);

create policy "agent_actions_update_all"
  on agent_actions for update using (true) with check (true);
