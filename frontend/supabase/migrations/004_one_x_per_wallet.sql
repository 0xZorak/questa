-- Migration 005: enforce one X (twitter) account per wallet at the DB level.
-- Run in the Supabase SQL editor after 003_email_subscribers.sql.
--
-- The OAuth callback also checks this, but a partial unique index makes it
-- race-proof: two wallets can never end up linked to the same handle.

-- De-duplicate first (keep the most recently updated row per handle), otherwise
-- the unique index creation fails.
delete from profiles a
using profiles b
where a.twitter is not null
  and a.twitter = b.twitter
  and a.wallet_address <> b.wallet_address
  and a.updated_at < b.updated_at;

create unique index if not exists profiles_twitter_unique
  on profiles (twitter)
  where twitter is not null;
