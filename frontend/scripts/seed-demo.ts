/**
 * Demo seed script — scripts/seed-demo.ts
 *
 * Creates a realistic demo dataset in Supabase so the Verifier Agent has
 * something dramatic to process live:
 *
 *   Campaign 1  "Questa Launch Buzz"   — auto_distribute ON, 1 INJ pool
 *   Campaign 2  "Injective DeFi Month" — auto_distribute OFF, 2 INJ pool
 *
 *   Submission A  inj1alice  — legitimate post ✅
 *   Submission B  inj1bob    — legitimate post ✅
 *   Submission C  inj1carol  — legitimate post ✅
 *   Submission D  inj1spam   — spam / low effort  ❌
 *   Submission E  inj1sybil  — duplicate content (same text as A) ❌ sybil
 *
 * Usage (from the frontend/ directory):
 *   npx tsx scripts/seed-demo.ts
 *
 * The script:
 *   1. Loads .env.local automatically.
 *   2. Upserts rows into campaign_metadata, agent_config, and submissions.
 *      Nothing is inserted into the live Injective chain — campaign IDs 1 & 2
 *      are assumed to exist on-chain from a prior deploy run.
 *      (If you need to create on-chain campaigns first, set MNEMONIC and run
 *       deploy.ts — but it's not required for the AI-agent demo flow.)
 *   3. Prints a summary of what was seeded.
 *
 * Security: reads SUPABASE_SERVICE_ROLE_KEY for admin writes; falls back to
 * NEXT_PUBLIC_SUPABASE_ANON_KEY if the service role key is not set (RLS must
 * then allow the inserts — disable RLS on demo tables or grant anon inserts).
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(__dirname, "../.env.local"));
loadEnvFile(path.join(__dirname, "../.env"));

// ── Supabase client ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌  NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Seed data types (keep in sync with lib/supabase.ts) ──────────────────────

type CampaignMetaSeed = {
  campaign_id:       number;
  quest_type:        string;
  entry_criteria:    string;
  min_inj:           number | null;
  nft_contract:      string | null;
  min_followers:     number | null;
  target_tweet_url:  string | null;
  follow_handle:     string | null;
  required_hashtags: string | null;
  tag_accounts:      string | null;
};

type AgentConfigSeed = {
  campaign_id:      number;
  auto_verify:      boolean;
  auto_distribute:  boolean;
  quality_threshold: number;
};

type SubmissionSeed = {
  campaign_id:    number;
  wallet_address: string;
  post_url:       string;
  post_text:      string;
  tx_hash:        string;
  verified:       boolean;
  submitted_at:   string;
};

// ── Demo data ─────────────────────────────────────────────────────────────────

const CAMPAIGN_1_ID = 1;
const CAMPAIGN_2_ID = 2;

/** The agent wallet address — used as operator so it can auto-distribute. */
const AGENT_ADDRESS = process.env.AGENT_WALLET_ADDRESS ?? "inj1agentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

const campaignsMeta: CampaignMetaSeed[] = [
  {
    campaign_id:       CAMPAIGN_1_ID,
    quest_type:        "post_original",
    entry_criteria:    "none",
    min_inj:           null,
    nft_contract:      null,
    min_followers:     null,
    target_tweet_url:  null,
    follow_handle:     null,
    required_hashtags: "Injective,Questa,Web3",
    tag_accounts:      null,
  },
  {
    campaign_id:       CAMPAIGN_2_ID,
    quest_type:        "like_repost",
    entry_criteria:    "min_inj",
    min_inj:           0.5,
    nft_contract:      null,
    min_followers:     null,
    target_tweet_url:  "https://x.com/Injective/status/1234567890",
    follow_handle:     null,
    required_hashtags: "Injective,DeFi,Injective888",
    tag_accounts:      null,
  },
];

const agentConfigs: AgentConfigSeed[] = [
  {
    campaign_id:       CAMPAIGN_1_ID,
    auto_verify:       true,
    auto_distribute:   true,   // ← demo hook: agent will auto-distribute on approval
    quality_threshold: 55,
  },
  {
    campaign_id:       CAMPAIGN_2_ID,
    auto_verify:       true,
    auto_distribute:   false,
    quality_threshold: 60,
  },
];

// Fake but realistic-looking Injective bech32 addresses (32-byte padded)
const ALICE_WALLET  = "inj1alice0000000000000000000000000000000001";
const BOB_WALLET    = "inj1bob000000000000000000000000000000000002";
const CAROL_WALLET  = "inj1carol000000000000000000000000000000003";
const SPAM_WALLET   = "inj1spam0000000000000000000000000000000004";
const SYBIL_WALLET  = "inj1sybil000000000000000000000000000000005";

/** Legitimate post text — used by Alice AND the sybil wallet (Sybil copies Alice). */
const LEGIT_TEXT_A =
  "Excited to be using @Questa on @Injective! The quest system is incredible. " +
  "#Injective #Questa #Web3 — decentralized quests are the future 🚀";

const submissions: SubmissionSeed[] = [
  // ── Legitimate submissions ────────────────────────────────────────────────
  {
    campaign_id:    CAMPAIGN_1_ID,
    wallet_address: ALICE_WALLET,
    post_url:       "https://x.com/alice_inj/status/1800000000000000001",
    post_text:      LEGIT_TEXT_A,
    tx_hash:        "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2",
    verified:       false,
    submitted_at:   new Date(Date.now() - 25 * 60_000).toISOString(), // 25 min ago
  },
  {
    campaign_id:    CAMPAIGN_1_ID,
    wallet_address: BOB_WALLET,
    post_url:       "https://x.com/bob_defi/status/1800000000000000002",
    post_text:
      "Just joined the Questa quest on Injective testnet! " +
      "Cross-chain social quests are the killer use case for Web3. #Injective #Questa #Web3",
    tx_hash:        "B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3",
    verified:       false,
    submitted_at:   new Date(Date.now() - 18 * 60_000).toISOString(), // 18 min ago
  },
  {
    campaign_id:    CAMPAIGN_1_ID,
    wallet_address: CAROL_WALLET,
    post_url:       "https://x.com/carol_web3/status/1800000000000000003",
    post_text:
      "Thrilled to be part of the @Questa community quest! " +
      "Earning rewards for spreading the word about #Injective. #Questa #Web3 💎",
    tx_hash:        "C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
    verified:       false,
    submitted_at:   new Date(Date.now() - 12 * 60_000).toISOString(), // 12 min ago
  },
  // ── Spam submission ───────────────────────────────────────────────────────
  {
    campaign_id:    CAMPAIGN_1_ID,
    wallet_address: SPAM_WALLET,
    post_url:       "https://x.com/spammer99/status/1800000000000000004",
    post_text:      "gm gm gm. follow me. #Injective",   // low-effort, missing hashtags
    tx_hash:        "D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
    verified:       false,
    submitted_at:   new Date(Date.now() - 8 * 60_000).toISOString(),  // 8 min ago
  },
  // ── Sybil submission (duplicate content — same text as Alice) ─────────────
  {
    campaign_id:    CAMPAIGN_1_ID,
    wallet_address: SYBIL_WALLET,
    post_url:       "https://x.com/alice_inj/status/1800000000000000005",   // same handle → shared_twitter_handle flag
    post_text:      LEGIT_TEXT_A, // identical text → duplicate_content flag
    tx_hash:        "E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5F6",
    verified:       false,
    submitted_at:   new Date(Date.now() - 3 * 60_000).toISOString(),  // 3 min ago
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(label: string): void {
  console.log(`  ✅  ${label}`);
}

type DbError = { message?: string; code?: string };

let _needsMigration002 = false;

function fail(label: string, rawErr: unknown): void {
  const err = rawErr as DbError;
  const msg = err?.message ?? String(rawErr);
  console.error(`  ❌  ${label}: ${msg}`);
  // Detect the two known migration-002 issues
  if (
    msg.includes("row-level security") ||
    msg.includes("violates row-level security") ||
    msg.includes("post_text") ||
    msg.includes("schema cache")
  ) {
    _needsMigration002 = true;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🌱  RewardBoost Demo Seed Script\n");
  console.log(`    Supabase: ${SUPABASE_URL}`);
  console.log(`    Key type: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? "service role ✓" : "anon key"}`);
  console.log();

  // ── Campaign metadata ─────────────────────────────────────────────────────
  console.log("📋  Seeding campaign_metadata...");
  for (const meta of campaignsMeta) {
    const { error } = await supabase.from("campaign_metadata").upsert(meta);
    if (error) fail(`campaign ${meta.campaign_id}`, error);
    else ok(`Campaign ${meta.campaign_id} — ${meta.quest_type} (${meta.required_hashtags})`);
  }

  // ── Agent config ──────────────────────────────────────────────────────────
  console.log("\n🤖  Seeding agent_config...");
  for (const cfg of agentConfigs) {
    const { error } = await supabase.from("agent_config").upsert(cfg);
    if (error) fail(`agent_config ${cfg.campaign_id}`, error);
    else ok(
      `Campaign ${cfg.campaign_id} — auto_distribute=${cfg.auto_distribute}, threshold=${cfg.quality_threshold}`,
    );
  }

  // ── Submissions ───────────────────────────────────────────────────────────
  console.log("\n📨  Seeding submissions...");
  for (const sub of submissions) {
    const { error } = await supabase.from("submissions").upsert(sub, {
      onConflict: "campaign_id,wallet_address",
    });
    if (error) fail(`${sub.wallet_address.slice(0, 14)}…`, error);
    else {
      const tag =
        sub.wallet_address === SPAM_WALLET   ? "SPAM"   :
        sub.wallet_address === SYBIL_WALLET  ? "SYBIL"  : "LEGIT";
      ok(`${sub.wallet_address.slice(0, 14)}… — ${tag}`);
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  if (_needsMigration002) {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║         ⚠️  Migration 002 required before re-running             ║
╠══════════════════════════════════════════════════════════════════╣
║  Some inserts failed because:                                    ║
║    • agent_config / agent_actions have RLS blocking anon writes  ║
║    • submissions is missing the post_text column                 ║
║                                                                  ║
║  Fix: open the Supabase SQL Editor and run:                      ║
║    frontend/supabase/migrations/002_post_text_and_rls.sql        ║
║                                                                  ║
║  Then run:  npm run seed:demo                                    ║
╚══════════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    Demo seed complete! 🎉                        ║
╠══════════════════════════════════════════════════════════════════╣
║  Campaigns:    2  (IDs 1 and 2)                                  ║
║  Submissions:  5  (3 legit · 1 spam · 1 sybil duplicate)         ║
║  Agent config: auto_distribute=true on Campaign 1                 ║
╠══════════════════════════════════════════════════════════════════╣
║  Next steps for the live demo:                                   ║
║                                                                  ║
║  1. Open http://localhost:3000/campaigns/1                       ║
║  2. Click "Run Verifier Agent" (admin view)                      ║
║  3. Watch it reject spam + sybil, approve 3 legit submissions    ║
║  4. auto_distribute fires — check tx on Injective testnet scan   ║
║  5. Visit http://localhost:3000/agents for full reasoning log    ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

main().catch((err) => {
  console.error("\n💥 Seed script failed:", err);
  process.exit(1);
});
