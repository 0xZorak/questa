"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Copy, Check, ExternalLink, Users, Coins,
  Clock, Calendar, Trophy, AlertTriangle,
  Loader2, CheckCircle2, Ban, BarChart2,
  FileText, Zap, Bot, Sparkles, RefreshCw,
  TrendingUp, ThumbsUp, ThumbsDown, Flag,
} from "lucide-react";
import AppNav from "@/components/AppNav";
import { useToast } from "@/components/Toast";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import {
  queryContract, CONTRACT_ADDRESS,
} from "@/lib/injective";
import { getDisplayNames, getCampaignSubmissions } from "@/lib/supabase";
import type { SubmissionWithVerdict } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type CopilotInsights = {
  participation_rate:     number;
  velocity:               "fast" | "steady" | "slow";
  projected_fill:         "full" | "partial" | "low";
  sentiment:              "strong" | "good" | "weak";
  sentiment_label:        string;
  urgency:                "high" | "medium" | "low";
  urgency_message:        string;
  top_recommendation:     string;
  additional_tips:        string[];
};

type Campaign = {
  id: number;
  creator: string;
  title: string;
  description: string;
  target_platform: string;
  reward_pool: string;
  duration_days: number;
  max_participants: number;
  participant_count: number;
  status: string;
  created_at: number;
  ends_at: number;
  distributed: boolean;
};

type Participant = {
  address: string;
  content_hash: string | null;
  post_url: string | null;
  joined_at: number;
  reward_claimed: boolean;
  reward_amount: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const TX_KEY     = (id: number) => `rb_campaign_${id}_tx`;
const SHORT      = (s: string)  => `${s.slice(0, 8)}…${s.slice(-6)}`;
const INJ        = (wei: string) => (Number(BigInt(wei)) / 1e18).toFixed(4);
const DATE       = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const STATUS_CFG: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
  active:      { label: "Active",      bg: "#ADC6A322", color: "#5A7A52",  icon: <CheckCircle2 size={13} /> },
  filled:      { label: "Filled",      bg: "#B9752B22", color: "#B9752B",  icon: <Users size={13} />        },
  ended:       { label: "Ended",       bg: "#B9752B22", color: "#B9752B",  icon: <Clock size={13} />        },
  cancelled:   { label: "Cancelled",   bg: "#DC262618", color: "#DC2626",  icon: <Ban size={13} />          },
  distributed: { label: "Distributed", bg: "#3B82F618", color: "#3B82F6",  icon: <Coins size={13} />        },
};

/** Time/fill-aware status — the on-chain `status` stays "active" after a campaign
 *  fills or its end time passes, so derive the real display status here. */
function effectiveStatus(c: {
  status: string; ends_at: number; participant_count: number; max_participants: number; distributed: boolean;
}): string {
  if (c.distributed) return "distributed";
  const s = c.status.toLowerCase();
  if (s === "cancelled") return "cancelled";
  if (c.participant_count >= c.max_participants) return "filled";
  if (Math.floor(Date.now() / 1000) > c.ends_at) return "ended";
  return s;
}

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CFG[status.toLowerCase()] ?? STATUS_CFG["ended"];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

function CopyButton({ text, C }: { text: string; C: Pal }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
      style={{ background: copied ? "#ADC6A322" : C.sectionHd, border: `1px solid ${C.border}`, color: copied ? "#5A7A52" : C.textMuted }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Palette type ──────────────────────────────────────────────────────────────
type Pal = {
  page: string; card: string; sectionHd: string; border: string;
  text: string; textMed: string; textMuted: string;
  amber: string; amberBg: string; amberBorder: string;
  error: string; errorBg: string; errorBorder: string;
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const campaignId    = Number(idStr);

  const { dark }               = useTheme();
  const { toast }              = useToast();
  const { address: keplrAddr } = useWalletStore();
  const router                 = useRouter();

  const injAddr   = keplrAddr ?? null;
  const walletKey = keplrAddr ?? null;

  const [campaign,      setCampaign]      = useState<Campaign | null>(null);
  const [participants,  setParticipants]  = useState<Participant[]>([]);
  const [txHash,        setTxHash]        = useState<string | null>(null);
  const [displayNames,  setDisplayNames]  = useState<Record<string, string | null>>({});
  const [loadingPage,   setLoadingPage]   = useState(true);
  const [pageError,     setPageError]     = useState("");
  // distribute/cancel removed — handled automatically by AI agent
  // Agent state
  const [submissions,      setSubmissions]      = useState<SubmissionWithVerdict[]>([]);
  const [agentRunning,     setAgentRunning]     = useState(false);
  const [agentResult,      setAgentResult]      = useState<{ approved: number; rejected: number; flagged: number } | null>(null);
  const [insights,         setInsights]         = useState<CopilotInsights | null>(null);
  const [loadingInsights,  setLoadingInsights]  = useState(false);

  // Load campaign + participants
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !campaignId) return;
    setLoadingPage(true);
    setPageError("");

    Promise.all([
      queryContract<Campaign>({ get_campaign: { campaign_id: campaignId } }),
      queryContract<{ participants: Participant[] }>({ get_participants: { campaign_id: campaignId } }),
    ])
      .then(async ([c, p]) => {
        setCampaign(c);
        const parts = p.participants ?? [];
        setParticipants(parts);
        try { setTxHash(localStorage.getItem(TX_KEY(campaignId))); } catch { /* storage restricted */ }

        // Auto-distribute trigger: if this campaign is done (filled or past its
        // end time) but not yet distributed, nudge the agent. Idempotent + gated
        // server-side, so safe to fire on every view.
        const nowSec = Math.floor(Date.now() / 1000);
        const done   = c.participant_count >= c.max_participants || nowSec > c.ends_at;
        if (done && !c.distributed && c.status?.toLowerCase() !== "cancelled") {
          fetch("/api/agent/distribute", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ campaign_id: campaignId }),
          }).catch(() => {});
        }
        // Batch-load display names from Supabase for all participant addresses
        if (parts.length > 0) {
          const names = await getDisplayNames(parts.map(pt => pt.address));
          setDisplayNames(names);
        }
        // Load Supabase submissions with agent verdicts
        try {
          const subs = await getCampaignSubmissions(campaignId);
          setSubmissions(subs as SubmissionWithVerdict[]);
        } catch { /* non-fatal */ }
      })
      .catch(e => setPageError(e?.message ?? "Failed to load campaign"))
      .finally(() => setLoadingPage(false));
  }, [campaignId]);

  // Run verifier agent on demand
  const runVerifierAgent = async () => {
    if (!campaignId || agentRunning) return;
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const res  = await fetch("/api/agent/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ campaign_id: campaignId }),
      });
      const json = await res.json();
      setAgentResult(json);
      toast.success(`Agent done: ${json.approved} approved, ${json.rejected} rejected, ${json.flagged} flagged`);
      // Reload submissions
      const subs = await getCampaignSubmissions(campaignId);
      setSubmissions(subs as SubmissionWithVerdict[]);
    } catch (e: any) {
      toast.error("Verifier agent failed: " + (e?.message ?? "Unknown error"));
    } finally {
      setAgentRunning(false);
    }
  };

  // Load copilot insights
  const loadInsights = async () => {
    if (!campaign || loadingInsights) return;
    setLoadingInsights(true);
    try {
      const res = await fetch("/api/agent/copilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode:              "insights",
          campaign_id:       campaign.id,
          title:             campaign.title,
          description:       campaign.description,
          platform:          campaign.target_platform,
          participant_count: campaign.participant_count,
          max_participants:  campaign.max_participants,
          created_at:        campaign.created_at,
          ends_at:           campaign.ends_at,
          status:            campaign.status,
          reward_pool_inj:   Number(BigInt(campaign.reward_pool)) / 1e18,
          submissions:       participants.map(p => ({ post_url: p.post_url, joined_at: p.joined_at })),
        }),
      });
      const json = await res.json() as CopilotInsights & { error?: string };
      if (!json.error) setInsights(json);
    } catch { /* non-fatal */ }
    finally { setLoadingInsights(false); }
  };

  const isCreator = !!(injAddr && campaign && injAddr.toLowerCase() === campaign.creator.toLowerCase());

  // Access control: the admin dashboard belongs to the creator wallet only. If a
  // *different* wallet is connected (e.g. the user switches accounts), kick them
  // back to /quests. A disconnected visitor gets the connect-gate render below.
  useEffect(() => {
    if (!campaign || !injAddr) return;
    if (injAddr.toLowerCase() !== campaign.creator.toLowerCase()) {
      router.replace("/quests");
    }
  }, [campaign, injAddr, router]);

  // ── Palette ─────────────────────────────────────────────────────────────────
  const C: Pal = {
    page:        dark ? "#0D0A07"   : "#F5F0E8",
    card:        dark ? "#1A1510"   : "#FFFFFF",
    sectionHd:   dark ? "#1C1510"   : "#EDE8DF",
    border:      dark ? "#2A2018"   : "#E2DAC8",
    text:        dark ? "#F0EAE0"   : "#180E02",
    textMed:     dark ? "#D5CABD"   : "#4A3520",
    textMuted:   dark ? "#7A6855"   : "#8C6A3A",
    amber:       "#B9752B",
    amberBg:     dark ? "#B9752B1C" : "#B9752B14",
    amberBorder: dark ? "#B9752B4A" : "#B9752B40",
    error:       dark ? "#F87171"   : "#DC2626",
    errorBg:     dark ? "#7F1D1D20" : "#FEE2E220",
    errorBorder: dark ? "#F8717140" : "#FCA5A540",
  };

  const card2 = { background: C.card, border: `1px solid ${C.border}`, borderRadius: "16px", overflow: "hidden" as const };
  const hd    = { background: C.sectionHd, borderBottom: `1px solid ${C.border}` };

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loadingPage) {
    return (
      <div style={{ background: C.page, minHeight: "100vh" }}>
        <AppNav />
        <div className="flex justify-center items-center py-32">
          <Loader2 size={24} className="animate-spin" style={{ color: C.amber }} />
        </div>
      </div>
    );
  }

  if (pageError || !campaign) {
    return (
      <div style={{ background: C.page, minHeight: "100vh" }}>
        <AppNav />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-sm" style={{ color: C.error }}>{pageError || "Campaign not found."}</p>
          <Link href="/campaigns" className="text-sm mt-4 inline-block" style={{ color: C.amber }}>← Back to campaigns</Link>
        </div>
      </div>
    );
  }

  // Owner-only gate. A different wallet is already being redirected by the effect
  // above; this covers the disconnected / wrong-wallet visitor so the dashboard
  // never renders for anyone but the campaign creator.
  if (!isCreator) {
    return (
      <div style={{ background: C.page, minHeight: "100vh" }}>
        <AppNav />
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
            style={{ background: C.amberBg }}>
            <Ban size={22} style={{ color: C.amber }} />
          </div>
          <h2 className="text-base font-bold mb-2" style={{ color: C.text }}>Owner access only</h2>
          <p className="text-sm mb-6" style={{ color: C.textMuted }}>
            {walletKey
              ? "This admin dashboard is only accessible to the wallet that created this campaign."
              : "Connect the wallet that created this campaign to access its admin dashboard."}
          </p>
          <Link href="/quests" className="text-sm px-4 py-2 rounded-full inline-block"
            style={{ background: C.amber, color: "#FFF8F0" }}>
            Browse quests
          </Link>
        </div>
      </div>
    );
  }

  const poolInj    = INJ(campaign.reward_pool);
  const poolNum    = parseFloat(poolInj);
  const feeNum     = +(poolNum * (0.05 / 1.05)).toFixed(4);
  const creatorAmt = +(poolNum - feeNum).toFixed(4);
  const fillPct    = campaign.max_participants > 0
    ? Math.min(100, Math.round((campaign.participant_count / campaign.max_participants) * 100))
    : 0;

  return (
    <div style={{ background: C.page, minHeight: "100vh" }}>
      <AppNav />

      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center justify-between mb-6 gap-4">
          <Link
            href="/campaigns"
            className="flex items-center gap-1.5 text-sm transition-opacity hover:opacity-70"
            style={{ color: C.textMuted }}
          >
            <ArrowLeft size={14} /> My Campaigns
          </Link>
          {/* Rewards are distributed automatically by the AI agent */}
          {campaign.distributed && (
            <span className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1"
              style={{ background: "#ADC6A322", color: "#5A7A52" }}>
              <Check size={11} /> Rewards distributed
            </span>
          )}
        </div>

        {/* Title + status */}
        <div className="flex items-start gap-3 mb-2 flex-wrap">
          <h1
            className="flex-1"
            style={{ fontSize: "clamp(20px, 3vw, 28px)", fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}
          >
            {campaign.title}
          </h1>
          <StatusPill status={effectiveStatus(campaign)} />
        </div>
        <p className="text-sm mb-8" style={{ color: C.textMuted }}>
          Campaign #{campaign.id} · {campaign.target_platform} · created {DATE(campaign.created_at)}
        </p>

        {/* AI agent handles distribution automatically */}
        {isCreator && !campaign.distributed && campaign.status?.toLowerCase() !== "cancelled" && (() => {
          const done = campaign.participant_count >= campaign.max_participants
            || Math.floor(Date.now() / 1000) > campaign.ends_at;
          return (
            <div className="mb-6 rounded-xl p-4 flex items-center gap-3"
              style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}` }}>
              <Bot size={14} style={{ color: C.amber }} />
              <p className="text-sm" style={{ color: C.amber }}>
                {done
                  ? "This campaign is complete. The agent is distributing rewards on-chain — refresh in a moment."
                  : "The Verifier Agent is running automatically. Rewards distribute on-chain the moment this campaign fills or its end time passes."}
              </p>
            </div>
          );
        })()}

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { icon: <Coins size={15} />,    label: "Reward Pool",    val: `${poolInj} INJ`                            },
            { icon: <Users size={15} />,    label: "Participants",   val: `${campaign.participant_count} / ${campaign.max_participants}` },
            { icon: <Calendar size={15} />, label: "Duration",       val: `${campaign.duration_days} day${campaign.duration_days !== 1 ? "s" : ""}` },
            { icon: <Clock size={15} />,    label: "Ends",           val: DATE(campaign.ends_at)                       },
          ].map(({ icon, label, val }) => (
            <div key={label} className="rounded-2xl p-4" style={card2}>
              <div className="flex items-center gap-1.5 mb-2" style={{ color: C.textMuted }}>
                {icon}
                <span className="text-xs">{label}</span>
              </div>
              <p className="text-sm font-bold" style={{ color: C.text }}>{val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* ── Campaign Info ── */}
          <div style={card2}>
            <div className="px-5 py-3.5 flex items-center gap-2" style={hd}>
              <FileText size={13} style={{ color: C.textMuted }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Campaign Info</p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>Description</p>
                <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: C.text }}>{campaign.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>Creator</p>
                  <p className="text-xs font-mono truncate" style={{ color: C.textMed }}>{SHORT(campaign.creator)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>Platform</p>
                  <div className="flex items-center gap-1.5">
                    <Zap size={12} style={{ color: "#1DA1F2" }} />
                    <p className="text-xs capitalize" style={{ color: C.textMed }}>{campaign.target_platform}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>Max spots</p>
                  <p className="text-xs" style={{ color: C.textMed }}>{campaign.max_participants}</p>
                </div>
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: C.textMuted }}>Distributed</p>
                  <p className="text-xs" style={{ color: campaign.distributed ? "#5A7A52" : C.textMuted }}>
                    {campaign.distributed ? "Yes" : "Pending"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Funding Status ── */}
          <div style={card2}>
            <div className="px-5 py-3.5 flex items-center gap-2" style={hd}>
              <BarChart2 size={13} style={{ color: C.textMuted }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Funding Status</p>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { label: "Campaign reward pool", val: `${creatorAmt} INJ`, highlight: true },
                { label: "Platform fee (5%)",    val: `${feeNum} INJ`,     highlight: false },
                { label: "Total deposited",      val: `${poolInj} INJ`,    highlight: false },
              ].map(({ label, val, highlight }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: C.textMuted }}>{label}</span>
                  <span className="text-xs font-semibold" style={{ color: highlight ? C.amber : C.textMed }}>{val}</span>
                </div>
              ))}

              <div className="pt-2 border-t" style={{ borderColor: C.border }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs" style={{ color: C.textMuted }}>Participant fill</span>
                  <span className="text-xs font-semibold" style={{ color: C.amber }}>{fillPct}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: C.border }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${fillPct}%`, background: C.amber }} />
                </div>
                <p className="text-xs mt-1.5" style={{ color: C.textMuted }}>
                  {campaign.participant_count} of {campaign.max_participants} spots filled
                </p>
              </div>

              {campaign.distributed && (
                <div className="rounded-lg p-3 flex items-center gap-2"
                  style={{ background: "#ADC6A322", border: "1px solid #ADC6A355" }}>
                  <CheckCircle2 size={13} style={{ color: "#5A7A52" }} />
                  <p className="text-xs font-medium" style={{ color: "#5A7A52" }}>Rewards distributed on-chain</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Transaction ── */}
        <div className="mb-4" style={card2}>
          <div className="px-5 py-3.5 flex items-center gap-2" style={hd}>
            <Zap size={13} style={{ color: C.textMuted }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Transaction</p>
          </div>
          <div className="px-5 py-4">
            {txHash ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-mono break-all flex-1" style={{ color: C.text }}>{txHash}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <CopyButton text={txHash} C={C} />
                    <a
                      href={`https://testnet.explorer.injective.network/transaction/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                      style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, color: C.amber }}
                    >
                      <ExternalLink size={11} /> Explorer
                    </a>
                  </div>
                </div>
                <a
                  href={`https://testnet.explorer.injective.network/contract/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: C.textMuted }}
                >
                  Contract: {CONTRACT_ADDRESS}
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: C.textMuted }}>
                  Transaction hash not stored locally. View all contract transactions on explorer.
                </p>
                <a
                  href={`https://testnet.explorer.injective.network/contract/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70 shrink-0 ml-4"
                  style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}`, color: C.amber }}
                >
                  <ExternalLink size={11} /> View on Explorer
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── Quest Tasks ── */}
        <div className="mb-4" style={card2}>
          <div className="px-5 py-3.5 flex items-center gap-2" style={hd}>
            <Trophy size={13} style={{ color: C.textMuted }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>Quest Tasks</p>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-2.5">
              {[
                { icon: <Zap     size={13} style={{ color: "#1DA1F2" }} />, text: `Post on ${campaign.target_platform} about this campaign` },
                { icon: <Clock    size={13} style={{ color: C.amber    }} />, text: `Campaign runs for ${campaign.duration_days} day${campaign.duration_days !== 1 ? "s" : ""} — from ${DATE(campaign.created_at)} to ${DATE(campaign.ends_at)}` },
                { icon: <Users    size={13} style={{ color: C.textMuted }} />, text: `Limited to ${campaign.max_participants} participant${campaign.max_participants !== 1 ? "s" : ""}` },
                { icon: <Coins    size={13} style={{ color: C.amber    }} />, text: `Reward pool: ${creatorAmt} INJ split across all verified participants` },
              ].map(({ icon, text }, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: C.sectionHd }}>
                  <span className="shrink-0 mt-0.5">{icon}</span>
                  <p className="text-xs leading-relaxed" style={{ color: C.textMed }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Copilot Insights panel (creator only) ── */}
        {isCreator && (
          <div style={card2}>
            <div className="px-5 py-3.5 flex items-center justify-between" style={hd}>
              <div className="flex items-center gap-2">
                <Sparkles size={13} style={{ color: "#8B5CF6" }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
                  Copilot Insights
                </p>
              </div>
              <button
                onClick={loadInsights}
                disabled={loadingInsights}
                className="text-xs flex items-center gap-1.5 px-3 py-1 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                style={{ background: "#8B5CF620", color: "#8B5CF6", border: "1px solid #8B5CF640" }}
              >
                {loadingInsights ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                {insights ? "Refresh" : "Analyze"}
              </button>
            </div>
            {insights ? (
              <div className="px-5 py-4 space-y-4">
                {/* Sentiment / urgency row */}
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                    style={{ background: insights.sentiment === "strong" ? "#4ADE8018" : insights.sentiment === "weak" ? "#F8717118" : "#FCD34D18",
                             border:     `1px solid ${insights.sentiment === "strong" ? "#4ADE8040" : insights.sentiment === "weak" ? "#F8717140" : "#FCD34D40"}`,
                             color:      insights.sentiment === "strong" ? "#4ADE80" : insights.sentiment === "weak" ? "#F87171" : "#FCD34D" }}>
                    <TrendingUp size={12} />
                    <span className="text-xs font-semibold">{insights.sentiment_label}</span>
                  </div>
                  <div className="rounded-xl px-3 py-2 flex items-center gap-2"
                    style={{ background: "#60A5FA18", border: "1px solid #60A5FA40", color: "#60A5FA" }}>
                    <span className="text-xs">{insights.participation_rate}% filled · {insights.velocity} velocity</span>
                  </div>
                </div>
                {/* Top recommendation */}
                <div className="rounded-xl p-3" style={{ background: C.sectionHd }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: C.text }}>Top recommendation</p>
                  <p className="text-xs leading-relaxed" style={{ color: C.textMuted }}>{insights.top_recommendation}</p>
                </div>
                {/* Additional tips */}
                {insights.additional_tips?.length > 0 && (
                  <div className="space-y-1.5">
                    {insights.additional_tips.map((tip, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span style={{ color: C.amber, marginTop: 2 }}>·</span>
                        <p className="text-xs leading-relaxed" style={{ color: C.textMuted }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-5 py-6 text-center">
                <Sparkles size={20} className="mx-auto mb-2 opacity-40" style={{ color: "#8B5CF6" }} />
                <p className="text-xs" style={{ color: C.textMuted }}>
                  Click Analyze to get AI insights about participation trends and recommendations.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Participants ── */}
        <div className="mt-6" style={card2}>
          <div className="px-5 py-3.5 flex items-center justify-between" style={hd}>
            <div className="flex items-center gap-2">
              <Users size={13} style={{ color: C.textMuted }} />
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: C.textMuted }}>
                Participants
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Verifier status — informational only (runs automatically) */}
              {isCreator && (
                <span
                  className="text-xs flex items-center gap-1.5 px-3 py-1 rounded-lg"
                  style={{ background: "#4ADE8018", color: "#4ADE80", border: "1px solid #4ADE8040" }}
                >
                  <Bot size={10} /> Verifier online
                </span>
              )}
              <span
                className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{ background: C.amberBg, color: C.amber, border: `1px solid ${C.amberBorder}` }}
              >
                {participants.length} joined
              </span>
            </div>
          </div>

          {participants.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Users size={24} className="mx-auto mb-3" style={{ color: C.textMuted }} />
              <p className="text-sm font-medium mb-1" style={{ color: C.text }}>No participants yet</p>
              <p className="text-xs" style={{ color: C.textMuted }}>
                Participants will appear here once they join and submit content.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {["Wallet", "Joined", "Content", "AI Verdict", "Reward", "Status"].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold"
                        style={{ color: C.textMuted, background: C.sectionHd }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {participants.map((p, i) => {
                    const rewardInj = (Number(BigInt(p.reward_amount || "0")) / 1e18).toFixed(4);
                    return (
                      <tr
                        key={i}
                        style={{ borderBottom: `1px solid ${C.border}` }}
                      >
                        <td className="px-5 py-3.5">
                          <div>
                            {displayNames[p.address] && (
                              <p className="text-xs font-semibold mb-0.5" style={{ color: C.text }}>
                                {displayNames[p.address]}
                              </p>
                            )}
                            <span className="text-xs font-mono" style={{ color: C.textMed }}>
                              {SHORT(p.address)}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs" style={{ color: C.textMuted }}>
                            {DATE(p.joined_at)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {p.post_url ? (
                            <a
                              href={p.post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                              style={{ color: C.amber }}
                            >
                              <ExternalLink size={11} /> View post
                            </a>
                          ) : (
                            <span className="text-xs" style={{ color: C.textMuted }}>—</span>
                          )}
                        </td>
                        {/* AI Verdict cell */}
                        <td className="px-5 py-3.5">
                          {(() => {
                            const sub = submissions.find(s => s.wallet_address === p.address);
                            if (!sub?.agent_verdict) {
                              return <span className="text-xs" style={{ color: C.textMuted }}>—</span>;
                            }
                            const verdict = sub.agent_verdict;
                            const override = sub.creator_override;
                            const displayVerdict = override ?? verdict;
                            const vColor = displayVerdict === "approve" ? "#4ADE80"
                              : displayVerdict === "reject" ? "#F87171"
                              : "#FCD34D";
                            return (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  {displayVerdict === "approve" ? <ThumbsUp size={10} style={{ color: vColor }} />
                                    : displayVerdict === "reject" ? <ThumbsDown size={10} style={{ color: vColor }} />
                                    : <Flag size={10} style={{ color: vColor }} />}
                                  <span className="text-xs font-medium" style={{ color: vColor }}>
                                    {displayVerdict.replace("_", " ")}
                                    {override && <span style={{ color: C.textMuted }}> (overridden)</span>}
                                  </span>
                                </div>
                                {sub.agent_score !== null && sub.agent_score !== undefined && (
                                  <p className="text-[10px]" style={{ color: C.textMuted }}>
                                    Score: {Math.round(sub.agent_score as number)}%
                                  </p>
                                )}
                                {sub.agent_reasoning && (
                                  <p className="text-[10px] leading-tight max-w-[160px] line-clamp-2"
                                    style={{ color: C.textMuted }}>
                                    {sub.agent_reasoning}
                                  </p>
                                )}
                                {/* Creator override button */}
                                {isCreator && !override && (
                                  <div className="flex gap-1 mt-1">
                                    {verdict !== "approve" && (
                                      <button
                                        className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-70"
                                        style={{ background: "#4ADE8020", color: "#4ADE80" }}
                                        onClick={async () => {
                                          const { createClient } = await import("@supabase/supabase-js");
                                          const sb = createClient(
                                            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
                                            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
                                          );
                                          await sb.from("submissions").update({ creator_override: "approved" })
                                            .eq("id", sub.id);
                                          setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, creator_override: "approved" } : s));
                                        }}
                                      >Approve</button>
                                    )}
                                    {verdict !== "reject" && (
                                      <button
                                        className="text-[9px] px-1.5 py-0.5 rounded hover:opacity-70"
                                        style={{ background: "#F8717120", color: "#F87171" }}
                                        onClick={async () => {
                                          const { createClient } = await import("@supabase/supabase-js");
                                          const sb = createClient(
                                            process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
                                            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
                                          );
                                          await sb.from("submissions").update({ creator_override: "rejected" })
                                            .eq("id", sub.id);
                                          setSubmissions(prev => prev.map(s => s.id === sub.id ? { ...s, creator_override: "rejected" } : s));
                                        }}
                                      >Reject</button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="text-xs font-semibold" style={{ color: C.text }}>
                            {rewardInj === "0.0000" ? "—" : `${rewardInj} INJ`}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {p.reward_claimed ? (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                              style={{ background: "#ADC6A322", color: "#5A7A52" }}>
                              <CheckCircle2 size={10} /> Paid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                              style={{ background: C.amberBg, color: C.amber }}
                              title="Rewards are paid automatically once the campaign fills or its end time passes.">
                              <Clock size={10} /> Awaiting payout
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
