"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight, Search, Trophy, Users, Clock, Zap, CheckCircle2,
  Coins, Shield, Bot, X, Send, MessageCircle, ChevronDown,
} from "lucide-react";
import AppNav from "@/components/AppNav";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import { queryContract, CONTRACT_ADDRESS } from "@/lib/injective";
import { getCampaignMetadataBatch, getWalletSubmissions } from "@/lib/supabase";
import type { QuestType, CampaignMetadataRow } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: number;
  title: string;
  description: string;
  target_platform: string;
  reward_pool: string;
  max_participants: number;
  participant_count: number;
  status: string;
  ends_at: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────


const PLATFORM_COLOR: Record<string, string> = {
  twitter:  "#1DA1F2",
  discord:  "#5865F2",
  telegram: "#26A5E4",
  linkedin: "#0A66C2",
};

const QUEST_TYPE_BADGE: Record<QuestType, { label: string; color: string }> = {
  post_original: { label: "Post",        color: "#3B82F6" },
  like_repost:   { label: "Like & RT",   color: "#EC4899" },
  follow:        { label: "Follow",      color: "#22C55E" },
  quote_tweet:   { label: "Quote Tweet", color: "#8B5CF6" },
};

// ── Campaign card ─────────────────────────────────────────────────────────────

function CampaignCard({
  c,
  joined,
  meta,
  dark,
}: {
  c: Campaign;
  joined: boolean;
  meta?: CampaignMetadataRow;
  dark: boolean;
}) {
  const card      = dark ? "#111111" : "#FFFFFF";
  const border    = dark ? "#1E1E1E" : "#E2DAC8";
  const borderHov = dark ? "#D9770640" : "#D9770650";
  const text      = dark ? "#F5F0E8" : "#180E02";
  const textMuted = dark ? "#6B7280" : "#8C6A3A";
  const statBg    = dark ? "#0A0A0A" : "#F5F0EB";

  const color    = PLATFORM_COLOR[c.target_platform.toLowerCase()] ?? "#D97706";
  // Time-aware: a campaign is "ended" if its status flipped OR its end time has
  // passed. The on-chain status stays "active" after expiry (nothing flips it),
  // so a status-only check wrongly shows expired quests as live.
  const ended    = c.status !== "active" || c.ends_at <= Date.now() / 1000;
  const endsIn   = ended ? 0 : Math.max(0, Math.floor((c.ends_at - Date.now() / 1000) / 86400));
  const rewardInj = (Number(BigInt(c.reward_pool)) / 1e18).toFixed(2);
  const perPart   = c.max_participants > 0
    ? (Number(BigInt(c.reward_pool)) / 1e18 / c.max_participants).toFixed(3)
    : "0";
  const spotsLeft = c.max_participants - c.participant_count;
  const questType = meta?.quest_type;
  const criteria  = meta?.entry_criteria ?? "none";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 transition-all hover:border-amber-500/30"
      style={{ background: card, border: `1px solid ${border}` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = borderHov)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = border)}
    >
      {/* Platform + quest type + status row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium capitalize"
            style={{ background: color + "20", color }}
          >
            {c.target_platform}
          </span>
          {questType && (() => {
            const qt = QUEST_TYPE_BADGE[questType];
            return (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: qt.color + "18", color: qt.color }}>
                {qt.label}
              </span>
            );
          })()}
          {joined && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1"
              style={{ background: "#22C55E18", color: "#22C55E" }}
            >
              <CheckCircle2 size={10} /> Joined
            </span>
          )}
          {ended && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ background: "#6B728020", color: "#6B7280" }}
            >
              Ended
            </span>
          )}
        </div>
        {!ended && (
          <span className="text-xs flex items-center gap-1 shrink-0" style={{ color: textMuted }}>
            <Clock size={11} /> {endsIn}d left
          </span>
        )}
      </div>

      {/* Entry criteria badge */}
      {criteria !== "none" && (
        <div className="flex items-center gap-1.5 -mt-2">
          {criteria === "min_inj" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "#D9770618", color: "#D97706", border: "1px solid #D9770630" }}>
              <Coins size={9} /> Min {meta?.min_inj} INJ
            </span>
          )}
          {criteria === "nft_holder" && (
            <span className="text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1"
              style={{ background: "#8B5CF618", color: "#8B5CF6", border: "1px solid #8B5CF630" }}>
              <Shield size={9} /> NFT Required
            </span>
          )}
        </div>
      )}

      {/* Title + description */}
      <div>
        <h3 className="font-semibold text-sm mb-1" style={{ color: text }}>{c.title}</h3>
        <p className="text-xs leading-relaxed line-clamp-2" style={{ color: textMuted }}>
          {c.description}
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: <Trophy size={11} />, label: "Pool",        val: `${rewardInj} INJ`               },
          { icon: <Zap size={11} />,    label: "Per creator", val: `~${perPart} INJ`                 },
          { icon: <Users size={11} />,  label: "Spots left",  val: `${spotsLeft}/${c.max_participants}` },
        ].map(s => (
          <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: statBg }}>
            <div className="flex items-center justify-center gap-0.5 text-amber-500 mb-0.5">
              {s.icon}
            </div>
            <p className="text-xs font-semibold" style={{ color: text }}>{s.val}</p>
            <p className="text-[10px]" style={{ color: textMuted }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <Link
        href={`/quests/${c.id}`}
        className="w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
        style={{
          background: joined  ? "#22C55E20"
                    : ended   ? dark ? "#1E1E1E" : "#F0EAE0"
                    : "#D97706",
          color:      joined  ? "#22C55E"
                    : ended   ? textMuted
                    : "#FFF8F0",
          border:     joined  ? "1px solid #22C55E40"
                    : ended   ? `1px solid ${border}`
                    : "none",
        }}
      >
        {joined ? (
          <><CheckCircle2 size={12} /> View Submission</>
        ) : ended ? (
          "Quest Ended"
        ) : spotsLeft <= 0 ? (
          "Quest Full"
        ) : (
          <>View Quest <ArrowRight size={12} /></>
        )}
      </Link>
    </div>
  );
}

// ── Quest Concierge floating chat ─────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function QuestConcierge({ wallet, dark }: { wallet: string | null; dark: boolean }) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const bg      = dark ? "#161210" : "#FFFFFF";
  const bgHdr   = dark ? "#1C1510" : "#FAF7F2";
  const border  = dark ? "#2A2018" : "#DDD6C5";
  const text    = dark ? "#F0EAE0" : "#180E02";
  const muted   = dark ? "#6B7280" : "#8C6A3A";
  const inputBg = dark ? "#100D0A" : "#F5F0E8";

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        role: "assistant",
        content: wallet
          ? "Hi! I'm your Quest Concierge. I can check your eligibility for active quests, explain requirements, and help you find the best ones to join. What would you like to know?"
          : "Hi! I'm your Quest Concierge. Connect your wallet and I can check your eligibility for quests. Or just ask me anything about the available campaigns!",
      }]);
    }
  }, [open, messages.length, wallet]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");

    const newHistory: ChatMessage[] = [...messages, { role: "user", content: msg }];
    setMessages(newHistory);
    setLoading(true);

    try {
      const res = await fetch("/api/agent/concierge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          message: msg,
          wallet:  wallet ?? null,
          history: newHistory.slice(-8),  // keep last 8 turns
        }),
      });
      const json = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: json.reply ?? "I'm sorry, something went wrong." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "I'm having trouble connecting. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* FAB — larger, labeled pill so the AI agent is obvious and easy to hit */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-[9990] flex items-center gap-2.5 rounded-full shadow-2xl transition-transform hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(135deg, #D97706, #B45309)",
          boxShadow: "0 8px 28px rgba(185,117,43,0.65)",
          padding: open ? "16px" : "16px 22px",
        }}
        aria-label={open ? "Close Quest Concierge" : "Open Quest Concierge — ask the AI"}
      >
        {open ? (
          <X size={24} color="#FFF" />
        ) : (
          <>
            <Bot size={24} color="#FFF" />
            <span className="hidden sm:inline text-sm font-semibold" style={{ color: "#FFF" }}>
              Ask AI
            </span>
          </>
        )}
      </button>

      {/* Chat window */}
      {open && (
        <div
          className="fixed bottom-24 right-4 left-4 sm:left-auto sm:right-6 z-[9989] sm:w-80 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ background: bg, border: `1px solid ${border}`, height: "420px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 shrink-0"
            style={{ background: bgHdr, borderBottom: `1px solid ${border}` }}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #D97706, #B45309)" }}>
              <Bot size={13} color="#FFF" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold" style={{ color: text }}>Quest Concierge</p>
              <p className="text-[10px]" style={{ color: muted }}>Read-only · Never signs for you</p>
            </div>
            <button onClick={() => setOpen(false)} className="hover:opacity-60 transition-opacity">
              <X size={14} style={{ color: muted }} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed"
                  style={m.role === "user" ? {
                    background: "#D97706",
                    color:      "#FFF8F0",
                    borderBottomRightRadius: "4px",
                  } : {
                    background: dark ? "#1E1710" : "#F5F0E8",
                    color:      text,
                    borderBottomLeftRadius: "4px",
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-3 py-2 flex gap-1" style={{ background: dark ? "#1E1710" : "#F5F0E8" }}>
                  {[0,1,2].map(i => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: muted, animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-2.5 shrink-0" style={{ borderTop: `1px solid ${border}` }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") send(); }}
                placeholder="Ask about quests…"
                className="flex-1 rounded-xl px-3 py-2 text-xs focus:outline-none"
                style={{ background: inputBg, border: `1px solid ${border}`, color: text }}
                disabled={loading}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-opacity hover:opacity-80 disabled:opacity-40"
                style={{ background: "#D97706" }}
              >
                <Send size={12} color="#FFF" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuestsPage() {
  const { dark } = useTheme();

  const { address: keplrAddr } = useWalletStore();

  const walletKey = keplrAddr ?? null;
  const injAddr   = keplrAddr ?? null;

  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [metadataMap,  setMetadataMap]  = useState<Record<number, CampaignMetadataRow>>({});
  const [joinedIds,    setJoinedIds]    = useState<number[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [tab,          setTab]          = useState<"available" | "joined">("available");

  // Theme tokens
  const bg        = dark ? "#0A0A0A" : "#F5F0E8";
  const card      = dark ? "#111111" : "#FFFFFF";
  const border    = dark ? "#1E1E1E" : "#E2DAC8";
  const text      = dark ? "#F5F0E8" : "#180E02";
  const textMuted = dark ? "#6B7280" : "#8C6A3A";
  const inputBg   = dark ? "#111111" : "#FAF7F2";
  const inputBdr  = dark ? "#2A2A2A" : "#DDD6C5";
  const tabActive = "#D97706";

  // Load ALL campaigns (active + ended) so Joined tab can show finished quests
  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setLoading(false); return; }
    queryContract<{ campaigns: Campaign[] }>({ list_campaigns: { limit: 50 } })
      .then(async r => {
        setAllCampaigns(r.campaigns);
        try {
          const ids  = r.campaigns.map(c => c.id);
          const meta = await getCampaignMetadataBatch(ids);
          setMetadataMap(meta);
        } catch { /* non-fatal */ }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load joined campaign IDs from Supabase submissions (per-wallet, persisted)
  useEffect(() => {
    if (!walletKey) { setJoinedIds([]); return; }
    const key = injAddr ?? walletKey;
    getWalletSubmissions(key)
      .then(subs => setJoinedIds(subs.map(s => s.campaign_id)))
      .catch(() => setJoinedIds([]));
  }, [walletKey, injAddr]);

  const matchesSearch = (c: Campaign) =>
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    c.target_platform.toLowerCase().includes(search.toLowerCase());

  // Available: only active, not full, not expired, matching search (fix #12).
  // Expiry matters because the contract auto-rejects submissions once block
  // time passes ends_at, even though the on-chain `status` field still reads
  // "active" (nothing flips it on expiry). Hiding expired campaigns here keeps
  // users from joining a quest that will reject them on submit.
  const nowSec = Math.floor(Date.now() / 1000);
  const available = allCampaigns.filter(c =>
    c.status === "active" &&
    c.ends_at > nowSec &&
    c.participant_count < c.max_participants &&
    matchesSearch(c),
  );

  // Joined: any status, joined by this wallet, matching search
  const joined = allCampaigns.filter(c => joinedIds.includes(c.id) && matchesSearch(c));

  // Badge count = joined IDs that actually resolve to a live campaign (a joinedId
  // can be stale — e.g. a submission from a prior contract — which would make the
  // count exceed the number of cards actually shown). Search-independent.
  const joinedCount = allCampaigns.filter(c => joinedIds.includes(c.id)).length;

  const displayed = tab === "joined" ? joined : available;

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      <AppNav />

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-12">

        {/* Heading */}
        <div className="mb-8">
          <h1
            className="font-bold mb-1"
            style={{ fontSize: "clamp(28px, 4vw, 40px)", letterSpacing: "-0.02em", color: text }}
          >
            Quests
          </h1>
          <p className="text-sm" style={{ color: textMuted }}>
            Participate in campaigns, earn rewards, and build your on-chain reputation
          </p>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-1">
            {(["available", "joined"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: tab === t ? tabActive : "transparent",
                  color:      tab === t ? "#FFF8F0" : textMuted,
                  border:     tab === t ? "none" : `1px solid ${inputBdr}`,
                }}
              >
                {t === "available"
                  ? "Available Quests"
                  : `Joined${joinedCount ? ` (${joinedCount})` : ""}`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: textMuted }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search quests…"
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg focus:outline-none"
              style={{
                background: inputBg,
                border:     `1px solid ${inputBdr}`,
                color:      text,
                width:      "180px",
              }}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div
            className="rounded-xl py-16 text-center"
            style={{ background: card, border: `1px solid ${border}` }}
          >
            <Trophy size={32} className="mx-auto mb-3" style={{ color: textMuted }} />
            {tab === "joined" ? (
              <>
                <p className="text-sm font-medium mb-1" style={{ color: text }}>
                  You haven&apos;t joined any quests yet.
                </p>
                <p className="text-xs" style={{ color: textMuted }}>
                  Browse available quests and start earning rewards.
                </p>
                <button
                  onClick={() => setTab("available")}
                  className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-full text-xs font-medium"
                  style={{ background: "#D97706", color: "#FFF8F0" }}
                >
                  Browse Quests <ArrowRight size={12} />
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1" style={{ color: text }}>
                  No available campaigns at the moment.
                </p>
                <p className="text-xs" style={{ color: textMuted }}>
                  Check back soon or create your own campaign.
                </p>
                <Link
                  href="/campaigns/create"
                  className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-full text-xs font-medium"
                  style={{ background: "#D97706", color: "#FFF8F0" }}
                >
                  Create a Campaign <ArrowRight size={12} />
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayed.map(c => (
              <CampaignCard
                key={c.id}
                c={c}
                joined={joinedIds.includes(c.id)}
                meta={metadataMap[c.id]}
                dark={dark}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Quest Concierge */}
      <QuestConcierge wallet={injAddr} dark={dark} />
    </div>
  );
}
