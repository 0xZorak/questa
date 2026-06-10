-- Agent infrastructure tables
-- Run this migration in the Supabase SQL editor or via supabase db push

-- ── agent_actions ─────────────────────────────────────────────────────────────
-- Every action an agent takes (verification, distribution, recommendation)
-- is logged here before execution (status=pending) and updated after.

create table if not exists agent_actions (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,           -- "verifier" | "copilot" | "concierge"
  action_type   text not null,           -- e.g. "verify_submission", "distribute_rewards"
  campaign_id   bigint,
  wallet        text,                    -- submission wallet being acted on
  input         jsonb,                   -- raw input to the agent
  reasoning     text,                    -- agent's full reasoning text
  decision      text,                    -- "approve" | "reject" | "flag" | "distribute" etc.
  confidence    numeric(5, 2),           -- 0–100
  tx_hash       text,                    -- on-chain tx if agent executed something
  status        text not null default 'pending'
                  check (status in ('pending','confirmed','failed','skipped')),
  created_at    timestamptz not null default now()
);

create index if not exists agent_actions_campaign_idx on agent_actions (campaign_id);
create index if not exists agent_actions_wallet_idx   on agent_actions (wallet);
create index if not exists agent_actions_status_idx   on agent_actions (status);
create index if not exists agent_actions_created_idx  on agent_actions (created_at desc);

-- ── agent_config ──────────────────────────────────────────────────────────────
-- Per-campaign agent settings (auto-verify, auto-distribute, quality threshold).

create table if not exists agent_config (
  campaign_id        bigint primary key,
  auto_verify        boolean not null default true,
  auto_distribute    boolean not null default false,
  quality_threshold  numeric(5,2) not null default 60,
  updated_at         timestamptz not null default now()
);

-- ── Add agent_verdict columns to submissions ──────────────────────────────────
-- These columns let the UI show per-submission agent verdicts without joining.

alter table submissions
  add column if not exists agent_verdict    text,        -- "approve" | "reject" | "flag_for_human"
  add column if not exists agent_score      numeric(5,2),
  add column if not exists agent_flags      text[],
  add column if not exists agent_reasoning  text,
  add column if not exists agent_action_id  uuid references agent_actions(id),
  add column if not exists creator_override text;       -- "approved" | "rejected" (manual override)
