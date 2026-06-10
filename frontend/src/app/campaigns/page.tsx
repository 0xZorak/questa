"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus, Clock, Users, Trophy, Trash2, PenLine,
  Loader2, AlertCircle, CheckCircle2, XCircle, Coins, ArrowRight,
} from "lucide-react";
import AppNav from "@/components/AppNav";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import { queryContract, CONTRACT_ADDRESS } from "@/lib/injective";

// ── Types ─────────────────────────────────────────────────────────────────────
type OnChainCampaign = {
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

export type CampaignDraft = {
  id: string;
  savedAt: number;
  step: number;
  form: Record<string, unknown>;
};

const DRAFTS_KEY = (addr: string) => `rb_campaign_drafts_${addr}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function weiToInj(wei: string): number {
  try { return Number(BigInt(wei)) / 1e18; } catch { return 0; }
}

function timeAgo(unixSec: number): string {
  const diff = Date.now() / 1000 - unixSec;
  if (diff < 60)           return "just now";
  if (diff < 3600)         return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)        return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, { label: string; bg: string; color: string; icon: React.ReactNode }> = {
    active:      { label: "Active",      bg: "#ADC6A322", color: "#5A7A52",  icon: <CheckCircle2 size={11} /> },
    ended:       { label: "Ended",       bg: "#B9752B22", color: "#B9752B",  icon: <Clock size={11} />        },
    cancelled:   { label: "Cancelled",   bg: "#DC262618", color: "#DC2626",  icon: <XCircle size={11} />      },
    distributed: { label: "Distributed", bg: "#3B82F618", color: "#3B82F6",  icon: <Coins size={11} />        },
  };
  const cfg = map[s] ?? map["ended"];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Active campaign card ───────────────────────────────────────────────────────
function CampaignCard({ c, C }: { c: OnChainCampaign; C: Palette }) {
  const injPool = weiToInj(c.reward_pool).toFixed(3);
  const fillPct = c.max_participants > 0
    ? Math.min(100, Math.round((c.participant_count / c.max_participants) * 100))
    : 0;

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate mb-1" style={{ color: C.text }}>{c.title}</p>
          <p className="text-xs truncate" style={{ color: C.textMuted }}>{c.description}</p>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { icon: <Coins size={12} />,   label: "Pool",       val: `${injPool} INJ` },
          { icon: <Users size={12} />,   label: "Joined",     val: `${c.participant_count}/${c.max_participants}` },
          { icon: <Clock size={12} />,   label: "Created",    val: timeAgo(c.created_at) },
        ].map(({ icon, label, val }) => (
          <div key={label} className="rounded-lg px-2 py-2.5" style={{ background: C.sectionHd }}>
            <div className="flex items-center justify-center gap-1 mb-1" style={{ color: C.textMuted }}>
              {icon}
              <span className="text-[10px]">{label}</span>
            </div>
            <p className="text-xs font-semibold" style={{ color: C.text }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Fill bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px]" style={{ color: C.textMuted }}>Participant fill</span>
          <span className="text-[10px] font-semibold" style={{ color: C.amber }}>{fillPct}%</span>
        </div>
        <div className="h-1 rounded-full" style={{ background: C.border }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${fillPct}%`, background: C.amber }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs font-mono" style={{ color: C.textMuted }}>
          #{c.id} · {c.target_platform}
        </span>
        <Link
          href={`/campaigns/${c.id}`}
          className="flex items-center gap-1 text-xs font-semibold transition-opacity hover:opacity-70"
          style={{ color: C.amber }}
        >
          View details <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

// ── Draft card ────────────────────────────────────────────────────────────────
function DraftCard({ draft, onDelete, C }: { draft: CampaignDraft; onDelete: () => void; C: Palette }) {
  const title    = (draft.form.title as string) || "Untitled draft";
  const org      = (draft.form.org   as string) || "";
  const reward   = draft.form.rewardAmount as number;
  const token    = draft.form.rewardToken  as string;
  const stepName = ["Basic Info", "Quest Setup", "AI Knowledge", "Rewards"][draft.step] ?? "Step 1";

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: C.card, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate mb-0.5" style={{ color: C.text }}>{title}</p>
          {org && <p className="text-xs truncate" style={{ color: C.textMuted }}>{org}</p>}
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
          style={{ background: C.amberBg, color: C.amber, border: `1px solid ${C.amberBorder}` }}
        >
          Draft
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg px-3 py-2" style={{ background: C.sectionHd }}>
          <p className="text-[10px] mb-0.5" style={{ color: C.textMuted }}>Last step</p>
          <p className="text-xs font-semibold" style={{ color: C.text }}>{stepName}</p>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: C.sectionHd }}>
          <p className="text-[10px] mb-0.5" style={{ color: C.textMuted }}>Reward</p>
          <p className="text-xs font-semibold" style={{ color: C.text }}>
            {reward ? `${reward} ${token}` : "—"}
          </p>
        </div>
      </div>

      <p className="text-[10px]" style={{ color: C.textMuted }}>
        Saved {timeAgo(draft.savedAt / 1000)}
      </p>

      <div className="flex gap-2 pt-1">
        <Link
          href={`/campaigns/create?draft=${draft.id}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
          style={{ background: C.amber, color: "#FFF8F0" }}
        >
          <PenLine size={12} /> Continue editing
        </Link>
        <button
          onClick={onDelete}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: C.sectionHd, border: `1px solid ${C.border}`, color: C.textMuted }}
          title="Delete draft"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Palette type ──────────────────────────────────────────────────────────────
type Palette = {
  page: string; card: string; sectionHd: string; border: string;
  text: string; textMuted: string; amber: string; amberBg: string; amberBorder: string;
};

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CampaignsPage() {
  const { dark } = useTheme();
  const { address: keplrAddr } = useWalletStore();

  const walletKey = keplrAddr ?? null;
  const injAddr   = keplrAddr ?? null;

  const [tab,       setTab]       = useState<"active" | "drafts">("active");
  const [campaigns, setCampaigns] = useState<OnChainCampaign[]>([]);
  const [drafts,    setDrafts]    = useState<CampaignDraft[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // Load on-chain campaigns
  useEffect(() => {
    if (!injAddr || !CONTRACT_ADDRESS) { setCampaigns([]); return; }
    setLoading(true);
    setError("");
    queryContract<{ campaigns: OnChainCampaign[] }>({ list_campaigns: { limit: 100 } })
      .then(r => {
        const mine = r.campaigns.filter(
          c => c.creator.toLowerCase() === injAddr.toLowerCase()
        );
        setCampaigns(mine);
      })
      .catch(e => setError(`Failed to fetch campaigns: ${e?.message ?? "unknown error"}`))
      .finally(() => setLoading(false));
  }, [injAddr]);

  // Load drafts
  useEffect(() => {
    if (!walletKey) { setDrafts([]); return; }
    const raw = localStorage.getItem(DRAFTS_KEY(walletKey));
    setDrafts(raw ? JSON.parse(raw) : []);
  }, [walletKey]);

  const deleteDraft = (id: string) => {
    if (!walletKey) return;
    const next = drafts.filter(d => d.id !== id);
    localStorage.setItem(DRAFTS_KEY(walletKey), JSON.stringify(next));
    setDrafts(next);
  };

  // Palette
  const C: Palette = {
    page:       dark ? "#0D0A07"  : "#F5F0E8",
    card:       dark ? "#1A1510"  : "#FFFFFF",
    sectionHd:  dark ? "#1C1510"  : "#EDE8DF",
    border:     dark ? "#2A2018"  : "#E2DAC8",
    text:       dark ? "#F0EAE0"  : "#180E02",
    textMuted:  dark ? "#7A6855"  : "#8C6A3A",
    amber:      "#B9752B",
    amberBg:    dark ? "#B9752B1C" : "#B9752B14",
    amberBorder: dark ? "#B9752B4A" : "#B9752B40",
  };

  const connected = !!keplrAddr;

  return (
    <div style={{ background: C.page, minHeight: "100vh" }}>
      <AppNav />

      <div className="max-w-4xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1
              className="mb-1"
              style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}
            >
              My Campaigns
            </h1>
            <p className="text-sm" style={{ color: C.textMuted }}>
              {connected
                ? "Campaigns you've created on Injective."
                : "Connect a wallet to see your campaigns."}
            </p>
          </div>
          <Link
            href="/campaigns/create"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80 shrink-0"
            style={{ background: C.amber, color: "#FFF8F0" }}
          >
            <Plus size={15} /> Create Campaign
          </Link>
        </div>

        {/* Tabs */}
        <div
          className="flex mb-6 rounded-xl p-1 gap-1"
          style={{ background: C.sectionHd, border: `1px solid ${C.border}` }}
        >
          {(["active", "drafts"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === t ? C.card : "transparent",
                color:      tab === t ? C.text : C.textMuted,
                boxShadow:  tab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                border:     tab === t ? `1px solid ${C.border}` : "1px solid transparent",
              }}
            >
              {t === "active"
                ? <><CheckCircle2 size={14} /> Active ({campaigns.length})</>
                : <><PenLine size={14} /> Drafts ({drafts.length})</>}
            </button>
          ))}
        </div>

        {/* ── Active tab ── */}
        {tab === "active" && (
          <>
            {!connected && (
              <div
                className="rounded-2xl p-10 flex flex-col items-center gap-3 text-center"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <Trophy size={28} style={{ color: C.textMuted }} />
                <p className="text-sm font-medium" style={{ color: C.text }}>Connect a wallet</p>
                <p className="text-xs max-w-xs" style={{ color: C.textMuted }}>
                  Connect your Keplr wallet to see your on-chain campaigns.
                </p>
              </div>
            )}

            {connected && loading && (
              <div className="flex justify-center py-16">
                <Loader2 size={20} className="animate-spin" style={{ color: C.amber }} />
              </div>
            )}

            {connected && !loading && error && (
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: "#DC262610", border: "1px solid #DC262630" }}
              >
                <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: "#DC2626" }} />
                <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>
              </div>
            )}

            {connected && !loading && !error && campaigns.length === 0 && (
              <div
                className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
                style={{ background: C.card, border: `1px dashed ${C.border}` }}
              >
                <Trophy size={28} style={{ color: C.textMuted }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: C.text }}>No campaigns yet</p>
                  <p className="text-xs max-w-xs" style={{ color: C.textMuted }}>
                    Create your first quest campaign and deposit a reward pool for participants.
                  </p>
                </div>
                <Link
                  href="/campaigns/create"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: C.amber, color: "#FFF8F0" }}
                >
                  <Plus size={14} /> Create Campaign
                </Link>
              </div>
            )}

            {connected && !loading && !error && campaigns.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaigns.map(c => <CampaignCard key={c.id} c={c} C={C} />)}
              </div>
            )}
          </>
        )}

        {/* ── Drafts tab ── */}
        {tab === "drafts" && (
          <>
            {!connected && (
              <div
                className="rounded-2xl p-10 flex flex-col items-center gap-3 text-center"
                style={{ background: C.card, border: `1px solid ${C.border}` }}
              >
                <PenLine size={28} style={{ color: C.textMuted }} />
                <p className="text-sm font-medium" style={{ color: C.text }}>Connect a wallet</p>
                <p className="text-xs max-w-xs" style={{ color: C.textMuted }}>
                  Drafts are saved per wallet address. Connect to see yours.
                </p>
              </div>
            )}

            {connected && drafts.length === 0 && (
              <div
                className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
                style={{ background: C.card, border: `1px dashed ${C.border}` }}
              >
                <PenLine size={28} style={{ color: C.textMuted }} />
                <div>
                  <p className="text-sm font-medium mb-1" style={{ color: C.text }}>No saved drafts</p>
                  <p className="text-xs max-w-xs" style={{ color: C.textMuted }}>
                    Start filling out a campaign and click "Save Draft" to resume it later.
                  </p>
                </div>
                <Link
                  href="/campaigns/create"
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{ background: C.card, color: C.text, border: `1px solid ${C.border}` }}
                >
                  Start a campaign
                </Link>
              </div>
            )}

            {connected && drafts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {drafts.map(d => (
                  <DraftCard key={d.id} draft={d} onDelete={() => deleteDraft(d.id)} C={C} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
