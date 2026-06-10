-- ============================================================
-- RewardBoost — Supabase schema
-- Run this in Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One row per wallet (keyed by Injective bech32 address: inj1…)
CREATE TABLE IF NOT EXISTS profiles (
  wallet_address  TEXT PRIMARY KEY,
  display_name    TEXT,
  avatar_url      TEXT,          -- data URI (base64) or remote URL
  twitter         TEXT,
  discord         TEXT,
  telegram        TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Allow read/write for the anon key (wallet-authenticated app, no Supabase Auth)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (true);

-- ── submissions ───────────────────────────────────────────────────────────────
-- One row per (campaign_id, wallet_address). Created after SubmitContent tx.
CREATE TABLE IF NOT EXISTS submissions (
  id              BIGSERIAL PRIMARY KEY,
  campaign_id     BIGINT  NOT NULL,
  wallet_address  TEXT    NOT NULL,
  post_url        TEXT    NOT NULL,
  tx_hash         TEXT,
  verified        BOOLEAN NOT NULL DEFAULT true,   -- set true after Twitter API check
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, wallet_address)
);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "submissions_select" ON submissions FOR SELECT USING (true);
CREATE POLICY "submissions_insert" ON submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "submissions_update" ON submissions FOR UPDATE USING (true);

-- ── Optional: handy index for campaign-scoped queries ─────────────────────────
CREATE INDEX IF NOT EXISTS submissions_campaign_idx
  ON submissions (campaign_id);

-- ── campaign_metadata ─────────────────────────────────────────────────────────
-- Off-chain config per campaign: quest type, entry criteria, type-specific URLs.
-- campaign_id mirrors the on-chain uint64 ID from the CosmWasm contract.
CREATE TABLE IF NOT EXISTS campaign_metadata (
  campaign_id       BIGINT PRIMARY KEY,

  -- Quest type: what action participants must perform
  -- 'post_original' | 'like_repost' | 'follow' | 'quote_tweet'
  quest_type        TEXT NOT NULL DEFAULT 'post_original',

  -- Entry criteria: who is allowed to join
  -- 'none' | 'min_inj' | 'nft_holder' | 'min_followers'
  entry_criteria    TEXT NOT NULL DEFAULT 'none',
  min_inj           NUMERIC,        -- required INJ balance  (entry_criteria = min_inj)
  nft_contract      TEXT,           -- CW721 contract addr   (entry_criteria = nft_holder)
  min_followers     INTEGER,        -- Twitter follower gate (entry_criteria = min_followers)

  -- Type-specific config
  target_tweet_url  TEXT,           -- like_repost / quote_tweet
  follow_handle     TEXT,           -- follow
  required_hashtags TEXT,           -- comma-separated (post / quote)
  tag_accounts      TEXT,           -- comma-separated (post / quote)

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_metadata ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_metadata_select" ON campaign_metadata FOR SELECT USING (true);
CREATE POLICY "campaign_metadata_insert" ON campaign_metadata FOR INSERT WITH CHECK (true);
CREATE POLICY "campaign_metadata_update" ON campaign_metadata FOR UPDATE USING (true);
