/**
 * Agent 1 — Quest Composer
 *
 * Takes a one-sentence campaign brief and returns a complete, ready-to-use
 * campaign form configuration so creators can go from idea → form in one click.
 *
 * POST /api/agents/compose
 * Body: { brief: string }
 * Response:
 * {
 *   title: string
 *   description: string
 *   quest_type: "post_original" | "like_repost" | "follow" | "quote_tweet"
 *   entry_criteria: "none" | "min_inj" | "nft_holder" | "min_followers"
 *   required_hashtags: string          // comma-separated
 *   follow_handle: string | null
 *   duration_days: number
 *   reward_suggestion: number          // INJ
 *   max_participants: number
 *   distribution: "equal" | "lucky_draw"
 *   reasoning: string                  // one sentence why these choices
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
});

const SYSTEM = `You are an expert Web3 quest campaign designer on the Injective blockchain.
Your job is to take a creator's campaign brief and produce a complete, production-ready quest configuration.

Rules:
- quest_type must be one of: post_original, like_repost, follow, quote_tweet
- entry_criteria must be one of: none, min_inj, nft_holder, min_followers
- Use "none" for entry_criteria unless the brief specifically mentions NFT holders, INJ whales, or influencers
- required_hashtags: 2–4 hashtags, comma-separated, no # prefix, always include "Injective"
- follow_handle: only if quest_type is "follow", otherwise null
- duration_days: 3–14 days based on campaign ambition
- reward_suggestion: 0.5–10 INJ based on scope (most campaigns: 1–3 INJ)
- max_participants: 50–2000 based on scope
- distribution: "equal" for brand awareness, "lucky_draw" for viral/contest campaigns
- title: max 70 chars, punchy, action-oriented
- description: 120–280 chars, specific about what to do and what to earn
- reasoning: one sentence explaining the key configuration choices

Respond with ONLY valid JSON matching the exact schema. No markdown, no explanation outside JSON.`;

export async function POST(req: NextRequest) {
  try {
    const { brief } = await req.json() as { brief: string };
    if (!brief?.trim()) {
      return NextResponse.json({ error: "brief is required" }, { status: 400 });
    }

    const res = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Campaign brief: "${brief.trim()}"

Return a JSON object with these exact fields:
{
  "title": string,
  "description": string,
  "quest_type": "post_original" | "like_repost" | "follow" | "quote_tweet",
  "entry_criteria": "none" | "min_inj" | "nft_holder" | "min_followers",
  "required_hashtags": string,
  "follow_handle": string | null,
  "duration_days": number,
  "reward_suggestion": number,
  "max_participants": number,
  "distribution": "equal" | "lucky_draw",
  "reasoning": string
}`,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
    const json = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const result = JSON.parse(json);

    // Validate required fields, fill safe defaults if missing
    return NextResponse.json({
      title:              result.title              ?? "Join Our Campaign",
      description:        result.description        ?? brief.trim(),
      quest_type:         result.quest_type         ?? "post_original",
      entry_criteria:     result.entry_criteria     ?? "none",
      required_hashtags:  result.required_hashtags  ?? "Injective, Web3",
      follow_handle:      result.follow_handle      ?? null,
      duration_days:      Number(result.duration_days)    || 7,
      reward_suggestion:  Number(result.reward_suggestion) || 1,
      max_participants:   Number(result.max_participants)  || 200,
      distribution:       result.distribution       ?? "equal",
      reasoning:          result.reasoning          ?? "",
    });
  } catch (err) {
    console.error("[Agent/Compose]", err);
    return NextResponse.json({ error: "Composition failed" }, { status: 500 });
  }
}
