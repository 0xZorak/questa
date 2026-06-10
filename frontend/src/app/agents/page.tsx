"use client";

import { useState, useEffect, useCallback } from "react";
import AppNav from "@/components/AppNav";
import { useTheme } from "@/store/theme";
import {
  Bot, CheckCircle2, XCircle, AlertTriangle, Clock, ExternalLink,
  Filter, RefreshCw, Activity, Shield, Coins, Eye,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentAction {
  id:           string;
  agent:        string;
  action_type:  string;
  campaign_id?: number;
  wallet?:      string;
  reasoning?:   string;
  decision?:    string;
  confidence?:  number;
  tx_hash?:     string;
  status:       "pending" | "confirmed" | "failed" | "skipped";
  created_at:   string;
}

const EXPLORER_TX = "https://testnet.explorer.injective.network/transaction/";

const AGENT_LABELS: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  verifier:  { label: "Verifier",  color: "#3B82F6", Icon: Shield },
  copilot:   { label: "Copilot",   color: "#8B5CF6", Icon: Bot    },
  concierge: { label: "Concierge", color: "#22C55E", Icon: Eye    },
};

const STATUS_CFG: Record<string, { color: string; bg: string; Icon: React.ElementType; label: string }> = {
  confirmed: { color: "#4ADE80", bg: "#052A14", Icon: CheckCircle2, label: "Confirmed" },
  failed:    { color: "#F87171", bg: "#1C0A0A", Icon: XCircle,      label: "Failed"    },
  pending:   { color: "#FCD34D", bg: "#1C1200", Icon: Clock,        label: "Pending"   },
  skipped:   { color: "#9CA3AF", bg: "#111",    Icon: AlertTriangle, label: "Skipped"  },
};

// ── Stats header ──────────────────────────────────────────────────────────────

function StatsHeader({
  actions,
  dark,
}: {
  actions: AgentAction[];
  dark: boolean;
}) {
  const confirmed    = actions.filter(a => a.status === "confirmed");
  const verifications = confirmed.filter(a => a.action_type === "verify_submission");
  const approved      = verifications.filter(a => a.decision === "approve").length;
  const rejected      = verifications.filter(a => a.decision === "reject").length;
  const distributions = confirmed.filter(a => a.action_type === "distribute_rewards").length;

  const statCard = dark ? "#111" : "#FFFAF0";
  const border   = dark ? "#1E1E1E" : "#E2DAC8";
  const text     = dark ? "#F5F0E8" : "#180E02";
  const muted    = dark ? "#6B7280" : "#8C6A3A";

  const stats = [
    { label: "Auto-verified",       value: approved,       color: "#4ADE80", Icon: CheckCircle2 },
    { label: "Spam blocked",        value: rejected,       color: "#F87171", Icon: XCircle      },
    { label: "Auto-distributions",  value: distributions,  color: "#D97706", Icon: Coins        },
    { label: "Total actions",       value: actions.length, color: "#60A5FA", Icon: Activity     },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {stats.map(s => (
        <div
          key={s.label}
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: statCard, border: `1px solid ${border}` }}
        >
          <div className="rounded-lg p-2" style={{ background: s.color + "20" }}>
            <s.Icon size={16} style={{ color: s.color }} />
          </div>
          <div>
            <p className="text-xl font-bold" style={{ color: text }}>{s.value}</p>
            <p className="text-xs" style={{ color: muted }}>{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

function ActionRow({ a, dark }: { a: AgentAction; dark: boolean }) {
  const [expanded, setExpanded] = useState(false);

  const border   = dark ? "#1E1E1E" : "#E2DAC8";
  const rowBg    = dark ? "#0D0A07" : "#FFFDF5";
  const text     = dark ? "#F5F0E8" : "#180E02";
  const muted    = dark ? "#6B7280" : "#8C6A3A";

  const agentCfg = AGENT_LABELS[a.agent] ?? { label: a.agent, color: "#9CA3AF", Icon: Bot };
  const statusCfg = STATUS_CFG[a.status] ?? STATUS_CFG.pending;
  const AgentIcon  = agentCfg.Icon;
  const StatusIcon = statusCfg.Icon;

  const ts = new Date(a.created_at).toLocaleString();

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{ background: rowBg, border: `1px solid ${border}` }}
    >
      {/* Row header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-90 transition-opacity"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Agent badge */}
        <div className="rounded-lg p-1.5 shrink-0" style={{ background: agentCfg.color + "20" }}>
          <AgentIcon size={13} style={{ color: agentCfg.color }} />
        </div>

        {/* Action type */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: text }}>
            {a.action_type.replace(/_/g, " ")}
          </p>
          <p className="text-xs truncate" style={{ color: muted }}>
            {a.campaign_id ? `Campaign #${a.campaign_id}` : ""}
            {a.wallet ? ` · ${a.wallet.slice(0, 12)}…` : ""}
          </p>
        </div>

        {/* Decision */}
        {a.decision && (
          <span
            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
            style={{
              background: a.decision === "approve" ? "#4ADE8020" :
                          a.decision === "reject"  ? "#F8717120" : "#FCD34D20",
              color:      a.decision === "approve" ? "#4ADE80" :
                          a.decision === "reject"  ? "#F87171" : "#FCD34D",
            }}
          >
            {a.decision}
          </span>
        )}

        {/* Status */}
        <div
          className="shrink-0 rounded-full px-2 py-0.5 flex items-center gap-1 text-xs"
          style={{ background: statusCfg.bg, color: statusCfg.color }}
        >
          <StatusIcon size={11} />
          <span>{statusCfg.label}</span>
        </div>

        {/* Timestamp */}
        <p className="hidden md:block text-xs shrink-0" style={{ color: muted }}>{ts}</p>

        {/* Confidence */}
        {a.confidence !== undefined && (
          <span className="hidden lg:block text-xs shrink-0" style={{ color: muted }}>
            {Math.round(a.confidence)}%
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div
          className="px-4 pb-4 pt-0 space-y-3 border-t"
          style={{ borderColor: border }}
        >
          {a.reasoning && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: muted }}>Reasoning</p>
              <p className="text-sm leading-relaxed" style={{ color: text }}>{a.reasoning}</p>
            </div>
          )}

          {a.tx_hash && (
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: muted }}>On-chain tx</p>
              <a
                href={EXPLORER_TX + a.tx_hash}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono flex items-center gap-1 hover:opacity-70"
                style={{ color: "#D97706" }}
              >
                {a.tx_hash.slice(0, 32)}…
                <ExternalLink size={10} />
              </a>
            </div>
          )}

          {a.wallet && (
            <p className="text-xs font-mono" style={{ color: muted }}>
              Wallet: {a.wallet}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { dark } = useTheme();
  const [actions, setActions]   = useState<AgentAction[]>([]);
  const [loading, setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [filter, setFilter]     = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("");

  const bg     = dark ? "#0D0A07" : "#F5F0E8";
  const card   = dark ? "#111111" : "#FFFFFF";
  const border = dark ? "#1E1E1E" : "#E2DAC8";
  const text   = dark ? "#F5F0E8" : "#180E02";
  const muted  = dark ? "#6B7280" : "#8C6A3A";

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("agent", filter);
      if (campaignFilter) params.set("campaign_id", campaignFilter);

      const res  = await fetch(`/api/agent/actions?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setActions(json.actions ?? []);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load agent actions");
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [filter, campaignFilter]);

  useEffect(() => { fetchActions(); }, [fetchActions]);

  const filtered = actions;

  return (
    <div className="min-h-screen" style={{ background: bg }}>
      <AppNav />
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl p-2" style={{ background: "#D97706" + "20" }}>
              <Bot size={20} style={{ color: "#D97706" }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: text }}>Agent Activity</h1>
          </div>
          <p className="text-sm" style={{ color: muted }}>
            Live feed of every AI agent decision — verification verdicts, campaign insights, and on-chain actions.
            All reasoning is logged and every on-chain transaction includes a SHA-256 hash of the agent's reasoning.
          </p>
        </div>

        {/* Stats */}
        <StatsHeader actions={actions} dark={dark} />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {["all", "verifier", "copilot", "concierge"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                background: filter === f ? "#D97706" : (dark ? "#1A1510" : "#FFF3DC"),
                color:      filter === f ? "#FFF8F0" : muted,
                border:     `1px solid ${filter === f ? "#D97706" : border}`,
              }}
            >
              {f === "all" ? "All agents" : AGENT_LABELS[f]?.label ?? f}
            </button>
          ))}

          <input
            type="number"
            placeholder="Filter by campaign ID"
            value={campaignFilter}
            onChange={e => setCampaignFilter(e.target.value)}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs outline-none w-48"
            style={{
              background: dark ? "#1A1510" : "#FFF3DC",
              border:     `1px solid ${border}`,
              color:      text,
            }}
          />

          <button
            onClick={fetchActions}
            className="p-2 rounded-lg transition-colors hover:opacity-70"
            style={{ background: dark ? "#1A1510" : "#FFF3DC", border: `1px solid ${border}` }}
            title="Refresh"
          >
            <RefreshCw size={14} style={{ color: muted }} />
          </button>
        </div>

        {/* Action list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div
                key={i}
                className="rounded-xl h-14 animate-pulse"
                style={{ background: dark ? "#151515" : "#EEE8D8" }}
              />
            ))}
          </div>
        ) : fetchError ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: "#1C0A0A", border: "1px solid #F8717130" }}
          >
            <XCircle size={28} className="mx-auto mb-3" style={{ color: "#F87171" }} />
            <p className="text-sm font-medium mb-1" style={{ color: "#F87171" }}>
              Failed to load agent activity
            </p>
            <p className="text-xs mb-4" style={{ color: muted }}>{fetchError}</p>
            <button
              onClick={fetchActions}
              className="px-4 py-2 rounded-lg text-xs font-medium transition-opacity hover:opacity-70"
              style={{ background: "#F87171", color: "#fff" }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ background: card, border: `1px solid ${border}` }}
          >
            <Activity size={32} className="mx-auto mb-3 opacity-40" style={{ color: muted }} />
            <p className="text-sm" style={{ color: muted }}>
              No agent actions yet. Run the Verifier from a campaign admin panel to see activity here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(a => (
              <ActionRow key={a.id} a={a} dark={dark} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
