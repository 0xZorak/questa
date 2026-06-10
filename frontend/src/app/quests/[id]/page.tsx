"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import AppNav from "@/components/AppNav";
import { useToast } from "@/components/Toast";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import {
  queryContract,
  buildExecuteMsg,
  broadcastWithKeplr,
  fetchInjBalance,
  checkCw721Balance,
  checkErc721Balance,
  injToEvmAddress,
  CONTRACT_ADDRESS,
  SUBMIT_FEE,
} from "@/lib/injective";
import { getProfile, recordSubmission, getCampaignMetadata } from "@/lib/supabase";
import type { CampaignMetadataRow } from "@/lib/supabase";
import {
  ArrowLeft, ArrowRight, Copy, Check, ExternalLink,
  Users, Coins, Clock, Trophy, Bot, Zap,
  Loader2, CheckCircle2, AlertTriangle, RefreshCw,
  Shield, Heart, UserPlus, MessageSquare, Repeat2, Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Campaign = {
  id: number;
  creator: string;
  title: string;
  description: string;
  target_platform: string;
  reward_pool: string;
  max_participants: number;
  participant_count: number;
  status: string;
  ends_at: number;
  duration_days: number;
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

type Profile = {
  display_name: string | null;
  avatar_url:   string | null;
  twitter:      string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const JOINED_KEY = (addr: string) => `rb_joined_campaigns_${addr}`;
const SHORT      = (s: string)    => `${s.slice(0, 8)}…${s.slice(-6)}`;

async function sha256hex(str: string): Promise<string> {
  const enc   = new TextEncoder();
  const bytes = enc.encode(str);
  const buf   = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

const PLATFORM_COLOR: Record<string, string> = {
  twitter:  "#1DA1F2",
  discord:  "#5865F2",
  telegram: "#26A5E4",
  linkedin: "#0A66C2",
};

const QUEST_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  post_original: { label: "Original Post", color: "#3B82F6", icon: <Bot       size={10} /> },
  like_repost:   { label: "Like & Repost", color: "#EC4899", icon: <Heart     size={10} /> },
  follow:        { label: "Follow",        color: "#22C55E", icon: <UserPlus  size={10} /> },
  quote_tweet:   { label: "Quote Tweet",   color: "#8B5CF6", icon: <MessageSquare size={10} /> },
};

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ n, current }: { n: number; current: number }) {
  const done   = current > n;
  const active = current === n;
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 transition-all"
        style={{
          background: done ? "#22C55E20" : active ? "#D97706" : "#1E1E1E",
          color:      done ? "#22C55E"   : active ? "#FFF"    : "#6B7280",
          border:     active ? "none" : `1px solid ${done ? "#22C55E30" : "#2A2A2A"}`,
        }}
      >
        {done ? <Check size={10} /> : n}
      </div>
      {n < 3 && (
        <div className="h-px transition-all" style={{ width: 18, background: done ? "#22C55E40" : "#2A2A2A" }} />
      )}
    </div>
  );
}

// ── Eligibility badge ─────────────────────────────────────────────────────────

function EligBadge({ meets }: { meets: boolean | null }) {
  if (meets === null) return <Loader2 size={11} className="animate-spin shrink-0" style={{ color: "#6B7280" }} />;
  if (meets)  return <CheckCircle2 size={11} className="shrink-0" style={{ color: "#22C55E" }} />;
  return <AlertTriangle size={11} className="shrink-0" style={{ color: "#F87171" }} />;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = use(params);
  const campaignId    = Number(idStr);

  const { dark }  = useTheme();
  const { toast } = useToast();

  const { address: keplrAddr } = useWalletStore();

  const injAddr         = keplrAddr ?? null;
  const walletKey       = keplrAddr ?? null;
  const walletConnected = !!walletKey;

  // ── Theme tokens
  const bg       = dark ? "#0A0A0A" : "#F5F0E8";
  const card     = dark ? "#111111" : "#FFFFFF";
  const card2    = dark ? "#0A0A0A" : "#F5F0EB";
  const border   = dark ? "#1E1E1E" : "#E2DAC8";
  const border2  = dark ? "#2A2A2A" : "#DDD6C5";
  const text     = dark ? "#F5F0E8" : "#180E02";
  const textSub  = dark ? "#9CA3AF" : "#8C6A3A";
  const textDim  = dark ? "#6B7280" : "#A08060";
  const hdBg     = dark ? "#0F0F0F" : "#F0EAE0";

  // ── Data state
  const [campaign,     setCampaign]     = useState<Campaign | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [profile,      setProfile]      = useState<Profile>({ display_name: null, avatar_url: null, twitter: null });
  const [meta,         setMeta]         = useState<CampaignMetadataRow | null>(null);
  const [injBalance,   setInjBalance]   = useState<number | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [pageError,    setPageError]    = useState("");

  // ── Eligibility state (null = unknown / checking)
  const [meetsNft,       setMeetsNft]       = useState<boolean | null>(null);

  // ── Quest participation state
  const [hasJoined,    setHasJoined]    = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [myPost,       setMyPost]       = useState<string | null>(null);

  // ── Step (post/quote flows: 1 = generate, 2 = post, 3 = submit)
  const [questStep, setQuestStep] = useState<1 | 2 | 3>(1);

  // ── AI content generation
  const [generated,  setGenerated]  = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied,     setCopied]     = useState(false);

  // ── Submission
  const [postUrl,     setPostUrl]     = useState("");
  const [verifying,   setVerifying]   = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState("");

  // ── Load campaign + participants + metadata ───────────────────────────────────
  useEffect(() => {
    if (!CONTRACT_ADDRESS || !campaignId) return;
    setLoading(true);
    setPageError("");

    Promise.all([
      queryContract<Campaign>({ get_campaign: { campaign_id: campaignId } }),
      queryContract<{ participants: Participant[] }>({ get_participants: { campaign_id: campaignId } }),
      getCampaignMetadata(campaignId),
    ])
      .then(([c, p, m]) => {
        setCampaign(c);
        setParticipants(p.participants ?? []);
        setMeta(m);

        // Auto-distribute trigger (idempotent, gated server-side): if the quest
        // is done — filled or past its end time — but not distributed, nudge the agent.
        const nowSec = Math.floor(Date.now() / 1000);
        const done   = c.participant_count >= c.max_participants || nowSec > c.ends_at;
        if (done && !c.distributed && c.status?.toLowerCase() !== "cancelled") {
          fetch("/api/agent/distribute", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ campaign_id: campaignId }),
          }).catch(() => {});
        }
      })
      .catch(e => setPageError(e?.message ?? "Failed to load quest"))
      .finally(() => setLoading(false));
  }, [campaignId]);

  // ── Derive join / submit status ───────────────────────────────────────────────
  useEffect(() => {
    if (!injAddr || !participants.length) return;
    const me = participants.find(p => p.address.toLowerCase() === injAddr.toLowerCase());
    if (me) {
      setHasJoined(true);
      if (me.post_url) { setHasSubmitted(true); setMyPost(me.post_url); }
    }
  }, [participants, injAddr]);

  // ── Load profile ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const key = injAddr ?? walletKey;
    if (!key) return;
    getProfile(key).then(row => {
      if (row) setProfile({ display_name: row.display_name, avatar_url: row.avatar_url, twitter: row.twitter ?? null });
    });
  }, [injAddr, walletKey]);

  // ── Fetch INJ balance ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!injAddr || !meta || meta.entry_criteria !== "min_inj") return;
    fetchInjBalance(injAddr).then(setInjBalance);
  }, [injAddr, meta]);

  // ── NFT holder check ──────────────────────────────────────────────────────────
  // Supports both CW721 (inj1… contract) and ERC721 (0x… contract on Injective
  // EVM). For ERC721 we derive the user's 0x address from their Keplr inj address.
  // Both paths are timeout-capped so a slow RPC never leaves the UI hanging.
  useEffect(() => {
    if (!meta || meta.entry_criteria !== "nft_holder" || !meta.nft_contract || !injAddr) return;
    const contract = meta.nft_contract.trim();
    let cancelled = false;
    setMeetsNft(null);
    const run = async () => {
      try {
        if (contract.startsWith("inj")) {
          const ok = await checkCw721Balance(contract, injAddr);
          if (!cancelled) setMeetsNft(ok);
        } else if (contract.startsWith("0x")) {
          const ok = await checkErc721Balance(contract, injToEvmAddress(injAddr));
          if (!cancelled) setMeetsNft(ok);
        } else {
          if (!cancelled) setMeetsNft(false); // unrecognized format → fail-closed
        }
      } catch {
        if (!cancelled) setMeetsNft(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [meta, injAddr]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const generateContent = async () => {
    if (!campaign) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          platform: campaign.target_platform,
          tone:     "Engaging",
          topic:    campaign.title,
          campaign: campaign.description,
        }),
      });
      const data = await res.json();
      setGenerated(data.content ?? "");
    } catch {
      setGenerated(
        `Participating in the "${campaign.title}" campaign on Questa! Earn rewards on @Injective. #Injective #Web3`,
      );
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generated);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const postOnTwitter = () => {
    const text = encodeURIComponent(
      generated || `Participating in the "${campaign?.title}" campaign on Questa! Earn rewards on @Injective. #Injective #Web3`,
    );
    let url = `https://twitter.com/intent/tweet?text=${text}`;
    if (meta?.quest_type === "quote_tweet" && meta.target_tweet_url) {
      url += `&url=${encodeURIComponent(meta.target_tweet_url)}`;
    }
    window.open(url, "_blank");
    setQuestStep(3);
  };

  const verifyAndSubmit = async () => {
    if (!postUrl.trim() || !walletKey || !injAddr || !campaign) return;
    setVerifyError(""); setSubmitError("");
    setVerifying(true);
    try {
      const res  = await fetch(`/api/verify-tweet?url=${encodeURIComponent(postUrl.trim())}`);
      const data = await res.json();
      if (!res.ok || data.error) { setVerifyError(data.error ?? "Verification failed"); return; }
      if (!data.valid) {
        const msg = data.error ?? "Tweet could not be verified";
        setVerifyError(msg);
        toast.warning(msg);
        return;
      }
    } catch {
      const msg = "Could not reach the verification service. Try again.";
      setVerifyError(msg);
      toast.warning(msg);
      return;
    } finally {
      setVerifying(false);
    }
    await submitOnChain(postUrl.trim());
  };

  const quickSubmit = async (proofUrl: string) => {
    if (!walletKey || !injAddr || !campaign) return;
    setSubmitError("");
    await submitOnChain(proofUrl);
  };

  const submitOnChain = async (proofUrl: string) => {
    // Pre-flight: the contract rejects these conditions with an opaque
    // "Contract execution failed". We already have the campaign loaded, so check
    // here and give the precise reason without wasting a signed transaction.
    if (campaign) {
      const nowSec = Math.floor(Date.now() / 1000);
      let blockMsg = "";
      if (campaign.status?.toLowerCase() !== "active") {
        blockMsg = `This campaign is ${campaign.status} and is no longer accepting submissions.`;
      } else if (campaign.ends_at <= nowSec) {
        blockMsg = "This campaign has ended and is no longer accepting submissions.";
      } else if (!hasJoined && campaign.participant_count >= campaign.max_participants) {
        blockMsg = "This quest is full — no spots left.";
      }
      if (blockMsg) {
        setSubmitError(blockMsg);
        toast.error(blockMsg, 0);
        return;
      }
    }

    setSubmitting(true);
    setSubmitError("");
    try {
      const contentHash = await sha256hex(proofUrl + (injAddr ?? ""));
      // The contract's JoinAndSubmit requires post_url (msg.rs: post_url: String).
      // Omitting it triggers a serde "missing field" deserialization error on-chain.
      const msg = buildExecuteMsg(injAddr!, {
        join_and_submit: { campaign_id: campaignId, content_hash: contentHash, post_url: proofUrl },
      });
      const txHash = await broadcastWithKeplr(keplrAddr!, msg, SUBMIT_FEE);

      try {
        const raw = localStorage.getItem(JOINED_KEY(walletKey!)) ?? "[]";
        const ids: number[] = JSON.parse(raw);
        if (!ids.includes(campaignId)) { ids.push(campaignId); localStorage.setItem(JOINED_KEY(walletKey!), JSON.stringify(ids)); }
      } catch { /* non-critical */ }
      setHasJoined(true);

      const dbKey = injAddr ?? walletKey!;
      await recordSubmission({ campaign_id: campaignId, wallet_address: dbKey, post_url: proofUrl, tx_hash: txHash, verified: false });
      setHasSubmitted(true);
      setMyPost(proofUrl);
      toast.success("Quest submitted on-chain!");

      // Trigger the Verifier Agent automatically after a successful submission
      fetch("/api/agent/verify", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ campaign_id: campaignId }),
      }).catch(() => {}); // fire-and-forget — do not block the success UX
    } catch (e: unknown) {
      // parseChainError wraps chain failures in an AppError whose user-facing
      // message is generic and hides the real contract rawLog in `.cause`.
      // Flatten the whole chain so we can match the actual ContractError string
      // (see contracts/reward_campaign/src/error.rs) and tell the user exactly
      // why the contract rejected the submission.
      const parts: string[] = [];
      let cur: unknown = e;
      for (let i = 0; i < 6 && cur; i++) {
        if (cur instanceof Error) parts.push(cur.message);
        else parts.push(String(cur));
        // sdk-ts exceptions (TransactionException) stash the real chain rawLog in
        // non-standard fields — pull them so the contract reason isn't lost.
        const o = cur as Record<string, unknown>;
        for (const k of ["originalMessage", "rawLog", "context", "contextModule"]) {
          if (o && typeof o[k] === "string" && o[k]) parts.push(`${k}=${o[k]}`);
        }
        cur = o?.cause;
      }
      const full = parts.join(" | ");

      let displayMsg = (e instanceof Error ? e.message : String(e)) || "Failed to submit on-chain";
      if (/missing field|unknown variant|invalid type|parsing.*into|cw_serde|expected/i.test(full)) {
        displayMsg = "Submission rejected by the contract (malformed message). This is a bug — please report it.";
      } else if (/content already submitted|already (joined|submitted|participat)/i.test(full)) {
        displayMsg = "You've already submitted to this quest.";
      } else if (/campaign is full|\bfull\b|max.*participant/i.test(full)) {
        displayMsg = "This quest is full — no spots left.";
      } else if (/has ended|not active|expired|cancelled/i.test(full)) {
        displayMsg = "This campaign has ended or was cancelled — it's no longer accepting submissions.";
      } else if (/campaign not found/i.test(full)) {
        displayMsg = "Campaign not found on-chain. It may have been removed.";
      } else if (/out of gas|insufficient.*fee|gas/i.test(full)) {
        displayMsg = "Transaction ran out of gas. Please try again.";
      } else if (/insufficient|balance/i.test(full)) {
        displayMsg = "Insufficient INJ balance to cover the transaction fee.";
      } else if (/sequence/i.test(full)) {
        displayMsg = "Account sequence mismatch — please try again.";
      } else if (/rejected|denied|user.*cancel/i.test(full)) {
        displayMsg = "You rejected the transaction in your wallet.";
      }
      console.error("[submitOnChain] failed:", full);
      setSubmitError(displayMsg);
      toast.error(displayMsg, 0);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────────

  const platformColor = PLATFORM_COLOR[campaign?.target_platform?.toLowerCase() ?? ""] ?? "#D97706";
  const rewardInj     = campaign ? (Number(BigInt(campaign.reward_pool)) / 1e18).toFixed(2) : "0";
  const perPart       = campaign && campaign.max_participants > 0
    ? (Number(BigInt(campaign.reward_pool)) / 1e18 / campaign.max_participants).toFixed(3)
    : "0";
  const spotsLeft = campaign ? campaign.max_participants - campaign.participant_count : 0;
  const endsIn    = campaign ? Math.max(0, Math.floor((campaign.ends_at - Date.now() / 1000) / 86400)) : 0;

  // This wallet's on-chain reward (set once the campaign is distributed).
  const myParticipant = participants.find(
    p => p.address.toLowerCase() === (injAddr ?? "").toLowerCase(),
  );
  const myRewardInj = myParticipant && myParticipant.reward_amount
    ? Number(BigInt(myParticipant.reward_amount)) / 1e18
    : 0;
  const isPaid = !!campaign?.distributed && myRewardInj > 0;

  const displayName = profile.display_name
    ?? (injAddr ? SHORT(injAddr) : walletKey ? SHORT(walletKey) : "—");

  const isCreator = !!(injAddr && campaign && injAddr.toLowerCase() === campaign.creator.toLowerCase());

  const questType    = meta?.quest_type ?? "post_original";
  const isPostType   = questType === "post_original" || questType === "quote_tweet";
  const isLikeType   = questType === "like_repost";
  const isFollowType = questType === "follow";
  const qtMeta       = QUEST_TYPE_META[questType] ?? QUEST_TYPE_META.post_original;

  const tasksList = (() => {
    if (isFollowType && meta?.follow_handle) return [
      `Follow @${meta.follow_handle} on Twitter / X`,
      `Confirm your follow on-chain`,
      `Earn your share of ${rewardInj} INJ when campaign ends`,
    ];
    if (isLikeType && meta?.target_tweet_url) return [
      `Like the target tweet`,
      `Repost / Retweet the post`,
      `Confirm your engagement on-chain`,
      `Earn your share of ${rewardInj} INJ when campaign ends`,
    ];
    if (questType === "quote_tweet") return [
      `Quote the target tweet with original content`,
      `Include required hashtags${meta?.required_hashtags ? `: ${meta.required_hashtags}` : ""}`,
      `Submit your quote tweet link for verification`,
      `Earn your share of ${rewardInj} INJ when campaign ends`,
    ];
    return [
      `Post on ${campaign?.target_platform ?? "Twitter"} about this campaign`,
      `Mention the campaign name & Injective Network`,
      `Submit your post link for verification`,
      `Earn your share of ${rewardInj} INJ when campaign ends`,
    ];
  })();

  // Eligibility checks
  const meetsMinInj    = meta?.entry_criteria !== "min_inj"    || injBalance === null || injBalance >= (meta.min_inj ?? 0);
  const nftBlocked     = meta?.entry_criteria === "nft_holder"    && meetsNft === false;
  // An X account is required to participate in any quest (verifier needs a handle).
  const noTwitter      = walletConnected && !profile.twitter;
  const blocked        = !meetsMinInj || nftBlocked || noTwitter;

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ background: bg, minHeight: "100vh" }}>
        <AppNav />
        <div className="flex justify-center items-center py-32">
          <Loader2 size={24} className="animate-spin" style={{ color: "#D97706" }} />
        </div>
      </div>
    );
  }

  if (pageError || !campaign) {
    return (
      <div style={{ background: bg, minHeight: "100vh" }}>
        <AppNav />
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-sm mb-4" style={{ color: "#F87171" }}>{pageError || "Quest not found."}</p>
          <Link href="/quests" className="text-sm" style={{ color: "#D97706" }}>← Back to quests</Link>
        </div>
      </div>
    );
  }

  // ── Page ──────────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: bg, minHeight: "100vh" }}>
      <AppNav />

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-8">
        <Link href="/quests"
          className="inline-flex items-center gap-1.5 text-sm mb-8 transition-opacity hover:opacity-70"
          style={{ color: textDim }}
        >
          <ArrowLeft size={14} /> All Quests
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* ── LEFT: Campaign info ── */}
          <div className="lg:col-span-2 space-y-3">

            {/* Header card */}
            <div className="rounded-xl p-4" style={{ background: card, border: `1px solid ${border}` }}>
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                  style={{ background: platformColor + "22", color: platformColor }}>
                  {campaign.target_platform}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
                  style={{ background: qtMeta.color + "18", color: qtMeta.color }}>
                  {qtMeta.icon} {qtMeta.label}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "#22C55E20", color: "#22C55E" }}>
                  {campaign.status}
                </span>
                <span className="ml-auto text-[10px] flex items-center gap-0.5" style={{ color: textDim }}>
                  <Clock size={10} /> {endsIn}d
                </span>
              </div>

              <h1 className="font-bold mb-1.5" style={{ color: text, fontSize: "15px", letterSpacing: "-0.02em" }}>
                {campaign.title}
              </h1>
              <p className="text-xs leading-relaxed line-clamp-3" style={{ color: textSub }}>
                {campaign.description}
              </p>

              <div className="mt-3 pt-3 grid grid-cols-3 gap-2" style={{ borderTop: `1px solid ${border}` }}>
                {[
                  { label: "Pool",  val: `${rewardInj} INJ`,  icon: <Coins size={11} /> },
                  { label: "Each",  val: `~${perPart} INJ`,   icon: <Trophy size={11} /> },
                  { label: "Left",  val: `${spotsLeft}/${campaign.max_participants}`, icon: <Users size={11} /> },
                ].map(s => (
                  <div key={s.label} className="rounded-lg p-2 text-center" style={{ background: card2 }}>
                    <div className="flex items-center justify-center gap-0.5 mb-0.5" style={{ color: "#D97706" }}>{s.icon}</div>
                    <p className="font-bold text-xs" style={{ color: text }}>{s.val}</p>
                    <p className="text-[9px]" style={{ color: textDim }}>{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks list */}
            <div className="rounded-xl overflow-hidden" style={{ background: card, border: `1px solid ${border}` }}>
              <div className="px-4 py-2.5 flex items-center gap-1.5" style={{ background: hdBg, borderBottom: `1px solid ${border}` }}>
                <Trophy size={11} style={{ color: textDim }} />
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: textDim }}>Tasks</p>
              </div>
              <div className="px-4 py-3 space-y-1.5">
                {tasksList.map((t, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg px-2.5 py-2" style={{ background: card2 }}>
                    <span className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold mt-px"
                      style={{ background: "#D9770620", color: "#D97706" }}>
                      {i + 1}
                    </span>
                    <p className="text-[11px] leading-relaxed" style={{ color: textSub }}>{t}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Entry criteria info card */}
            {meta && meta.entry_criteria !== "none" && (
              <div className="rounded-xl px-4 py-3" style={{ background: "#D9770610", border: "1px solid #D9770630" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#D97706" }}>
                  Entry Requirement
                </p>
                {meta.entry_criteria === "min_inj" && (
                  <p className="text-xs" style={{ color: textSub }}>
                    Minimum <strong style={{ color: text }}>{meta.min_inj} INJ</strong> in wallet required
                  </p>
                )}
                {meta.entry_criteria === "nft_holder" && (
                  <p className="text-xs" style={{ color: textSub }}>
                    Must hold an NFT from{" "}
                    <span className="font-mono text-[10px]" style={{ color: text }}>
                      {meta.nft_contract ? `${meta.nft_contract.slice(0, 10)}…` : "required collection"}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Creator admin link */}
            {isCreator && (
              <Link href={`/campaigns/${campaign.id}`}
                className="flex items-center gap-2 text-xs px-4 py-3 rounded-xl transition-opacity hover:opacity-80"
                style={{ background: "#D9770614", border: "1px solid #D9770630", color: "#D97706" }}>
                <Shield size={13} />
                You created this campaign — view admin dashboard
                <ArrowRight size={12} className="ml-auto" />
              </Link>
            )}
          </div>

          {/* ── RIGHT: Quest action panel ── */}
          <div className="lg:col-span-3">
            <div className="sticky top-20 space-y-4">

              {/* Identity card */}
              {walletConnected && (
                <div className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: card, border: `1px solid ${border}` }}>
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="avatar" className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                      style={{ background: "#D9770620", color: "#D97706" }}>
                      {displayName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate" style={{ color: text }}>{displayName}</p>
                    {profile.twitter && (
                      <p className="text-xs truncate" style={{ color: textDim }}>@{profile.twitter}</p>
                    )}
                    {!profile.twitter && (
                      <p className="text-xs font-mono truncate" style={{ color: textDim }}>
                        {injAddr ? SHORT(injAddr) : walletKey ? SHORT(walletKey) : ""}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
                    style={{ background: "#22C55E18", color: "#22C55E" }}>
                    <CheckCircle2 size={10} /> Verified
                  </span>
                </div>
              )}

              {/* Main quest panel */}
              <div className="rounded-2xl overflow-hidden" style={{ background: card, border: `1px solid ${border}` }}>

                {/* ── Creator view ─── */}
                {walletConnected && isCreator && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ background: "#D9770618", border: "1px solid #D9770640" }}>
                      <Shield size={22} style={{ color: "#D97706" }} />
                    </div>
                    <h3 className="font-bold mb-2 text-sm" style={{ color: text }}>You created this campaign</h3>
                    <p className="text-xs mb-4 leading-relaxed" style={{ color: textSub }}>
                      Campaign creators cannot participate in their own quests.
                    </p>
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
                      style={{ background: "#D9770620", border: "1px solid #D9770640", color: "#D97706" }}>
                      View admin dashboard <ArrowRight size={11} />
                    </Link>
                  </div>
                )}

                {/* ── Not connected ─── */}
                {!walletConnected && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ background: "#D9770618", border: "1px solid #D9770640" }}>
                      <Zap size={20} style={{ color: "#D97706" }} />
                    </div>
                    <h3 className="font-bold mb-2 text-sm" style={{ color: text }}>Connect Wallet to Participate</h3>
                    <p className="text-xs mb-5 leading-relaxed" style={{ color: textSub }}>
                      Your wallet address is your on-chain identity. Connect to join this quest and earn rewards.
                    </p>
                    <p className="text-xs" style={{ color: textDim }}>
                      Use the <span style={{ color: "#D97706" }}>Connect Wallet</span> button in the top navbar.
                    </p>
                  </div>
                )}

                {/* ── Campaign ended, not submitted ─── */}
                {walletConnected && !isCreator && !hasSubmitted && campaign.status?.toLowerCase() !== "active" && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                      style={{ background: "#6B728018", border: "1px solid #6B728040" }}>
                      <Clock size={22} style={{ color: "#6B7280" }} />
                    </div>
                    <h3 className="font-bold mb-2 text-sm" style={{ color: text }}>Campaign has ended</h3>
                    <p className="text-xs leading-relaxed" style={{ color: textSub }}>
                      This quest is no longer accepting new submissions.
                    </p>
                  </div>
                )}

                {/* ── Connected & not yet submitted ─── */}
                {walletConnected && !isCreator && !hasSubmitted && campaign.status?.toLowerCase() === "active" && (
                  <div>

                    {/* Entry requirements live check */}
                    {meta && meta.entry_criteria !== "none" && (
                      <div className="px-5 pt-4">
                        <div className="rounded-xl p-3 mb-1" style={{ background: card2, border: `1px solid ${border2}` }}>
                          <p className="text-xs font-semibold mb-2" style={{ color: "#D97706" }}>Entry Requirements</p>

                          {/* min_inj */}
                          {meta.entry_criteria === "min_inj" && (
                            <div className="flex items-center gap-2">
                              <Coins size={11} style={{ color: "#D97706" }} />
                              <p className="text-xs flex-1" style={{ color: textSub }}>
                                Min <strong style={{ color: text }}>{meta.min_inj} INJ</strong> balance required
                                {injBalance !== null && (
                                  <span style={{ color: injBalance >= (meta.min_inj ?? 0) ? "#22C55E" : "#F87171" }}>
                                    {" "}· You have {injBalance.toFixed(3)} INJ
                                  </span>
                                )}
                              </p>
                              <EligBadge meets={injBalance === null ? null : injBalance >= (meta.min_inj ?? 0)} />
                            </div>
                          )}

                          {/* nft_holder */}
                          {meta.entry_criteria === "nft_holder" && (
                            <div className="flex items-center gap-2">
                              <Shield size={11} style={{ color: "#8B5CF6" }} />
                              <p className="text-xs flex-1" style={{ color: textSub }}>
                                Must hold NFT from{" "}
                                <span className="font-mono text-[10px]" style={{ color: text }}>
                                  {meta.nft_contract
                                    ? `${meta.nft_contract.slice(0, 10)}…${meta.nft_contract.slice(-6)}`
                                    : "required collection"}
                                </span>
                                {meetsNft === true  && <span style={{ color: "#22C55E" }}> · NFT found ✓</span>}
                                {meetsNft === false && <span style={{ color: "#F87171" }}> · No NFT found</span>}
                              </p>
                              <EligBadge meets={meetsNft} />
                            </div>
                          )}

                        </div>
                      </div>
                    )}

                    {/* Quest full guard */}
                    {spotsLeft <= 0 && (
                      <div className="p-5">
                        <div className="rounded-xl p-4 text-center" style={{ background: card2, border: `1px solid ${border2}` }}>
                          <p className="text-sm font-semibold mb-1" style={{ color: text }}>Quest Full</p>
                          <p className="text-xs" style={{ color: textDim }}>All spots have been taken.</p>
                        </div>
                      </div>
                    )}

                    {/* Eligibility blocked banner */}
                    {noTwitter && spotsLeft > 0 && (
                      <div className="px-5 pt-2 pb-1">
                        <div className="rounded-xl p-3 flex items-center justify-between gap-3"
                          style={{ background: "#1DA1F218", border: "1px solid #1DA1F240" }}>
                          <p className="text-xs" style={{ color: "#1DA1F2" }}>
                            Connect your X account before participating in any quest.
                          </p>
                          <Link href="/profile"
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-80"
                            style={{ background: "#1DA1F2", color: "#FFF" }}>
                            Connect X
                          </Link>
                        </div>
                      </div>
                    )}

                    {blocked && !noTwitter && spotsLeft > 0 && (
                      <div className="px-5 pt-2 pb-1">
                        <div className="rounded-xl p-3" style={{ background: "#7F1D1D20", border: "1px solid #F8717140" }}>
                          <p className="text-xs" style={{ color: "#F87171" }}>
                            {!meetsMinInj && <>You need at least <strong>{meta?.min_inj} INJ</strong> in your wallet to participate.</>}
                            {nftBlocked && <>You don&apos;t hold the required NFT for this quest.</>}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ═══ LIKE & REPOST flow ══════════════════════════════════ */}
                    {isLikeType && !blocked && (
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: "#EC489920", border: "1px solid #EC489940" }}>
                            <Heart size={14} style={{ color: "#EC4899" }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: text }}>Like &amp; Repost</p>
                            <p className="text-xs" style={{ color: textDim }}>Complete both actions on the target tweet</p>
                          </div>
                        </div>

                        {meta?.target_tweet_url && (
                          <div className="rounded-xl p-3 mb-4" style={{ background: card2, border: `1px solid ${border}` }}>
                            <p className="text-[10px] mb-1" style={{ color: textDim }}>Target tweet</p>
                            <a href={meta.target_tweet_url} target="_blank" rel="noreferrer"
                              className="text-xs font-mono truncate block transition-opacity hover:opacity-70"
                              style={{ color: "#1DA1F2" }}>
                              {meta.target_tweet_url}
                            </a>
                          </div>
                        )}

                        <a href={meta?.target_tweet_url ?? "https://x.com"} target="_blank" rel="noreferrer"
                          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mb-3 transition-opacity hover:opacity-80 no-underline"
                          style={{ background: "#1DA1F220", border: "1px solid #1DA1F240", color: "#1DA1F2" }}>
                          <Repeat2 size={14} /> Open Tweet on Twitter / X
                        </a>

                        <div className="rounded-xl p-3 mb-4 space-y-2" style={{ background: card2 }}>
                          {["Like the tweet (❤️ button)", "Repost / Retweet it"].map(t => (
                            <div key={t} className="flex items-center gap-2">
                              <CheckCircle2 size={11} style={{ color: "#22C55E" }} />
                              <p className="text-xs" style={{ color: textSub }}>{t}</p>
                            </div>
                          ))}
                        </div>

                        {submitError && (
                          <div className="rounded-xl p-3 mb-3 flex items-start gap-2"
                            style={{ background: "#7F1D1D20", border: "1px solid #F8717140" }}>
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
                            <p className="text-xs" style={{ color: "#F87171" }}>{submitError}</p>
                          </div>
                        )}

                        <button
                          onClick={() => quickSubmit(meta?.target_tweet_url ?? `liked+retweeted:${campaignId}`)}
                          disabled={submitting || spotsLeft <= 0 || blocked}
                          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-40"
                          style={{ background: "#D97706", color: "#FFF8F0" }}
                        >
                          {submitting ? (
                            <><Loader2 size={14} className="animate-spin" /> Submitting on-chain…</>
                          ) : (
                            <><CheckCircle2 size={14} /> I&apos;ve liked &amp; retweeted — Submit Proof</>
                          )}
                        </button>
                      </div>
                    )}

                    {/* ═══ FOLLOW flow ══════════════════════════════════════════ */}
                    {isFollowType && !blocked && (
                      <div className="p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                            style={{ background: "#22C55E18", border: "1px solid #22C55E30" }}>
                            <UserPlus size={14} style={{ color: "#22C55E" }} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: text }}>Follow Account</p>
                            <p className="text-xs" style={{ color: textDim }}>Follow the required account on Twitter / X</p>
                          </div>
                        </div>

                        {meta?.follow_handle && (
                          <div className="rounded-xl p-3 mb-4 flex items-center gap-3"
                            style={{ background: card2, border: `1px solid ${border}` }}>
                            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: "#1DA1F220" }}>
                              <UserPlus size={14} style={{ color: "#1DA1F2" }} />
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: text }}>@{meta.follow_handle}</p>
                              <p className="text-xs" style={{ color: textDim }}>Twitter / X account</p>
                            </div>
                          </div>
                        )}

                        <a href={`https://twitter.com/intent/follow?screen_name=${meta?.follow_handle ?? ""}`}
                          target="_blank" rel="noreferrer"
                          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mb-3 transition-opacity hover:opacity-80 no-underline"
                          style={{ background: "#1DA1F220", border: "1px solid #1DA1F240", color: "#1DA1F2" }}>
                          <UserPlus size={14} /> Follow @{meta?.follow_handle} on Twitter
                        </a>

                        {submitError && (
                          <div className="rounded-xl p-3 mb-3 flex items-start gap-2"
                            style={{ background: "#7F1D1D20", border: "1px solid #F8717140" }}>
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
                            <p className="text-xs" style={{ color: "#F87171" }}>{submitError}</p>
                          </div>
                        )}

                        <button
                          onClick={() => quickSubmit(`https://twitter.com/intent/follow?screen_name=${meta?.follow_handle ?? campaignId}`)}
                          disabled={submitting || spotsLeft <= 0 || blocked}
                          className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-40"
                          style={{ background: "#D97706", color: "#FFF8F0" }}
                        >
                          {submitting ? (
                            <><Loader2 size={14} className="animate-spin" /> Submitting on-chain…</>
                          ) : (
                            <><CheckCircle2 size={14} /> I&apos;m following — Submit Proof</>
                          )}
                        </button>
                      </div>
                    )}

                    {/* ═══ POST / QUOTE TWEET flow (3-step wizard) ════════════ */}
                    {isPostType && !blocked && (
                      <div>
                        {/* Step indicator */}
                        <div className="px-5 py-4 flex items-center gap-0" style={{ borderBottom: `1px solid ${border}` }}>
                          {([1, 2, 3] as const).map(n => (
                            <StepDot key={n} n={n} current={questStep} />
                          ))}
                          <span className="ml-3 text-xs font-medium" style={{ color: textSub }}>
                            {questStep === 1 ? "Generate Post" : questStep === 2 ? "Post on Twitter" : "Submit & Verify"}
                          </span>
                        </div>

                        <div className="p-5">

                          {/* Step 1: AI generator */}
                          {questStep === 1 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: "linear-gradient(135deg, #7C3AED, #A78BFA)" }}>
                                  <Bot size={14} color="#FFF" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold" style={{ color: text }}>AI Post Generator</p>
                                  <p className="text-xs" style={{ color: textDim }}>Tailored to this campaign</p>
                                </div>
                              </div>

                              {questType === "quote_tweet" && meta?.target_tweet_url && (
                                <div className="rounded-xl p-3 mb-4" style={{ background: card2, border: `1px solid ${border}` }}>
                                  <p className="text-[10px] mb-1" style={{ color: textDim }}>You will quote-tweet</p>
                                  <a href={meta.target_tweet_url} target="_blank" rel="noreferrer"
                                    className="text-xs truncate block transition-opacity hover:opacity-70"
                                    style={{ color: "#1DA1F2" }}>
                                    {meta.target_tweet_url}
                                  </a>
                                </div>
                              )}

                              {!generated ? (
                                <div className="rounded-xl p-5 text-center mb-4"
                                  style={{ background: card2, border: "1px dashed " + border2 }}>
                                  <p className="text-xs mb-4 leading-relaxed" style={{ color: textDim }}>
                                    Generate a{" "}
                                    <span className="capitalize font-medium" style={{ color: platformColor }}>
                                      {campaign.target_platform}
                                    </span>{" "}
                                    post based on the campaign brief
                                  </p>
                                  <button onClick={generateContent} disabled={generating}
                                    className="px-4 py-2 rounded-xl text-xs font-medium flex items-center gap-2 mx-auto transition-opacity hover:opacity-80 disabled:opacity-50"
                                    style={{ background: "linear-gradient(135deg, #7C3AED18, #A78BFA18)", border: "1px solid #7C3AED40", color: "#A78BFA" }}>
                                    {generating ? <><Loader2 size={11} className="animate-spin" /> Generating…</> : <><Bot size={11} /> Generate Post</>}
                                  </button>
                                </div>
                              ) : (
                                <div className="mb-4">
                                  <div className="rounded-xl p-3 mb-2" style={{ background: card2, border: `1px solid ${border2}` }}>
                                    <textarea value={generated} onChange={e => setGenerated(e.target.value)}
                                      rows={5}
                                      className="w-full bg-transparent text-xs leading-relaxed resize-none focus:outline-none"
                                      style={{ color: textSub }} />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button onClick={copyToClipboard}
                                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
                                      style={{ background: card2, border: `1px solid ${border2}`, color: copied ? "#22C55E" : textSub }}>
                                      {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                                    </button>
                                    <button onClick={generateContent} disabled={generating}
                                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-50"
                                      style={{ background: card2, border: `1px solid ${border2}`, color: textSub }}>
                                      <RefreshCw size={11} /> Regenerate
                                    </button>
                                  </div>
                                </div>
                              )}

                              <button onClick={() => setQuestStep(2)} disabled={!generated || blocked}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-40"
                                style={{ background: "#D97706", color: "#FFF8F0" }}>
                                Next: Post on {campaign.target_platform} <ArrowRight size={13} />
                              </button>
                              <button onClick={() => setQuestStep(2)} disabled={blocked}
                                className="w-full text-center text-xs mt-2 py-1 transition-opacity hover:opacity-70 disabled:opacity-40"
                                style={{ color: textDim }}>
                                Skip — I&apos;ll write my own post
                              </button>
                            </div>
                          )}

                          {/* Step 2: Post on Twitter */}
                          {questStep === 2 && (
                            <div>
                              <p className="text-sm font-semibold mb-1.5" style={{ color: text }}>
                                {questType === "quote_tweet" ? "Quote Tweet" : `Post on ${campaign.target_platform}`}
                              </p>
                              <p className="text-xs mb-4 leading-relaxed" style={{ color: textSub }}>
                                {questType === "quote_tweet"
                                  ? "Open Twitter to quote the target tweet. Copy the link to your quote tweet — you'll paste it next."
                                  : "Use the generated content (or write your own) to create a post. Copy the link to your tweet — you'll paste it in the next step."}
                              </p>

                              {generated && (
                                <div className="rounded-xl p-3 mb-4 relative"
                                  style={{ background: card2, border: `1px solid ${border}` }}>
                                  <p className="text-xs leading-relaxed line-clamp-4 pr-8" style={{ color: textSub }}>{generated}</p>
                                  <button onClick={copyToClipboard}
                                    className="absolute top-2 right-2 p-1.5 rounded-lg transition-opacity hover:opacity-70"
                                    style={{ background: card2, color: copied ? "#22C55E" : textDim }}>
                                    {copied ? <Check size={11} /> : <Copy size={11} />}
                                  </button>
                                </div>
                              )}

                              <button onClick={postOnTwitter}
                                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 mb-3 transition-opacity hover:opacity-80"
                                style={{ background: "#1DA1F220", border: "1px solid #1DA1F240", color: "#1DA1F2" }}>
                                <Zap size={14} />
                                {questType === "quote_tweet" ? "Open Quote Tweet on Twitter / X" : "Open Twitter / X to Post"}
                              </button>

                              <button onClick={() => setQuestStep(3)}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80"
                                style={{ background: "#D97706", color: "#FFF8F0" }}>
                                I&apos;ve posted — Submit Link <ArrowRight size={13} />
                              </button>
                              <button onClick={() => setQuestStep(1)}
                                className="w-full text-center text-xs mt-2 py-1 transition-opacity hover:opacity-70"
                                style={{ color: textDim }}>
                                ← Back
                              </button>
                            </div>
                          )}

                          {/* Step 3: Submit URL + verify */}
                          {questStep === 3 && (
                            <div>
                              <p className="text-sm font-semibold mb-1.5" style={{ color: text }}>Submit &amp; Verify</p>
                              <p className="text-xs mb-4 leading-relaxed" style={{ color: textSub }}>
                                Paste the link to your{" "}
                                <span className="capitalize" style={{ color: platformColor }}>{campaign.target_platform}</span>{" "}
                                post. We&apos;ll verify it, then record your submission on-chain permanently.
                              </p>

                              <input type="url" value={postUrl}
                                onChange={e => { setPostUrl(e.target.value); setVerifyError(""); setSubmitError(""); }}
                                placeholder="https://x.com/you/status/…"
                                className="w-full px-3 py-2.5 rounded-xl text-xs mb-3 focus:outline-none transition-colors"
                                style={{ background: card2, border: `1px solid ${verifyError || submitError ? "#F87171" : border2}`, color: text }} />

                              {(verifyError || submitError) && (
                                <div className="rounded-xl p-3 mb-3 flex items-start gap-2"
                                  style={{ background: "#7F1D1D20", border: "1px solid #F8717140" }}>
                                  <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: "#F87171" }} />
                                  <p className="text-xs" style={{ color: "#F87171" }}>{verifyError || submitError}</p>
                                </div>
                              )}

                              <button onClick={verifyAndSubmit} disabled={!postUrl.trim() || verifying || submitting || blocked}
                                className="w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-80 disabled:opacity-40"
                                style={{ background: "#D97706", color: "#FFF8F0" }}>
                                {verifying ? (
                                  <><Loader2 size={14} className="animate-spin" /> Verifying tweet…</>
                                ) : submitting ? (
                                  <><Loader2 size={14} className="animate-spin" /> Recording on-chain…</>
                                ) : (
                                  <>Verify &amp; Submit On-chain <CheckCircle2 size={14} /></>
                                )}
                              </button>

                              <button onClick={() => setQuestStep(2)}
                                className="w-full text-center text-xs mt-2 py-1 transition-opacity hover:opacity-70"
                                style={{ color: textDim }}>
                                ← Back
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Already submitted ─── */}
                {walletConnected && !isCreator && hasJoined && hasSubmitted && (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                      style={{ background: "#22C55E18" }}>
                      <CheckCircle2 size={22} style={{ color: "#22C55E" }} />
                    </div>
                    <h3 className="font-bold mb-2 text-sm" style={{ color: text }}>Quest Submitted!</h3>
                    <p className="text-xs mb-4 leading-relaxed" style={{ color: textSub }}>
                      Your submission was recorded on the Injective blockchain.
                      {campaign.distributed
                        ? " Rewards have been distributed."
                        : " Rewards distribute automatically when the quest fills or ends."}
                    </p>

                    {/* Paid badge — shown once rewards distributed to this wallet */}
                    {isPaid && (
                      <div className="rounded-xl px-4 py-3 mb-4 inline-flex items-center gap-2 mx-auto"
                        style={{ background: "#4ADE8018", border: "1px solid #4ADE8040" }}>
                        <Trophy size={14} style={{ color: "#4ADE80" }} />
                        <span className="text-sm font-bold" style={{ color: "#4ADE80" }}>
                          Paid {myRewardInj.toFixed(4)} INJ
                        </span>
                      </div>
                    )}
                    {myPost && (
                      <a href={myPost} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
                        style={{ background: "#D9770620", border: "1px solid #D9770640", color: "#D97706" }}>
                        <ExternalLink size={11} /> View your submission
                      </a>
                    )}
                    {/* Read-only badge when campaign has ended (fix #20) */}
                    {(campaign.distributed || campaign.status?.toLowerCase() !== "active") && (
                      <div className="rounded-xl px-3 py-2 mt-4 inline-flex items-center gap-1.5 mx-auto"
                        style={{ background: "#6B728018", border: "1px solid #6B728040" }}>
                        <Clock size={10} style={{ color: "#6B7280" }} />
                        <p className="text-[10px]" style={{ color: "#6B7280" }}>
                          Campaign ended · Read-only
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Participant count pill */}
              <div className="rounded-xl p-3 flex items-center justify-between"
                style={{ background: card, border: `1px solid ${border}` }}>
                <div className="flex items-center gap-2">
                  <Users size={13} style={{ color: textDim }} />
                  <span className="text-xs" style={{ color: textSub }}>Participants</span>
                </div>
                <span className="text-xs font-bold" style={{ color: text }}>
                  {campaign.participant_count} / {campaign.max_participants}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
