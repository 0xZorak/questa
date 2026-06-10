"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Zap, BarChart2, Shield, Trophy, Bot, Link2,
  Loader2, TrendingUp,
} from "lucide-react";
import { CONTRACT_ADDRESS, queryContract } from "@/lib/injective";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color: "#D97706" }}>{icon}</span>
      <span className="text-sm font-semibold text-white">{title}</span>
    </div>
  );
}

function Badge({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{
        background: active ? "#4ADE8022" : "#ffffff12",
        color: active ? "#4ADE80" : "#6B7280",
        border: `1px solid ${active ? "#4ADE8033" : "transparent"}`,
      }}
    >
      {label}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: active ? "#4ADE80" : "#374151" }}
    />
  );
}

// ── AI Content Generator ──────────────────────────────────────────────────────
const PLATFORMS = ["Twitter/X", "Discord", "Telegram", "LinkedIn"];
const TONES     = ["Bullish", "Educational", "Community", "FOMO", "Technical"];

const SAMPLE_POST =
  `Just discovered @Injective's Questa — earning $INJ just for sharing quality content. This is the future of brand marketing, fully trustless on-chain. Join the quest now.`;

function AIGeneratorPanel({ landing }: { landing?: boolean }) {
  const [platform, setPlatform] = useState("Twitter/X");
  const [tone,     setTone]     = useState("Bullish");
  const [topic,    setTopic]    = useState(landing ? "Injective Questa campaign" : "");
  const [generated, setGenerated] = useState(landing ? SAMPLE_POST : "");
  const [score,     setScore]     = useState<number | null>(landing ? 92 : null);
  const [loading,   setLoading]   = useState(false);
  const [copied,    setCopied]    = useState(false);

  const generate = async () => {
    if (!topic || landing) return;
    setLoading(true);
    try {
      const res  = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, tone, topic, campaign: "Questa Injective" }),
      });
      const data = await res.json();
      setGenerated(data.content ?? "");
      setScore(data.engagementScore ?? null);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sel =
    "w-full border border-white/10 text-slate-400 rounded-lg px-3 py-1.5 text-xs focus:outline-none cursor-not-allowed select-none";

  return (
    <div className="flex flex-col gap-3 h-full">
      <SectionTitle icon={<Zap size={15} />} title="AI Content Generator" />

      {/* Platform / tone — always visible but disabled on landing */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={platform}
          onChange={e => setPlatform(e.target.value)}
          className={sel}
          style={{ background: "#0D0D0D" }}
          disabled={!!landing}
        >
          {PLATFORMS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select
          value={tone}
          onChange={e => setTone(e.target.value)}
          className={sel}
          style={{ background: "#0D0D0D" }}
          disabled={!!landing}
        >
          {TONES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      <input
        value={topic}
        onChange={e => setTopic(e.target.value)}
        placeholder="Enter topic or key message…"
        className="w-full border border-white/10 text-slate-400 rounded-lg px-3 py-1.5 text-xs focus:outline-none placeholder-slate-600"
        style={{ background: "#0D0D0D", cursor: landing ? "not-allowed" : "text" }}
        disabled={!!landing}
        readOnly={!!landing}
      />

      <button
        onClick={generate}
        disabled={loading || !topic || !!landing}
        className="flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "#D97706", color: "#FFF8F0" }}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
        {loading ? "Generating…" : "Generate"}
      </button>

      {/* Output area */}
      <div
        className="flex-1 min-h-[80px] rounded-lg p-3 flex flex-col justify-between"
        style={{ background: "#0D0D0D", border: "1px solid #1E1E1E" }}
      >
        {generated ? (
          <>
            <p className="text-xs text-slate-300 leading-relaxed">{generated}</p>
            {score !== null && (
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1.5">
                  <TrendingUp size={11} style={{ color: "#4ADE80" }} />
                  <span className="text-xs text-slate-500">Engagement</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: "#D97706" }}>{score}%</span>
                  {!landing && (
                    <button
                      onClick={copy}
                      className="text-xs px-2 py-0.5 rounded font-medium transition-opacity hover:opacity-80"
                      style={{ background: "#1E1E1E", color: "#9CA3AF" }}
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-600 self-center">Generated content appears here</p>
        )}
      </div>

      {landing && (
        <p className="text-xs text-center" style={{ color: "#6B7280" }}>
          Connect your wallet to generate custom content
        </p>
      )}
    </div>
  );
}

// ── Shared on-chain stats type ────────────────────────────────────────────────
type OnchainStats = {
  totalCampaigns: number;
  totalParticipants: number;
  totalDistributed: number; // INJ
  activePool: number;       // INJ across active campaigns
  activeParticipants: number;
  avgParticipants: number;
};

// ── Campaign Analytics ────────────────────────────────────────────────────────
function AnalyticsPanel({ stats }: { stats: OnchainStats | null }) {
  // Animated bar heights — poll data every 4 s and smoothly update
  const BASE_BARS = [2, 4, 3, 6, 5, 7, 4, 8, 6, 9, 7, 10];
  const [bars, setBars] = useState(BASE_BARS);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTick(t => t + 1);
      // Shift left and append a new value based on stats or random
      setBars(prev => {
        const live = stats ? Math.min(10, Math.round(stats.totalParticipants / 5)) : Math.floor(Math.random() * 8) + 3;
        return [...prev.slice(1), live];
      });
    }, 3_000);
    return () => clearInterval(id);
  }, [stats]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <SectionTitle icon={<BarChart2 size={15} />} title="Platform Analytics" />
      {/* Only chart — stat grid moved above in HeroStats */}
      <div className="flex-1 rounded-lg p-3 flex flex-col justify-end" style={{ background: "#0D0D0D" }}>
        <div className="flex items-end gap-1 h-28">
          {bars.map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                height: `${(h / 10) * 100}%`,
                background: "linear-gradient(to top, #D97706, #F59E0B)",
                opacity: 0.3 + (i / bars.length) * 0.7,
                transition: "height 0.8s cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-slate-600">Campaign activity</p>
          <p className="text-xs" style={{ color: "#4ADE80" }}>● Live</p>
        </div>
      </div>
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-2.5" style={{ background: "#0D0D0D" }}>
            <p className="text-[10px] text-slate-600">Total Campaigns</p>
            <p className="text-sm font-bold text-white">{stats.totalCampaigns}</p>
          </div>
          <div className="rounded-lg p-2.5" style={{ background: "#0D0D0D" }}>
            <p className="text-[10px] text-slate-600">INJ Distributed</p>
            <p className="text-sm font-bold text-white">{stats.totalDistributed.toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reward Engine ─────────────────────────────────────────────────────────────
function RewardContractsPanel({ stats }: { stats: OnchainStats | null }) {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(n % 1 === 0 ? 0 : 2));

  const metrics = [
    { label: "Active pool",     value: stats ? `${fmt(stats.activePool)} INJ`     : "—", color: "#D97706" },
    { label: "INJ distributed", value: stats ? `${fmt(stats.totalDistributed)} INJ` : "—", color: "#4ADE80" },
    { label: "Campaigns",       value: stats ? `${stats.totalCampaigns}`           : "—", color: "#F5F0E8" },
    { label: "Participants",    value: stats ? `${stats.activeParticipants}`        : "—", color: "#F5F0E8" },
  ];

  const flow = [
    { icon: <Trophy size={12} />, label: "Participant submits", desc: "Joins on-chain via Keplr",        color: "#60A5FA" },
    { icon: <Bot size={12} />,    label: "AI Verifier scores",  desc: "Approves real work, rejects spam", color: "#A78BFA" },
    { icon: <Zap size={12} />,    label: "Auto-distribute",     desc: "INJ paid when full or time-ends",  color: "#4ADE80" },
  ];

  return (
    <div className="flex flex-col gap-3 h-full">
      <SectionTitle icon={<Zap size={15} />} title="Reward Engine" />

      {/* Live on-chain metrics */}
      <div className="grid grid-cols-2 gap-2">
        {metrics.map(m => (
          <div key={m.label} className="rounded-lg p-3" style={{ background: "#0D0D0D", border: "1px solid #1E1E1E" }}>
            <p className="text-[10px] text-slate-500 mb-1">{m.label}</p>
            <p className="text-lg font-bold" style={{ color: m.color }}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Automated payout flow */}
      <div className="space-y-2">
        <p className="text-xs text-slate-500 font-medium">Automated payout</p>
        {flow.map((f, i) => (
          <div key={f.label} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 relative"
            style={{ background: "#0D0D0D", border: "1px solid #1E1E1E" }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
              style={{ background: f.color + "1A", color: f.color }}>
              {f.icon}
            </div>
            <div className="flex-1">
              <p className="text-xs text-white font-medium">{f.label}</p>
              <p className="text-[11px] text-slate-600">{f.desc}</p>
            </div>
            <span className="text-[10px] text-slate-700 font-mono">{i + 1}</span>
          </div>
        ))}
      </div>

      {/* Trustless callout */}
      <div className="rounded-lg p-3 text-xs mt-auto flex items-center gap-2"
        style={{ background: "#4ADE8010", border: "1px solid #4ADE8022", color: "#4ADE80" }}>
        <Shield size={13} className="shrink-0" />
        <span>CosmWasm smart contract on Injective — no manual payouts, no custody.</span>
      </div>
    </div>
  );
}

// ── Active Quests ─────────────────────────────────────────────────────────────
type Campaign = {
  id: number;
  title: string;
  target_platform: string;
  reward_pool: string;
  participant_count: number;
  max_participants: number;
  status: string;
  ends_at: number;
};

const PLATFORM_COLOR: Record<string, string> = {
  twitter: "#1DA1F2", discord: "#5865F2", telegram: "#26A5E4", linkedin: "#0A66C2",
};

function ActiveQuestsPanel() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) { setLoading(false); return; }
    // Fetch a wider slice, then show only genuinely-live quests: active status,
    // not past ends_at, and not full. The on-chain status stays "active" after
    // expiry, so an explicit time + fill check is required.
    queryContract<{ campaigns: Campaign[] }>({ list_campaigns: { limit: 30 } })
      .then(r => {
        const now = Math.floor(Date.now() / 1000);
        const live = r.campaigns.filter(c =>
          c.status === "active" &&
          c.ends_at > now &&
          c.participant_count < c.max_participants,
        );
        setCampaigns(live.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Trophy size={15} />} title="Active Quests" />
        <Link href="/quests" className="text-xs transition-opacity hover:opacity-70" style={{ color: "#D97706" }}>
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={16} className="animate-spin" style={{ color: "#D97706" }} />
        </div>
      ) : campaigns.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl py-10"
          style={{ background: "#0D0D0D", border: "1px dashed #2A2A2A" }}
        >
          <Trophy size={24} style={{ color: "#374151" }} />
          <div className="text-center">
            <p className="text-xs font-medium text-slate-400">No active quests at the moment</p>
            <p className="text-xs text-slate-600 mt-0.5">Check back soon or create a campaign</p>
          </div>
          <Link
            href="/campaigns/create"
            className="text-xs px-3 py-1.5 rounded-full font-medium transition-opacity hover:opacity-80"
            style={{ background: "#D97706", color: "#FFF8F0" }}
          >
            Create Campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map(c => {
            const color = PLATFORM_COLOR[c.target_platform.toLowerCase()] ?? "#D97706";
            const inj   = (Number(c.reward_pool) / 1e18).toFixed(2);
            return (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5"
                style={{ background: "#0D0D0D" }}
              >
                <div>
                  <p className="text-xs text-white font-medium">{c.title}</p>
                  <p className="text-xs" style={{ color }}>{c.target_platform} · {inj} INJ</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">{c.participant_count}/{c.max_participants}</p>
                  <p className="text-xs text-slate-600">joined</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── AI Agents ─────────────────────────────────────────────────────────────────
function AgentsPanel() {
  const agents = [
    {
      name:   "Verifier Agent",
      desc:   "Automatically verifies submissions — detects spam, sybil wallets, and off-topic content via DeepSeek AI",
      color:  "#4ADE80",
      label:  "Auto-runs on submit",
    },
    {
      name:   "Campaign Copilot",
      desc:   "Analyzes live participation trends and surfaces optimization recommendations for campaign creators",
      color:  "#A78BFA",
      label:  "Creator-facing insights",
    },
    {
      name:   "Quest Concierge",
      desc:   "Guides participants through quest requirements via chat — answers questions and helps them earn rewards",
      color:  "#38BDF8",
      label:  "Participant helper",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionTitle icon={<Bot size={15} />} title="AI Agents" />
        <Badge label="3 ONLINE" active />
      </div>
      <div className="space-y-3">
        {agents.map(a => (
          <div
            key={a.name}
            className="rounded-lg px-3 py-2.5"
            style={{ background: "#0D0D0D", border: `1px solid ${a.color}22` }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
              <p className="text-xs text-white font-semibold">{a.name}</p>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full"
                style={{ background: a.color + "18", color: a.color }}>
                {a.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{a.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Integrations ─────────────────────────────────────────────────────────────
const INTEGRATION_ITEMS = [
  { id: "injective", label: "Injective",   color: "#0082FA", desc: "Layer-1 blockchain" },
  { id: "twitter",   label: "Twitter / X", color: "#1DA1F2", desc: "Social platform"    },
  { id: "deepseek",  label: "DeepSeek AI", color: "#7C3AED", desc: "AI content engine"  },
];

function IntegrationsPanel() {
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle icon={<Link2 size={15} />} title="Integrations" />

      <div className="space-y-2">
        {INTEGRATION_ITEMS.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5"
            style={{ background: item.color + "10", border: `1px solid ${item.color}25` }}
          >
            <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white">{item.label}</p>
              <p className="text-xs" style={{ color: "#6B7280" }}>{item.desc}</p>
            </div>
            <Badge label="LIVE" active />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── macOS window chrome ───────────────────────────────────────────────────────
function TitleBar() {
  return (
    <div
      className="flex items-center justify-between px-5 py-3.5 relative shrink-0"
      style={{ background: "#1C1C1C", borderBottom: "1px solid #2A2A2A" }}
    >
      {/* Traffic lights */}
      <div className="flex items-center gap-2 z-10">
        <div className="w-3 h-3 rounded-full" style={{ background: "#FF5F56" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#FFBD2E" }} />
        <div className="w-3 h-3 rounded-full" style={{ background: "#27C93F" }} />
      </div>

      {/* Centered title */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-xs font-semibold text-slate-300">Questa Dashboard</p>
        <p className="text-xs text-slate-600">Web3 Content &amp; Campaign Management</p>
      </div>

      {/* Status badge */}
      <div
        className="flex items-center gap-1.5 z-10 px-3 py-1 rounded-full"
        style={{ background: "#0D0D0D", border: "1px solid #2A2A2A" }}
      >
        <StatusDot active />
        <span className="text-xs text-slate-400">Injective Testnet</span>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DashboardCard({ landing }: { landing?: boolean }) {
  const [onchainStats, setOnchainStats] = useState<OnchainStats | null>(null);

  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;

    const fetchStats = () => {
      Promise.all([
        queryContract<{ total_campaigns: number; total_participants: number; total_rewards_distributed: string }>(
          { get_stats: {} }
        ),
        queryContract<{ campaigns: Campaign[] }>({ list_campaigns: { limit: 100 } }),
      ])
        .then(([s, c]) => {
          const active             = c.campaigns.filter(x => x.status === "active");
          const activePool         = active.reduce((sum, x) => sum + Number(x.reward_pool) / 1e18, 0);
          const activeParticipants = active.reduce((sum, x) => sum + x.participant_count, 0);
          setOnchainStats({
            totalCampaigns:    s.total_campaigns,
            totalParticipants: s.total_participants,
            totalDistributed:  Number(s.total_rewards_distributed) / 1e18,
            activePool,
            activeParticipants,
            avgParticipants:   s.total_campaigns > 0 ? s.total_participants / s.total_campaigns : 0,
          });
        })
        .catch(() => {});
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15_000); // refresh every 15 s
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="rounded-2xl overflow-hidden mx-4 md:mx-8 lg:mx-16 my-10"
      style={{
        background: "#111111",
        border: "1px solid #2A2A2A",
      }}
    >
      <TitleBar />

      {/* Top row */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-px"
        style={{ background: "#2A2A2A", borderBottom: "1px solid #2A2A2A" }}
      >
        {[
          <AIGeneratorPanel    key="ai"        landing={landing}           />,
          <AnalyticsPanel      key="analytics" stats={onchainStats}        />,
          <RewardContractsPanel key="contracts" stats={onchainStats}       />,
        ].map((panel, i) => (
          <div key={i} className="p-5 min-h-[300px]" style={{ background: "#111111" }}>
            {panel}
          </div>
        ))}
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px" style={{ background: "#2A2A2A" }}>
        {[
          <ActiveQuestsPanel key="quests"       />,
          <AgentsPanel       key="agents"       />,
          <IntegrationsPanel key="integrations" />,
        ].map((panel, i) => (
          <div key={i} className="p-5" style={{ background: "#111111" }}>
            {panel}
          </div>
        ))}
      </div>
    </div>
  );
}
