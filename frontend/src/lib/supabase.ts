import { createClient } from "@supabase/supabase-js";

// ── Client ────────────────────────────────────────────────────────────────────
const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anon);

// ── Row types ─────────────────────────────────────────────────────────────────

export type ProfileRow = {
  wallet_address: string;
  display_name:   string | null;
  avatar_url:     string | null;   // base64 data URI or remote URL
  twitter:        string | null;
  discord:        string | null;
  telegram:       string | null;
  updated_at:     string;
};

export type SubmissionRow = {
  id:             number;
  campaign_id:    number;
  wallet_address: string;
  post_url:       string;
  post_text:      string | null;   // raw post text; used for near-duplicate sybil detection
  tx_hash:        string | null;
  verified:       boolean;
  submitted_at:   string;
};

/** SubmissionRow extended with agent verdict columns (added by 001_agent_tables migration) */
export type SubmissionWithVerdict = SubmissionRow & {
  agent_verdict:    string | null;
  agent_score:      number | null;
  agent_flags:      string[] | null;
  agent_reasoning:  string | null;
  agent_action_id:  string | null;
  creator_override: string | null;
};

// ── Profile helpers ───────────────────────────────────────────────────────────

/** Fetch a single profile. Returns null if not found. */
export async function getProfile(walletAddress: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) {
    console.warn("[supabase] getProfile error:", error.message);
    return null;
  }
  return data as ProfileRow | null;
}

/** Upsert (insert or update) a profile row. */
export async function upsertProfile(
  profile: Omit<ProfileRow, "updated_at">,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ ...profile, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Batch-fetch display names for a list of wallet addresses.
 * Returns a map: { [walletAddress]: displayName | null }
 */
export async function getDisplayNames(
  addresses: string[],
): Promise<Record<string, string | null>> {
  if (addresses.length === 0) return {};

  const { data, error } = await supabase
    .from("profiles")
    .select("wallet_address, display_name")
    .in("wallet_address", addresses);

  if (error || !data) return {};

  return Object.fromEntries(
    (data as { wallet_address: string; display_name: string | null }[]).map(
      r => [r.wallet_address, r.display_name],
    ),
  );
}

// ── Submission helpers ────────────────────────────────────────────────────────

/**
 * Record a verified submission after a successful SubmitContent on-chain tx.
 * Uses upsert so re-submission attempts are idempotent.
 */
export async function recordSubmission(submission: {
  campaign_id:    number;
  wallet_address: string;
  post_url:       string;
  tx_hash?:       string;
  verified?:      boolean;
}): Promise<void> {
  const { error } = await supabase
    .from("submissions")
    .upsert({
      campaign_id:    submission.campaign_id,
      wallet_address: submission.wallet_address,
      post_url:       submission.post_url,
      tx_hash:        submission.tx_hash ?? null,
      verified:       submission.verified ?? true,
    });

  if (error) {
    console.warn("[supabase] recordSubmission error:", error.message);
    // Non-fatal: on-chain state is the source of truth
  }
}

/**
 * Check whether a wallet has a submission for a given campaign.
 * Returns the row or null.
 */
export async function getSubmission(
  campaignId:    number,
  walletAddress: string,
): Promise<SubmissionRow | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("campaign_id",    campaignId)
    .eq("wallet_address", walletAddress)
    .maybeSingle();

  if (error) return null;
  return data as SubmissionRow | null;
}

/**
 * Fetch all submissions for a given wallet address (across all campaigns).
 * Used by the Joined tab to show which quests this wallet has participated in.
 */
export async function getWalletSubmissions(
  walletAddress: string,
): Promise<SubmissionRow[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("wallet_address", walletAddress)
    .order("submitted_at", { ascending: false });
  if (error || !data) return [];
  return data as SubmissionRow[];
}

/**
 * Fetch all submissions for a campaign (for creator's admin view).
 */
export async function getCampaignSubmissions(
  campaignId: number,
): Promise<SubmissionRow[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("submitted_at", { ascending: true });

  if (error || !data) return [];
  return data as SubmissionRow[];
}

// ── Campaign metadata ─────────────────────────────────────────────────────────

export type QuestType     = "post_original" | "like_repost" | "follow" | "quote_tweet";
export type EntryCriteria = "none" | "min_inj" | "nft_holder";

export type CampaignMetadataRow = {
  campaign_id:       number;
  quest_type:        QuestType;
  entry_criteria:    EntryCriteria;
  min_inj:           number | null;
  nft_contract:      string | null;
  min_followers:     number | null;
  target_tweet_url:  string | null;
  follow_handle:     string | null;
  required_hashtags: string | null;
  tag_accounts:      string | null;
  created_at:        string;
};

/** Upsert campaign metadata after a successful on-chain campaign creation. */
export async function saveCampaignMetadata(
  meta: Omit<CampaignMetadataRow, "created_at">,
): Promise<void> {
  const { error } = await supabase.from("campaign_metadata").upsert(meta);
  if (error) console.warn("[supabase] saveCampaignMetadata:", error.message);
}

/** Fetch metadata for a single campaign. Returns null if not found. */
export async function getCampaignMetadata(
  campaignId: number,
): Promise<CampaignMetadataRow | null> {
  const { data, error } = await supabase
    .from("campaign_metadata")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) return null;
  return data as CampaignMetadataRow | null;
}

/**
 * Batch-fetch metadata for multiple campaigns.
 * Returns a map { [campaignId]: CampaignMetadataRow }.
 */
export async function getCampaignMetadataBatch(
  campaignIds: number[],
): Promise<Record<number, CampaignMetadataRow>> {
  if (campaignIds.length === 0) return {};
  const { data, error } = await supabase
    .from("campaign_metadata")
    .select("*")
    .in("campaign_id", campaignIds);
  if (error || !data) return {};
  return Object.fromEntries(
    (data as CampaignMetadataRow[]).map(r => [r.campaign_id, r]),
  );
}
