/**
 * Verifier Agent — POST /api/agent/verify
 *
 * Processes unverified submissions for a campaign:
 *   1. Fetch all unverified submissions from Supabase
 *   2. For each: LLM-judge vs campaign brief (quality, sybil heuristics)
 *   3. Write verdict to agent_actions + update submissions.agent_verdict
 *   4. If auto_distribute=true and campaign ended with ≥1 approved: agent executes
 *      DistributeRewards from agent wallet
 *
 * Can be invoked:
 *   - Via cron job (Vercel cron, /api/cron/verify)
 *   - Via "Run agent now" button on the campaign admin dashboard
 *
 * Body: { campaign_id: number }
 * Auth: requires x-agent-secret header matching AGENT_SECRET env var
 *       (for the cron path) OR valid creator wallet (future: JWT)
 *
 * Response: { processed: number, approved: number, rejected: number, flagged: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

// ── Input validation ──────────────────────────────────────────────────────────
const BodySchema = z.object({
  campaign_id: z.number().int().positive(),
});
import { llmCall } from "@/lib/agent/llm";
import { maybeDistribute } from "@/lib/agent/distribute";
import {
  checkAndClaimAction,
  confirmAction,
  failAction,
  getAgentConfig,
} from "@/lib/idempotency";
import { createRouteLogger } from "@/lib/logger";
import { isAppError } from "@/lib/errors";
import crypto from "crypto";

const log = createRouteLogger("/api/agent/verify");

// ── Supabase server client ────────────────────────────────────────────────────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

// ── LLM output schema ─────────────────────────────────────────────────────────
const VerifierOutputSchema = z.object({
  fulfills:     z.boolean(),
  quality_score: z.number().min(0).max(100),
  flags:        z.array(z.string()),
  reasoning:    z.string(),
});

type VerifierOutput = z.infer<typeof VerifierOutputSchema>;

// ── Sybil heuristics ──────────────────────────────────────────────────────────
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")      // strip URLs
    .replace(/[^a-z0-9\s]/g, "")         // strip punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function contentHash(text: string): string {
  return crypto.createHash("sha256").update(normalizeText(text)).digest("hex");
}

interface SybilContext {
  /** Hashes of all post text seen in this batch — for near-duplicate detection */
  seenHashes: Map<string, string>;
  /** Twitter handles that have appeared across wallets */
  seenHandles: Map<string, string>;
}

function checkSybilHeuristics(
  sub: { wallet_address: string; post_url: string | null; post_text?: string | null },
  ctx: SybilContext,
): string[] {
  const flags: string[] = [];

  // Duplicate / near-duplicate text detection
  if (sub.post_text) {
    const h = contentHash(sub.post_text);
    if (ctx.seenHashes.has(h) && ctx.seenHashes.get(h) !== sub.wallet_address) {
      flags.push("duplicate_content");
    } else {
      ctx.seenHashes.set(h, sub.wallet_address);
    }
  }

  // Multiple wallets claiming same Twitter handle
  const handle = extractHandle(sub.post_url ?? "");
  if (handle) {
    if (ctx.seenHandles.has(handle) && ctx.seenHandles.get(handle) !== sub.wallet_address) {
      flags.push("shared_twitter_handle");
    } else {
      ctx.seenHandles.set(handle, sub.wallet_address);
    }
  }

  return flags;
}

function extractHandle(url: string): string | null {
  const m = url.match(/twitter\.com\/([A-Za-z0-9_]+)\//i)
    || url.match(/x\.com\/([A-Za-z0-9_]+)\//i);
  return m ? m[1].toLowerCase() : null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const t0 = log.start();

  // Auth check
  const secret = req.headers.get("x-agent-secret");
  if (secret && secret !== process.env.AGENT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { campaign_id } = parsed.data;
  const supabase = getSupabase();

  log.info("Verifier starting", { campaign_id });

  // Fetch campaign metadata
  const { data: campaignMeta } = await supabase
    .from("campaign_metadata")
    .select("*")
    .eq("campaign_id", campaign_id)
    .maybeSingle();

  // Fetch all unverified submissions (post_text used for sybil content-hash check)
  const { data: submissions, error: subErr } = await supabase
    .from("submissions")
    .select("id, wallet_address, post_url, post_text, submitted_at, agent_verdict")
    .eq("campaign_id", campaign_id)
    .is("agent_verdict", null);

  if (subErr) {
    log.error("Failed to fetch submissions", subErr, { campaign_id });
    return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 });
  }

  if (!submissions || submissions.length === 0) {
    log.info("No unverified submissions", { campaign_id });
    return NextResponse.json({ processed: 0, approved: 0, rejected: 0, flagged: 0 });
  }

  const config = await getAgentConfig(campaign_id);
  const sybilCtx: SybilContext = {
    seenHashes:  new Map(),
    seenHandles: new Map(),
  };

  let approved = 0;
  let rejected = 0;
  let flagged  = 0;

  // Process each submission
  for (const sub of submissions) {
    let actionId: string | null = null;

    try {
      // Claim idempotency slot
      actionId = await checkAndClaimAction({
        agent:       "verifier",
        action_type: "verify_submission",
        campaign_id,
        wallet:      sub.wallet_address,
        input:       { post_url: sub.post_url, submission_id: sub.id },
      });
    } catch (err) {
      if (isAppError(err) && err.code === "IDEMPOTENCY_CONFLICT") {
        log.info("Skipping already-processed submission", { wallet: sub.wallet_address });
        continue;
      }
      log.error("Idempotency claim failed", err, { wallet: sub.wallet_address });
      continue;
    }

    try {
      // Sybil heuristics (pre-LLM)
      const sybilFlags = checkSybilHeuristics(
        {
          wallet_address: sub.wallet_address,
          post_url:       sub.post_url,
          post_text:      (sub as unknown as { post_text?: string | null }).post_text ?? null,
        },
        sybilCtx,
      );

      // LLM judgment
      const systemPrompt = `You are a Web3 campaign quality judge. You evaluate social media submissions against campaign requirements and detect spam/sybil patterns. Be strict but fair. Output ONLY valid JSON.`;

      const userPrompt = `Campaign brief:
Title: ${campaignMeta?.quest_type ?? "social media campaign"}
Required hashtags: ${campaignMeta?.required_hashtags ?? "none"}
Follow handle: ${campaignMeta?.follow_handle ?? "none"}

Submission:
Wallet: ${sub.wallet_address}
Post URL: ${sub.post_url ?? "(no URL)"}
Submitted at: ${sub.submitted_at}
Pre-flagged sybil signals: ${sybilFlags.join(", ") || "none"}

Evaluate this submission and return JSON:
{
  "fulfills": boolean,
  "quality_score": number (0-100),
  "flags": string[] (e.g. ["spam", "off_topic", "low_effort", "duplicate"]),
  "reasoning": string (2-3 sentences explaining your judgment)
}`;

      const llmOut: VerifierOutput = await llmCall(
        { system: systemPrompt, user: userPrompt, maxTokens: 300, temperature: 0.2 },
        VerifierOutputSchema,
      );

      const allFlags = [...sybilFlags, ...llmOut.flags];

      // Decision logic
      let decision: string;
      if (allFlags.includes("shared_twitter_handle") || allFlags.includes("duplicate_content")) {
        decision = "reject";
        rejected++;
      } else if (!llmOut.fulfills || llmOut.quality_score < config.quality_threshold) {
        decision = "reject";
        rejected++;
      } else if (llmOut.quality_score < config.quality_threshold + 15 || allFlags.length > 0) {
        decision = "flag_for_human";
        flagged++;
      } else {
        decision = "approve";
        approved++;
      }

      // Update submission in Supabase
      await supabase
        .from("submissions")
        .update({
          agent_verdict:    decision,
          agent_score:      llmOut.quality_score,
          agent_flags:      allFlags,
          agent_reasoning:  llmOut.reasoning,
          agent_action_id:  actionId,
          verified:         decision === "approve",
        })
        .eq("id", sub.id);

      // Confirm the action row
      await confirmAction(actionId, {
        reasoning:  llmOut.reasoning,
        decision,
        confidence: llmOut.quality_score,
      });

      log.info("Submission processed", {
        wallet:    sub.wallet_address,
        decision,
        score:     llmOut.quality_score,
        flags:     allFlags,
      });
    } catch (err) {
      log.error("Failed to process submission", err, { wallet: sub.wallet_address });
      if (actionId) await failAction(actionId, err instanceof Error ? err.message : String(err));
      // Fail-closed: non-approved
      rejected++;
    }
  }

  // Auto-distribute only when the campaign is actually DONE — its cap is filled
  // or its end time has passed. maybeDistribute() is the single gated path; it's
  // a no-op if the campaign isn't ready yet.
  let distributeTxHash: string | undefined;
  if (config.auto_distribute) {
    try {
      const result = await maybeDistribute(campaign_id);
      if (result.distributed && result.txHash) distributeTxHash = result.txHash;
      log.info("Distribution gate", { campaign_id, ...result });
    } catch (err) {
      log.error("Auto-distribution failed", err, { campaign_id });
    }
  }

  log.end("Verifier complete", t0, { campaign_id, approved, rejected, flagged });

  return NextResponse.json({
    processed:     submissions.length,
    approved,
    rejected,
    flagged,
    distribute_tx: distributeTxHash,
  });
}
