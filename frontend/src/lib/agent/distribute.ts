/**
 * Centralized reward distribution gate.
 *
 * Rewards distribute automatically once a campaign is DONE — either its
 * participant cap is filled OR its end time has passed. This is the single
 * source of truth: both the Verifier (after scoring) and on-view triggers call
 * it. It is idempotent (the contract itself rejects a second distribute, and we
 * also claim an idempotency slot).
 *
 * SECURITY: imports the agent wallet — server-side only.
 */
import { queryContract, buildExecuteMsg } from "@/lib/injective";
import { agentBroadcast, getAgentAddress } from "@/lib/agent/wallet";
import { checkAndClaimAction, confirmAction, failAction } from "@/lib/idempotency";
import { isAppError } from "@/lib/errors";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("agent/distribute");

type CampaignState = {
  id:                number;
  status:            string;
  ends_at:           number;
  participant_count: number;
  max_participants:  number;
  distributed:       boolean;
};

export type DistributeResult = {
  distributed: boolean;
  txHash?:     string;
  reason:
    | "filled"
    | "ended"
    | "already_distributed"
    | "not_ready"
    | "cancelled"
    | "in_progress"
    | "query_failed"
    | "agent_unavailable";
};

export async function maybeDistribute(campaignId: number): Promise<DistributeResult> {
  let campaign: CampaignState;
  try {
    campaign = await queryContract<CampaignState>({ get_campaign: { campaign_id: campaignId } });
  } catch (err) {
    log.error("Campaign query failed", err, { campaignId });
    return { distributed: false, reason: "query_failed" };
  }

  if (campaign.distributed || campaign.status?.toLowerCase() === "distributed") {
    return { distributed: true, reason: "already_distributed" };
  }
  if (campaign.status?.toLowerCase() === "cancelled") {
    return { distributed: false, reason: "cancelled" };
  }

  const now   = Math.floor(Date.now() / 1000);
  const full  = campaign.participant_count >= campaign.max_participants;
  const ended = now > campaign.ends_at;
  if (!full && !ended) {
    return { distributed: false, reason: "not_ready" };
  }

  // Eligible — distribute from the agent (operator) wallet.
  let actionId: string;
  try {
    actionId = await checkAndClaimAction({
      agent:       "verifier",
      action_type: "distribute_rewards",
      campaign_id: campaignId,
    });
  } catch (err) {
    if (isAppError(err) && err.code === "IDEMPOTENCY_CONFLICT") {
      return { distributed: false, reason: "in_progress" };
    }
    throw err;
  }

  try {
    const reason    = full ? "filled" : "ended";
    const reasoning = `Auto-distribute campaign ${campaignId}: ${full ? "participant cap filled" : "campaign end time reached"}.`;
    const msg       = buildExecuteMsg(getAgentAddress(), { distribute_rewards: { campaign_id: campaignId } });

    const txHash = await agentBroadcast(msg, reasoning);
    await confirmAction(actionId, { tx_hash: txHash, reasoning, decision: "distribute", confidence: 100 });

    log.info("Auto-distribution complete", { campaignId, txHash, reason });
    return { distributed: true, txHash, reason };
  } catch (err) {
    const detail = errDetail(err);

    // Concurrency: another trigger already broadcast the identical distribute tx
    // (same agent sequence) and it's in the mempool. That's not a failure — the
    // winner will distribute. Leave this row to be stale-reclaimed and report
    // in_progress instead of erroring.
    if (/already in the mempool|tx already exists/i.test(detail)) {
      log.info("Distribute already in mempool (concurrent trigger)", { campaignId });
      return { distributed: false, reason: "in_progress" };
    }

    // The contract already distributed between our query and broadcast — success.
    if (/already distributed/i.test(detail)) {
      await confirmAction(actionId, { reasoning: "already distributed on-chain", decision: "distribute" }).catch(() => {});
      return { distributed: true, reason: "already_distributed" };
    }

    // Real failure: release the idempotency lock so a later trigger can retry —
    // otherwise one failed broadcast wedges the campaign as "in_progress".
    await failAction(actionId, detail).catch(() => {});

    if (isAppError(err) && err.code === "AGENT_WALLET_MISSING") {
      log.error("Agent wallet not configured (AGENT_MNEMONIC) — cannot auto-distribute", err, { campaignId });
      return { distributed: false, reason: "agent_unavailable" };
    }
    log.error("Auto-distribution failed", err, { campaignId });
    throw err;
  }
}

/** Pull the most descriptive message out of an error (AppError stashes chain
 *  detail in context.detail). */
function errDetail(err: unknown): string {
  const e = err as { message?: string; context?: { detail?: string } };
  return [e?.context?.detail, e?.message].filter(Boolean).join(" ") || String(err);
}
