/**
 * Campaign Copilot — POST /api/agent/copilot
 *
 * Two modes:
 *   1. compose — natural language brief → complete campaign config
 *   2. insights — campaign metrics → creator recommendations (for admin dashboard)
 *
 * Body:
 *   { mode: "compose", brief: string }
 *   { mode: "insights", campaign_id: number, title: string, description: string,
 *     platform: string, participant_count: number, max_participants: number,
 *     created_at: number, ends_at: number, status: string, reward_pool_inj: number,
 *     submissions: { post_url: string|null, joined_at: number }[] }
 *
 * Every recommendation is logged to agent_actions.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { llmCall } from "@/lib/agent/llm";
import { createRouteLogger } from "@/lib/logger";
import { isAppError } from "@/lib/errors";
import { createClient } from "@supabase/supabase-js";

const log = createRouteLogger("/api/agent/copilot");

// ── Input schemas ─────────────────────────────────────────────────────────────

const ComposeBodySchema = z.object({
  mode:  z.literal("compose"),
  brief: z.string().min(1).max(1000),
});

const InsightsBodySchema = z.object({
  mode:              z.literal("insights"),
  campaign_id:       z.number().int().positive().optional(),
  title:             z.string(),
  description:       z.string(),
  platform:          z.string(),
  participant_count: z.number().int().min(0),
  max_participants:  z.number().int().min(1),
  created_at:        z.number(),
  ends_at:           z.number(),
  status:            z.string(),
  reward_pool_inj:   z.number().min(0),
  submissions:       z.array(z.object({
    post_url:  z.string().nullable(),
    joined_at: z.number(),
  })),
});

const CopilotBodySchema = z.union([ComposeBodySchema, InsightsBodySchema]);

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

// ── Compose schemas ───────────────────────────────────────────────────────────

const ComposeOutputSchema = z.object({
  title:              z.string(),
  description:        z.string(),
  quest_type:         z.enum(["post_original", "like_repost", "follow", "quote_tweet"]),
  entry_criteria:     z.enum(["none", "min_inj", "nft_holder", "min_followers"]),
  required_hashtags:  z.string(),
  follow_handle:      z.string().nullable(),
  duration_days:      z.number().int().min(1).max(30),
  reward_suggestion:  z.number().min(0.1),
  max_participants:   z.number().int().min(10),
  distribution:       z.enum(["equal", "lucky_draw"]),
  reasoning:          z.string(),
  economic_warning:   z.string().nullable(),
});

const InsightsOutputSchema = z.object({
  participation_rate:      z.number(),
  velocity:                z.enum(["fast", "steady", "slow"]),
  projected_fill:          z.enum(["full", "partial", "low"]),
  content_diversity_hint:  z.string(),
  top_recommendation:      z.string(),
  additional_tips:         z.array(z.string()),
  sentiment:               z.enum(["strong", "good", "weak"]),
  sentiment_label:         z.string(),
  urgency:                 z.enum(["high", "medium", "low"]),
  urgency_message:         z.string(),
});

// ── Sanity check economics ────────────────────────────────────────────────────
function checkEconomics(config: z.infer<typeof ComposeOutputSchema>): string | null {
  const perParticipant = config.reward_suggestion / config.max_participants;
  if (perParticipant < 0.001) {
    return `Warning: reward per participant is very low (${perParticipant.toFixed(6)} INJ). Consider reducing max_participants or increasing reward_suggestion.`;
  }
  if (config.duration_days < 2 && config.max_participants > 500) {
    return `Warning: ${config.duration_days}-day campaign with ${config.max_participants} spots may not fill. Consider extending to at least 5 days.`;
  }
  return null;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const t0 = log.start();

  const parsed = CopilotBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const mode = body.mode;

  // ── Mode: compose ──────────────────────────────────────────────────────────
  if (mode === "compose") {
    const brief = String(body.brief ?? "").trim();
    if (!brief) {
      return NextResponse.json({ error: "brief is required" }, { status: 400 });
    }

    const system = `You are an expert Web3 quest campaign designer on the Injective blockchain. Transform the creator's brief into a complete, production-ready campaign configuration. Apply sanity checks on economics.

Rules:
- quest_type: post_original | like_repost | follow | quote_tweet
- entry_criteria: none | min_inj | nft_holder | min_followers (use none unless brief specifies)
- required_hashtags: 2-4, comma-separated, no # prefix, always include "Injective"
- follow_handle: only for follow quest_type, else null
- duration_days: 3-14 based on ambition
- reward_suggestion: total INJ pool (0.5-20 INJ, most campaigns 1-5 INJ)
- max_participants: 50-2000
- distribution: equal for brand awareness, lucky_draw for viral/contest
- economic_warning: null or a concise warning if economics look problematic
- reasoning: one sentence explaining key choices
Output ONLY valid JSON.`;

    const user = `Campaign brief: "${brief}"

Return JSON:
{
  "title": string (≤70 chars, action-oriented),
  "description": string (120-280 chars, specific),
  "quest_type": "post_original"|"like_repost"|"follow"|"quote_tweet",
  "entry_criteria": "none"|"min_inj"|"nft_holder"|"min_followers",
  "required_hashtags": string,
  "follow_handle": string|null,
  "duration_days": number,
  "reward_suggestion": number,
  "max_participants": number,
  "distribution": "equal"|"lucky_draw",
  "reasoning": string,
  "economic_warning": string|null
}`;

    try {
      const result = await llmCall({ system, user, maxTokens: 500, temperature: 0.7 }, ComposeOutputSchema);

      // Augment with our own economics check
      const econCheck = result.economic_warning ?? checkEconomics(result);

      // Log recommendation to agent_actions
      const supabase = getSupabase();
      await supabase.from("agent_actions").insert({
        agent:       "copilot",
        action_type: "compose_campaign",
        input:       { brief },
        reasoning:   result.reasoning,
        decision:    "compose",
        confidence:  90,
        status:      "confirmed",
      });

      log.end("Copilot compose complete", t0);
      return NextResponse.json({ ...result, economic_warning: econCheck });
    } catch (err) {
      log.error("Copilot compose failed", err);
      if (isAppError(err)) {
        return NextResponse.json({ error: err.userMessage }, { status: 500 });
      }
      return NextResponse.json({ error: "Composition failed" }, { status: 500 });
    }
  }

  // ── Mode: insights ─────────────────────────────────────────────────────────
  if (mode === "insights") {
    const campaign_id = Number(body.campaign_id);
    const now         = Date.now() / 1000;
    const endsAt      = Number(body.ends_at ?? 0);
    const createdAt   = Number(body.created_at ?? 0);
    const totalSec    = endsAt - createdAt;
    const elapsedSec  = Math.max(0, now - createdAt);
    const daysLeft    = Math.round(Math.max(0, endsAt - now) / 86400);
    const fillPct     = Number(body.max_participants) > 0
      ? Math.round((Number(body.participant_count) / Number(body.max_participants)) * 100)
      : 0;
    const timeElapsedPct = totalSec > 0 ? Math.round((elapsedSec / totalSec) * 100) : 100;
    const subs = Array.isArray(body.submissions) ? body.submissions as { post_url: string | null }[] : [];
    const subWithUrl = subs.filter(s => s.post_url).length;
    const submissionRate = Number(body.participant_count) > 0
      ? Math.round((subWithUrl / Number(body.participant_count)) * 100)
      : 0;

    const system = `You are a Web3 campaign performance analyst for Injective blockchain reward campaigns. Analyze metrics and provide concrete, actionable creator recommendations. Be concise. Output ONLY valid JSON.`;

    const user = `Campaign: "${body.title}"
Description: ${body.description}
Platform: ${body.platform}, Status: ${body.status}
Reward pool: ${body.reward_pool_inj} INJ

Metrics:
- ${body.participant_count}/${body.max_participants} spots (${fillPct}%)
- ${subWithUrl}/${body.participant_count} have submitted (${submissionRate}%)
- ${timeElapsedPct}% through timeline, ${daysLeft} days left

Return JSON:
{
  "participation_rate": number,
  "velocity": "fast"|"steady"|"slow",
  "projected_fill": "full"|"partial"|"low",
  "content_diversity_hint": string,
  "top_recommendation": string,
  "additional_tips": string[],
  "sentiment": "strong"|"good"|"weak",
  "sentiment_label": string,
  "urgency": "high"|"medium"|"low",
  "urgency_message": string
}`;

    try {
      const result = await llmCall({ system, user, maxTokens: 450, temperature: 0.5 }, InsightsOutputSchema);

      // Log recommendation
      if (campaign_id) {
        const supabase = getSupabase();
        await supabase.from("agent_actions").insert({
          agent:       "copilot",
          action_type: "campaign_insights",
          campaign_id,
          reasoning:   result.top_recommendation,
          decision:    "insights",
          confidence:  80,
          status:      "confirmed",
        });
      }

      log.end("Copilot insights complete", t0, { campaign_id });
      return NextResponse.json({ ...result, participation_rate: fillPct });
    } catch (err) {
      log.error("Copilot insights failed", err, { campaign_id });
      if (isAppError(err)) {
        return NextResponse.json({ error: err.userMessage }, { status: 500 });
      }
      return NextResponse.json({ error: "Insights generation failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
}
