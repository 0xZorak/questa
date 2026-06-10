/**
 * Agent 2 — Submission Reviewer
 *
 * Analyzes a participant's submission for quality, relevance, originality,
 * and campaign compliance. Helps creators make informed reward decisions.
 *
 * POST /api/agents/review-submission
 * Body: {
 *   post_url: string
 *   post_text?: string          // optional if we can't fetch it
 *   campaign_title: string
 *   campaign_description: string
 *   required_hashtags?: string  // comma-separated
 *   quest_type: string
 * }
 * Response: {
 *   quality_score: number       // 0–100
 *   relevance_score: number     // 0–100
 *   originality_score: number   // 0–100
 *   hashtag_compliance: boolean
 *   tone: "positive" | "neutral" | "negative" | "spam"
 *   recommendation: "approve" | "review" | "reject"
 *   strengths: string[]
 *   concerns: string[]
 *   summary: string             // one-sentence verdict
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com" });
  return _client;
}

const SYSTEM = `You are an expert Web3 content quality analyst. You review social media submissions for campaign compliance, authenticity, and quality. You are fair but strict — generic, copy-paste, or off-topic content scores low.

Scoring guidelines:
- quality_score (0–100): writing quality, specificity, effort, platform appropriateness
- relevance_score (0–100): how well the content relates to the campaign topic
- originality_score (0–100): freshness vs copy-paste / templated content
- hashtag_compliance: true only if ALL required hashtags appear in the post text
- tone: "positive" (supportive of the project), "neutral", "negative" (critical), "spam" (no real content)
- recommendation: "approve" (scores ≥70 across board), "review" (borderline), "reject" (spam/off-topic/low effort)

Be concise. Respond with ONLY valid JSON.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      post_url: string;
      post_text?: string;
      campaign_title: string;
      campaign_description: string;
      required_hashtags?: string;
      quest_type?: string;
    };

    if (!body.post_url && !body.post_text) {
      return NextResponse.json({ error: "post_url or post_text required" }, { status: 400 });
    }

    // If post_text is short or missing, note it for the agent
    const postContent = body.post_text?.trim()
      ? `Post text: "${body.post_text.trim()}"`
      : `Post URL: ${body.post_url} (text not available — assess what we can from URL pattern and context)`;

    const requiredHashtags = body.required_hashtags
      ? `Required hashtags: ${body.required_hashtags}`
      : "No specific hashtags required";

    const res = await getClient().chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Review this campaign submission.

Campaign: "${body.campaign_title}"
Campaign goal: ${body.campaign_description}
Quest type: ${body.quest_type ?? "post_original"}
${requiredHashtags}

Submission:
${postContent}

Return ONLY a JSON object:
{
  "quality_score": number,
  "relevance_score": number,
  "originality_score": number,
  "hashtag_compliance": boolean,
  "tone": "positive" | "neutral" | "negative" | "spam",
  "recommendation": "approve" | "review" | "reject",
  "strengths": string[],
  "concerns": string[],
  "summary": string
}`,
        },
      ],
      max_tokens: 400,
      temperature: 0.3, // lower temp for more consistent scoring
    });

    const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
    const json = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const result = JSON.parse(json);

    return NextResponse.json({
      quality_score:       Number(result.quality_score)     || 0,
      relevance_score:     Number(result.relevance_score)   || 0,
      originality_score:   Number(result.originality_score) || 0,
      hashtag_compliance:  Boolean(result.hashtag_compliance),
      tone:                result.tone               ?? "neutral",
      recommendation:      result.recommendation     ?? "review",
      strengths:           Array.isArray(result.strengths) ? result.strengths : [],
      concerns:            Array.isArray(result.concerns)  ? result.concerns  : [],
      summary:             result.summary            ?? "Review pending",
    });
  } catch (err) {
    console.error("[Agent/ReviewSubmission]", err);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
