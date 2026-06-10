/**
 * Agent 3 — Campaign Insights
 *
 * Analyzes a running or completed campaign and produces actionable insights:
 * participation trends, content quality summary, creator recommendations.
 *
 * POST /api/agents/campaign-insights
 * Body: {
 *   campaign_id: number
 *   title: string
 *   description: string
 *   platform: string
 *   participant_count: number
 *   max_participants: number
 *   created_at: number      // unix timestamp
 *   ends_at: number         // unix timestamp
 *   status: string
 *   reward_pool_inj: number // e.g. 2.5
 *   submissions: { post_url: string | null; joined_at: number }[]
 * }
 * Response: {
 *   participation_rate: number          // 0–100 %
 *   velocity: "fast" | "steady" | "slow"
 *   projected_fill: "full" | "partial" | "low"
 *   content_diversity_hint: string
 *   top_recommendation: string
 *   additional_tips: string[]
 *   sentiment: "strong" | "good" | "weak"
 *   sentiment_label: string             // one-liner
 *   urgency: "high" | "medium" | "low"
 *   urgency_message: string
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
});

const SYSTEM = `You are a Web3 campaign performance analyst specializing in on-chain reward campaigns on the Injective blockchain. You analyze campaign metrics and provide actionable creator recommendations.

Be concise, specific, and practical. No fluff. Your advice should help the creator maximize participation and content quality before the campaign ends. Respond with ONLY valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      campaign_id?: number;
      title: string;
      description: string;
      platform: string;
      participant_count: number;
      max_participants: number;
      created_at: number;
      ends_at: number;
      status: string;
      reward_pool_inj: number;
      submissions: { post_url: string | null; joined_at: number }[];
    };

    const now         = Date.now() / 1000;
    const totalSec    = body.ends_at - body.created_at;
    const elapsedSec  = Math.max(0, now - body.created_at);
    const remainingSec = Math.max(0, body.ends_at - now);
    const timeElapsedPct = totalSec > 0 ? Math.round((elapsedSec / totalSec) * 100) : 100;
    const daysLeft    = Math.round(remainingSec / 86400);
    const fillPct     = body.max_participants > 0
      ? Math.round((body.participant_count / body.max_participants) * 100)
      : 0;
    const submissionsWithUrl = body.submissions.filter(s => s.post_url).length;
    const submissionRate = body.participant_count > 0
      ? Math.round((submissionsWithUrl / body.participant_count) * 100)
      : 0;

    const res = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Analyze this Web3 quest campaign and return insights.

Campaign: "${body.title}"
Description: ${body.description}
Platform: ${body.platform}
Status: ${body.status}
Reward pool: ${body.reward_pool_inj} INJ

Participation:
- ${body.participant_count} / ${body.max_participants} spots filled (${fillPct}%)
- ${submissionsWithUrl} / ${body.participant_count} have submitted content (${submissionRate}%)
- Campaign is ${timeElapsedPct}% through its timeline (${daysLeft} days left)

Return ONLY a JSON object:
{
  "participation_rate": number (0-100),
  "velocity": "fast" | "steady" | "slow",
  "projected_fill": "full" | "partial" | "low",
  "content_diversity_hint": string (one sentence about expected content variety),
  "top_recommendation": string (single most impactful action creator can take),
  "additional_tips": string[] (2-3 short actionable tips),
  "sentiment": "strong" | "good" | "weak",
  "sentiment_label": string (5-8 word status summary),
  "urgency": "high" | "medium" | "low",
  "urgency_message": string (one sentence about urgency level)
}`,
        },
      ],
      max_tokens: 450,
      temperature: 0.5,
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
    const json = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const result = JSON.parse(json);

    return NextResponse.json({
      participation_rate:    fillPct,
      velocity:              result.velocity              ?? "steady",
      projected_fill:        result.projected_fill        ?? "partial",
      content_diversity_hint:result.content_diversity_hint ?? "",
      top_recommendation:    result.top_recommendation    ?? "",
      additional_tips:       Array.isArray(result.additional_tips) ? result.additional_tips : [],
      sentiment:             result.sentiment             ?? "good",
      sentiment_label:       result.sentiment_label       ?? "Campaign in progress",
      urgency:               result.urgency               ?? "medium",
      urgency_message:       result.urgency_message       ?? "",
    });
  } catch (err) {
    console.error("[Agent/CampaignInsights]", err);
    return NextResponse.json({ error: "Insights generation failed" }, { status: 500 });
  }
}
