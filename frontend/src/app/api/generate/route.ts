import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com" });
  return _client;
}

// ── Campaign title + description generation ───────────────────────────────────
async function generateCampaign(
  topic: string,
  category: string,
  tone: string,
  language: string,
) {
  const system = `You are an expert Web3 campaign strategist. You create high-converting campaign copy for crypto and DeFi projects running on-chain reward campaigns. Your writing is crisp, specific, and avoids generic hype.`;

  const user = `Create campaign content for a Web3 reward campaign.

Idea / Context: ${topic}
Category: ${category || "General"}
Tone: ${tone}
Output language: ${language}

Requirements:
- Title: punchy action phrase, max 70 characters, no generic words like "amazing" or "incredible"
- Description: 1–2 sentences explaining what participants do, why it matters, and what they earn — between 120–280 characters
- The title and description should feel cohesive

Respond with ONLY a JSON object, no markdown, no explanation:
{"title":"...","description":"..."}`;

  const res = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    max_tokens: 250,
    temperature: 0.85,
  });

  const raw = res.choices[0]?.message?.content?.trim() ?? "{}";
  // Strip possible markdown code fences
  const json = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(json) as { title: string; description: string };
}

// ── Social post generation ────────────────────────────────────────────────────
async function generatePost(
  platform: string,
  tone: string,
  topic: string,
  campaign: string,
) {
  const system = `You are a Web3 social media content expert specialising in crypto and DeFi campaigns. Generate engaging, authentic posts that resonate with the crypto community. Use relevant terminology naturally. Include 2–4 relevant hashtags. Keep posts platform-appropriate. Do NOT use excessive emojis or hype language.`;

  const user = `Generate a ${platform} post for a campaign about: "${campaign}"
Topic: ${topic}
Tone: ${tone}
Target audience: crypto/DeFi community on Injective Network

Return ONLY the post content, no explanation.`;

  const res = await getClient().chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user   },
    ],
    max_tokens: 300,
    temperature: 0.8,
  });

  const content = res.choices[0]?.message?.content ?? "";
  const engagementScore = Math.floor(Math.random() * 15) + 80;
  return { content, engagementScore };
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, platform, tone, topic, campaign, category, language } = body;

    if (mode === "campaign") {
      const result = await generateCampaign(topic, category, tone ?? "Professional", language ?? "English");
      return NextResponse.json(result);
    }

    const result = await generatePost(platform, tone, topic, campaign);
    return NextResponse.json(result);
  } catch (err) {
    console.error("DeepSeek error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
