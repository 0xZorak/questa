/**
 * Agent action idempotency via Supabase agent_actions table.
 *
 * Pattern:
 *   1. checkAndClaimAction() — insert a "pending" row before executing.
 *      Throws AppError(IDEMPOTENCY_CONFLICT) if a row for the same
 *      (agent, action_type, campaign_id, wallet) is already pending/confirmed.
 *   2. Run the action.
 *   3. confirmAction(id, txHash?) — mark the row confirmed.
 *   4. failAction(id, reason)    — mark the row failed.
 */
import { createClient } from "@supabase/supabase-js";
import { AppError } from "./errors";

// Server-side Supabase client (uses service role key when available)
function getSupabase() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? process.env.SUPABASE_URL  ?? "";
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key);
}

export type AgentActionStatus = "pending" | "confirmed" | "failed" | "skipped";

export interface AgentActionRow {
  id:           string;
  agent:        string;
  action_type:  string;
  campaign_id?: number;
  wallet?:      string;
  input?:       Record<string, unknown>;
  reasoning?:   string;
  decision?:    string;
  confidence?:  number;
  tx_hash?:     string;
  status:       AgentActionStatus;
  created_at:   string;
}

export interface ClaimActionInput {
  agent:       string;          // e.g. "verifier", "copilot", "concierge"
  action_type: string;          // e.g. "verify_submission", "distribute_rewards"
  campaign_id?: number;
  wallet?:      string;
  input?:       Record<string, unknown>;
}

/**
 * Insert a pending row before executing.
 * Returns the row id to use with confirmAction / failAction.
 * Throws AppError(IDEMPOTENCY_CONFLICT) if already in-flight or confirmed.
 */
export async function checkAndClaimAction(claim: ClaimActionInput): Promise<string> {
  const supabase = getSupabase();

  // Check for existing pending/confirmed rows
  let query = supabase
    .from("agent_actions")
    .select("id, status, created_at")
    .eq("agent", claim.agent)
    .eq("action_type", claim.action_type)
    .in("status", ["pending", "confirmed"]);

  if (claim.campaign_id !== undefined) query = query.eq("campaign_id", claim.campaign_id);
  if (claim.wallet)                    query = query.eq("wallet", claim.wallet);

  const { data: rows } = await query.order("created_at", { ascending: false }).limit(10);

  // A "confirmed" row always blocks (the action already succeeded). A "pending"
  // row only blocks while genuinely in-flight; if it's older than the stale
  // window it was a crashed/failed attempt that never released its lock, so we
  // reclaim it. Without this, one failed broadcast wedges the action forever.
  const STALE_MS = 90_000;
  const now = Date.now();
  const blocking = (rows ?? []).find(
    r => r.status === "confirmed" ||
      (r.status === "pending" && now - new Date(r.created_at as string).getTime() < STALE_MS),
  );

  if (blocking) {
    throw new AppError({
      code: "IDEMPOTENCY_CONFLICT",
      userMessage: "This action is already being processed.",
      retryable: false,
      context: { existingId: blocking.id, status: blocking.status },
    });
  }

  // Reclaim any stale pending rows so they stop matching future checks.
  const stale = (rows ?? []).filter(
    r => r.status === "pending" && now - new Date(r.created_at as string).getTime() >= STALE_MS,
  );
  for (const r of stale) {
    await supabase.from("agent_actions").update({ status: "failed", reasoning: "stale-reclaimed" }).eq("id", r.id);
  }

  // Insert pending row
  const { data, error } = await supabase
    .from("agent_actions")
    .insert({
      agent:       claim.agent,
      action_type: claim.action_type,
      campaign_id: claim.campaign_id ?? null,
      wallet:      claim.wallet      ?? null,
      input:       claim.input       ?? null,
      status:      "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new AppError({
      code: "LLM_CALL_FAILED",
      userMessage: "Could not log agent action.",
      retryable: false,
      cause: error,
    });
  }

  return data.id as string;
}

/**
 * Mark a previously-claimed action as confirmed (optionally recording tx_hash,
 * reasoning, decision, and confidence from the LLM output).
 */
export async function confirmAction(
  id: string,
  updates: {
    tx_hash?:   string;
    reasoning?: string;
    decision?:  string;
    confidence?: number;
  } = {},
): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("agent_actions")
    .update({ status: "confirmed", ...updates })
    .eq("id", id);
}

/**
 * Mark a previously-claimed action as failed.
 */
export async function failAction(id: string, reason: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("agent_actions")
    .update({ status: "failed", reasoning: reason })
    .eq("id", id);
}

/**
 * Mark a previously-claimed action as skipped (no-op, e.g. nothing to process).
 */
export async function skipAction(id: string, reason: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from("agent_actions")
    .update({ status: "skipped", reasoning: reason })
    .eq("id", id);
}

/**
 * List recent agent actions (for the /agents transparency page).
 */
export async function listAgentActions(opts: {
  campaignId?: number;
  agent?: string;
  limit?: number;
} = {}): Promise<AgentActionRow[]> {
  const supabase = getSupabase();
  let query = supabase
    .from("agent_actions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.campaignId !== undefined) query = query.eq("campaign_id", opts.campaignId);
  if (opts.agent)                    query = query.eq("agent", opts.agent);

  const { data, error } = await query;
  if (error || !data) return [];
  return data as AgentActionRow[];
}

/**
 * Get or create agent_config row for a campaign.
 */
export interface AgentConfig {
  campaign_id:        number;
  auto_verify:        boolean;
  auto_distribute:    boolean;
  quality_threshold:  number;
}

export async function getAgentConfig(campaignId: number): Promise<AgentConfig> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("agent_config")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (data) return data as AgentConfig;

  // Return sensible defaults — auto-distribute is on; maybeDistribute() still
  // gates it on the campaign being filled or past its end time.
  return {
    campaign_id:       campaignId,
    auto_verify:       true,
    auto_distribute:   true,
    quality_threshold: 60,
  };
}

export async function upsertAgentConfig(config: Partial<AgentConfig> & { campaign_id: number }): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("agent_config").upsert(config);
}
