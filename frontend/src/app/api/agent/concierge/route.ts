/**
 * Quest Concierge — POST /api/agent/concierge
 *
 * A read-only tool-using agent that:
 *   1. Checks user eligibility against all active campaigns
 *   2. Ranks quests by expected reward
 *   3. Explains failed criteria
 *   4. Answers natural-language questions about campaigns
 *
 * NEVER signs or broadcasts on behalf of the user.
 *
 * Body: {
 *   message: string          // user's question
 *   wallet: string | null    // user's inj1… address (if connected)
 *   history: { role: "user" | "assistant"; content: string }[]
 * }
 *
 * Response: { reply: string; eligible_campaigns: EligibleCampaign[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createRouteLogger } from "@/lib/logger";
import { isAppError } from "@/lib/errors";

const log = createRouteLogger("/api/agent/concierge");

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY!, baseURL: "https://api.deepseek.com" });
  return _openai;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name:        "listActiveCampaigns",
      description: "List all active quest campaigns with their metadata",
      parameters:  { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name:        "getCampaignDetails",
      description: "Get full details for a specific campaign including entry criteria",
      parameters:  {
        type: "object",
        properties: { campaign_id: { type: "number" } },
        required: ["campaign_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name:        "getInjBalance",
      description: "Get the INJ balance of a wallet address in INJ (not wei)",
      parameters:  {
        type: "object",
        properties: { wallet: { type: "string" } },
        required: ["wallet"],
      },
    },
  },
  {
    type: "function",
    function: {
      name:        "getNftHoldings",
      description: "Check if a wallet holds any tokens in an NFT contract",
      parameters:  {
        type: "object",
        properties: {
          wallet:   { type: "string" },
          contract: { type: "string", description: "NFT contract address" },
        },
        required: ["wallet", "contract"],
      },
    },
  },
];

// ── Tool implementations ──────────────────────────────────────────────────────

const LCD      = "https://testnet.sentry.lcd.injective.network";
const CONTRACT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

type OnchainCampaign = {
  id: number; title: string; description: string; target_platform: string;
  reward_pool: string; participant_count: number; max_participants: number;
  status: string; ends_at: number; distributed: boolean;
};

async function queryChain<T>(msg: object): Promise<T | null> {
  if (!CONTRACT) return null;
  try {
    const q   = Buffer.from(JSON.stringify(msg)).toString("base64");
    const res = await fetch(`${LCD}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${q}`);
    const json = await res.json();
    return (json?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const supabase = getSupabase();

  if (name === "listActiveCampaigns") {
    // Source of truth is the on-chain contract, NOT the campaign_metadata table
    // (which keeps stale rows from prior contracts). Only return quests that can
    // actually be joined right now: active, not past their end time, not full.
    const data = await queryChain<{ campaigns: OnchainCampaign[] }>({ list_campaigns: { limit: 50 } });
    const all  = data?.campaigns ?? [];
    const now  = Math.floor(Date.now() / 1000);
    const open = all.filter(c =>
      c.status === "active" && !c.distributed && c.ends_at > now &&
      c.participant_count < c.max_participants,
    );

    // Enrich with entry-criteria metadata from Supabase.
    const metaMap: Record<number, Record<string, unknown>> = {};
    if (open.length > 0) {
      const { data: metas } = await supabase
        .from("campaign_metadata").select("*").in("campaign_id", open.map(c => c.id));
      for (const m of metas ?? []) metaMap[(m as { campaign_id: number }).campaign_id] = m;
    }

    const campaigns = open.map(c => {
      const pool = Number(c.reward_pool) / 1e18;
      const m    = metaMap[c.id] ?? {};
      return {
        id: c.id, title: c.title, description: c.description,
        reward_pool_inj: pool,
        reward_per_participant_inj: c.max_participants ? pool / c.max_participants : 0,
        spots_left: c.max_participants - c.participant_count,
        max_participants: c.max_participants,
        ends_at: c.ends_at,
        entry_criteria:    m.entry_criteria    ?? "none",
        quest_type:        m.quest_type        ?? null,
        min_inj:           m.min_inj           ?? null,
        nft_contract:      m.nft_contract      ?? null,
        min_followers:     m.min_followers     ?? null,
        required_hashtags: m.required_hashtags ?? null,
        follow_handle:     m.follow_handle     ?? null,
      };
    });
    return JSON.stringify({ available_count: campaigns.length, campaigns });
  }

  if (name === "getCampaignDetails") {
    const id = Number(args.campaign_id);
    const c  = await queryChain<OnchainCampaign>({ get_campaign: { campaign_id: id } });
    if (!c) return JSON.stringify({ error: "Campaign not found" });
    const { data: meta } = await supabase
      .from("campaign_metadata").select("*").eq("campaign_id", id).maybeSingle();
    const now = Math.floor(Date.now() / 1000);
    return JSON.stringify({
      ...c,
      reward_pool_inj: Number(c.reward_pool) / 1e18,
      spots_left: c.max_participants - c.participant_count,
      is_open: c.status === "active" && !c.distributed && c.ends_at > now && c.participant_count < c.max_participants,
      ...(meta ?? {}),
    });
  }

  if (name === "getInjBalance") {
    const wallet = String(args.wallet ?? "");
    try {
      const res = await fetch(
        `https://testnet.sentry.lcd.injective.network/cosmos/bank/v1beta1/balances/${wallet}/by_denom?denom=inj`,
      );
      const json = await res.json();
      const wei = json?.balance?.amount ?? "0";
      const inj = Number(BigInt(wei)) / 1e18;
      return JSON.stringify({ wallet, balance_inj: inj });
    } catch {
      return JSON.stringify({ wallet, balance_inj: 0, error: "fetch failed" });
    }
  }

  if (name === "getNftHoldings") {
    const wallet   = String(args.wallet ?? "");
    const contract = String(args.contract ?? "");
    try {
      const query  = Buffer.from(JSON.stringify({ tokens: { owner: wallet, limit: 1 } })).toString("base64");
      const res    = await fetch(
        `https://testnet.sentry.lcd.injective.network/cosmwasm/wasm/v1/contract/${contract}/smart/${query}`,
      );
      const json   = await res.json();
      const tokens = json?.data?.tokens ?? [];
      return JSON.stringify({ wallet, contract, holds_nft: tokens.length > 0 });
    } catch {
      return JSON.stringify({ wallet, contract, holds_nft: false, error: "fetch failed" });
    }
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ── Input validation ──────────────────────────────────────────────────────────

const BodySchema = z.object({
  message: z.string().min(1, "message is required").max(2000),
  wallet:  z.string().nullable().optional(),
  history: z
    .array(
      z.object({
        role:    z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(20)
    .optional()
    .default([]),
});

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const t0 = log.start();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { message, wallet, history } = parsed.data;

  const systemPrompt = `You are the Quest Concierge for Questa, a Web3 social quest platform on Injective testnet. You help users discover and join quests.

Your role:
- Check user eligibility for active campaigns using your tools
- Rank quests by expected reward (reward_pool / max_participants)
- Explain clearly why a user doesn't qualify for a quest
- Guide users toward quests they can join now
- Answer questions about campaign mechanics, INJ, and Injective

IMPORTANT: You NEVER sign transactions or move funds for users. Read-only only.
Be concise, friendly, and specific. When mentioning campaigns use their titles.

Rules for quest counts:
- ALWAYS call listActiveCampaigns before stating which/how many quests are available.
- Use ONLY its "available_count" and "campaigns" — never guess or recall numbers.
- If available_count is 0, clearly say there are no open quests right now and suggest checking back later. Do NOT invent campaigns.
${wallet ? `The user's wallet is: ${wallet}` : "The user has not connected a wallet yet."}`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map(h => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: message },
  ];

  try {
    // Agentic loop with function calling
    let loopMessages = [...messages];
    let reply = "";

    for (let i = 0; i < 5; i++) {
      const res = await getOpenAI().chat.completions.create({
        model:       "deepseek-chat",
        messages:    loopMessages,
        tools,
        tool_choice: "auto",
        max_tokens:  600,
        temperature: 0.6,
      });

      const choice = res.choices[0];
      if (!choice) break;

      const msg = choice.message;
      loopMessages.push(msg as OpenAI.Chat.Completions.ChatCompletionMessageParam);

      // If no tool calls, we have our final reply
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        reply = msg.content ?? "";
        break;
      }

      // Execute tool calls
      for (const tc of msg.tool_calls) {
        // Narrow to function tool call (skip custom tool calls)
        if (!("function" in tc)) continue;
        const fnTc = tc as { id: string; function: { name: string; arguments: string } };
        let toolArgs: Record<string, unknown> = {};
        try { toolArgs = JSON.parse(fnTc.function.arguments); } catch {}

        log.info("Tool call", { tool: fnTc.function.name, args: toolArgs });
        const result = await callTool(fnTc.function.name, toolArgs);

        loopMessages.push({
          role:         "tool",
          tool_call_id: fnTc.id,
          content:      result,
        });
      }
    }

    log.end("Concierge response", t0, { wallet: wallet ?? "anon" });
    return NextResponse.json({ reply: reply || "I'm not sure how to help with that." });
  } catch (err) {
    log.error("Concierge failed", err);
    if (isAppError(err)) {
      return NextResponse.json({ error: err.userMessage }, { status: 500 });
    }
    return NextResponse.json({ error: "Concierge is temporarily unavailable." }, { status: 500 });
  }
}
