"use client";
import React, { Suspense, useState, useRef, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Sparkles, CheckCircle2,
  Upload, Info, Calendar, AtSign, Hash, Trophy,
  Zap, Users, Gift, FileText, BarChart2,
  AlertCircle, Coins, Lock, Save, Check,
  Heart, UserPlus, MessageSquare, Globe, Repeat2,
  Wand2, Send, Bot, ChevronDown,
} from "lucide-react";
import AppNav from "@/components/AppNav";
import { useToast } from "@/components/Toast";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import {
  buildExecuteMsg, broadcastWithKeplr,
  injToWei, fetchInjBalance, queryContract,
  PLATFORM_FEE_RATE,
} from "@/lib/injective";
import type { CampaignDraft } from "@/app/campaigns/page";
import { saveCampaignMetadata } from "@/lib/supabase";
import type { QuestType, EntryCriteria } from "@/lib/supabase";

const DRAFTS_KEY = (addr: string) => `rb_campaign_drafts_${addr}`;

// ── Palettes ──────────────────────────────────────────────────────────────────
const LIGHT_C = {
  page:         "#F5F0E8",
  card:         "#FFFFFF",
  cardAlt:      "#FAF7F2",
  sectionHead:  "#EDE8DF",
  input:        "#FAF7F2",
  border:       "#DDD6C5",
  borderStrong: "#C5BB9E",
  text:         "#180E02",
  textMed:      "#4A3520",
  textLight:    "#8C6A3A",
  textMuted:    "#A89878",
  amber:        "#B9752B",
  amberBg:      "#B9752B14",
  amberBorder:  "#B9752B40",
  green:        "#ADC6A3",
  greenDark:    "#5A7A52",
  greenBg:      "#ADC6A322",
  greenBorder:  "#ADC6A355",
  beige:        "#DDD6C5",
  error:        "#DC2626",
  errorBg:      "#FEE2E220",
  errorBorder:  "#FCA5A540",
};

const DARK_C: typeof LIGHT_C = {
  page:         "#0D0A07",
  card:         "#161210",
  cardAlt:      "#100D0A",
  sectionHead:  "#1C1510",
  input:        "#100D0A",
  border:       "#2A2018",
  borderStrong: "#3A2E20",
  text:         "#F0EAE0",
  textMed:      "#D5CABD",
  textLight:    "#B8A990",
  textMuted:    "#7A6855",
  amber:        "#B9752B",
  amberBg:      "#B9752B1C",
  amberBorder:  "#B9752B4A",
  green:        "#ADC6A3",
  greenDark:    "#7DB573",
  greenBg:      "#ADC6A31F",
  greenBorder:  "#ADC6A350",
  beige:        "#3A2E20",
  error:        "#F87171",
  errorBg:      "#7F1D1D20",
  errorBorder:  "#F8717140",
};

// ── Theme context (scoped to this page) ───────────────────────────────────────
const ColorCtx = createContext<typeof LIGHT_C>(LIGHT_C);
const useC = () => useContext(ColorCtx);

// ── Helpers ───────────────────────────────────────────────────────────────────
const today    = new Date().toISOString().split("T")[0];
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];
const PLATFORM_FEE = 0.05;

const inp = "w-full rounded-lg px-3.5 py-2.5 text-sm focus:outline-none transition-colors";

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const C = useC();
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200"
      style={{ background: checked ? C.amber : C.border }}
    >
      <span
        className="inline-block h-5 w-5 transform rounded-full shadow-sm transition-transform duration-200 mt-0.5"
        style={{ background: checked ? "#FFF8F0" : "#FFFFFF", transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function XPBadge({ label, variant = "amber" }: { label: string; variant?: "amber" | "green" }) {
  const C = useC();
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-semibold"
      style={
        variant === "green"
          ? { background: C.greenBg, color: C.greenDark, border: `1px solid ${C.greenBorder}` }
          : { background: C.amber, color: "#FFF8F0" }
      }
    >
      {label}
    </span>
  );
}

function SectionCard({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode;
}) {
  const C = useC();
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ background: C.sectionHead, borderBottom: `1px solid ${C.border}` }}
      >
        <span style={{ color: C.amber }}>{icon}</span>
        <div>
          <p className="text-sm font-semibold" style={{ color: C.text }}>{title}</p>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-4" style={{ background: C.card }}>{children}</div>
    </div>
  );
}

function Field({ label, helper, charCount, max, required, children }: {
  label: string; helper?: string; charCount?: number; max?: number; required?: boolean; children: React.ReactNode;
}) {
  const C = useC();
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: C.textMed }}>
        {label}{required && <span className="ml-0.5" style={{ color: C.amber }}>*</span>}
      </label>
      {children}
      <div className="flex items-center justify-between mt-1.5">
        {helper && <p className="text-xs" style={{ color: C.textMuted }}>{helper}</p>}
        {charCount !== undefined && max && (
          <p className="text-xs ml-auto" style={{ color: charCount > max * 0.9 ? C.amber : C.textMuted }}>
            {charCount}/{max}
          </p>
        )}
      </div>
    </div>
  );
}

function UrlUploadField({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder: string;
}) {
  const C = useC();
  const inpStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.text };
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex gap-2">
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={inp + " flex-1"} style={{ ...inpStyle }}
      />
      <button type="button" onClick={() => ref.current?.click()}
        className="px-3 rounded-lg flex items-center justify-center shrink-0 transition-opacity hover:opacity-70"
        style={{ background: C.sectionHead, border: `1px solid ${C.border}`, color: C.textMuted }}
      >
        <Upload size={15} />
      </button>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { if (e.target.files?.[0]) onChange(URL.createObjectURL(e.target.files[0])); }} />
    </div>
  );
}

// ── Step 1: Basic Info ────────────────────────────────────────────────────────
function BasicInfo({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const C = useC();
  const inpStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.text };
  return (
    <div className="space-y-5">
      <div className="mb-5">
        <h2 className="font-semibold text-base mb-0.5" style={{ color: C.text }}>Basic Campaign Information</h2>
        <p className="text-xs" style={{ color: C.textMuted }}>Provide the essential details for your quest campaign</p>
      </div>

      <Field label="Campaign Title" required helper="Keep it clear and engaging — this is the first thing participants see."
        charCount={form.title.length} max={100}>
        <input className={inp} style={inpStyle} placeholder="Enter a short, action-oriented title"
          maxLength={100} value={form.title} onChange={e => set("title", e.target.value)} />
      </Field>

      <Field label="Campaign Description" required
        helper="Explain what participants will do, why it matters, and what they earn."
        charCount={form.description.length} max={500}>
        <textarea className={inp} style={{ ...inpStyle, resize: "none" }} rows={5}
          placeholder="Describe what users will achieve and why it matters…"
          maxLength={500} value={form.description} onChange={e => set("description", e.target.value)} />
      </Field>

      <Field label="Organization Name" required
        helper="Your organization name as it will appear on the campaign page."
        charCount={form.org.length} max={100}>
        <input className={inp} style={inpStyle} placeholder="Enter your organization or company name"
          maxLength={100} value={form.org} onChange={e => set("org", e.target.value)} />
      </Field>

      {/* Logo & banner fields removed — org name displays in quest cards */}
    </div>
  );
}

// ── Step 2: Quest Setup ───────────────────────────────────────────────────────
function duration(start: string, startT: string, end: string, endT: string) {
  const s = new Date(`${start}T${startT}`);
  const e = new Date(`${end}T${endT}`);
  const diff = e.getTime() - s.getTime();
  if (diff <= 0) return null;
  const days  = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  return `${days}d ${hours}h`;
}

const QUEST_TYPE_OPTIONS: { key: QuestType; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "post_original", label: "Original Post",  desc: "Write & publish an original post",         icon: <FileText size={17} /> },
  { key: "like_repost",   label: "Like & Repost",  desc: "Like and repost a specific tweet",          icon: <Repeat2  size={17} /> },
  { key: "follow",        label: "Follow Account", desc: "Follow a Twitter/X account",                icon: <UserPlus size={17} /> },
  { key: "quote_tweet",   label: "Quote Tweet",    desc: "Quote tweet with original content",         icon: <MessageSquare size={17} /> },
];

const CRITERIA_OPTIONS: { key: EntryCriteria; label: string; desc: string; icon: React.ReactNode }[] = [
  { key: "none",          label: "Open to All",      desc: "Anyone can join",                         icon: <Globe  size={15} /> },
  { key: "min_inj",       label: "Min INJ Balance",  desc: "Require a minimum INJ balance",           icon: <Coins  size={15} /> },
  { key: "nft_holder",    label: "NFT Holder",       desc: "Must hold an NFT from a collection",      icon: <Trophy size={15} /> },
];

function QuestSetup({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const C = useC();
  const inpStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.text };
  const dur = duration(form.startDate, form.startTime, form.endDate, form.endTime);

  // Multi-select quest types
  const questTypes: string[] = Array.isArray(form.questTypes) ? form.questTypes : [form.questType];
  const toggleQuestType = (key: string) => {
    const current: string[] = Array.isArray(form.questTypes) ? form.questTypes : [form.questType];
    const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    set("questTypes", updated.length ? updated : [key]);
    if (updated.length === 1) set("questType", updated[0]);
  };

  // Multi-select entry criteria
  const criteria: string[] = Array.isArray(form.entryCriteriaList) ? form.entryCriteriaList : [form.entryCriteria];
  const toggleCriteria = (key: string) => {
    const current: string[] = Array.isArray(form.entryCriteriaList) ? form.entryCriteriaList : [form.entryCriteria];
    const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    set("entryCriteriaList", updated.length ? updated : [key]);
    if (updated.length === 1) set("entryCriteria", updated[0]);
  };

  return (
    <div className="space-y-5">
      <div className="mb-5">
        <h2 className="font-semibold text-base mb-0.5" style={{ color: C.text }}>Quest Configuration</h2>
        <p className="text-xs" style={{ color: C.textMuted }}>Choose quest types, set entry criteria, and configure the timeline. Multiple selections allowed.</p>
      </div>

      {/* ── Quest Type ─── */}
      <SectionCard icon={<Zap size={16} />} title="Quest Type"
        subtitle="Select one or more actions participants must complete">
        <div className="grid grid-cols-2 gap-3">
          {QUEST_TYPE_OPTIONS.map(qt => {
            const sel = questTypes.includes(qt.key);
            return (
              <button key={qt.key} type="button" onClick={() => toggleQuestType(qt.key)}
                className="text-left rounded-xl p-3.5 transition-all"
                style={{
                  background: sel ? C.amberBg : C.cardAlt,
                  border: `1px solid ${sel ? C.amber : C.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ color: sel ? C.amber : C.textMuted }}>{qt.icon}</span>
                  <span className="text-sm font-semibold" style={{ color: C.text }}>{qt.label}</span>
                  {sel && (
                    <Check size={12} className="ml-auto shrink-0" style={{ color: C.amber }} />
                  )}
                </div>
                <p className="text-xs" style={{ color: C.textMuted }}>{qt.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Type-specific fields */}
        {(questTypes.includes("like_repost") || questTypes.includes("quote_tweet")) && (
          <Field label="Target Tweet URL" required
            helper="The tweet participants will like/repost or quote">
            <input className={inp} style={inpStyle}
              placeholder="https://x.com/account/status/1234567890"
              value={form.targetTweetUrl}
              onChange={e => set("targetTweetUrl", e.target.value)} />
          </Field>
        )}
        {questTypes.includes("follow") && (
          <Field label="Account to Follow" required helper="Twitter/X username without @">
            <div className="relative">
              <AtSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textMuted }} />
              <input className={inp} style={{ ...inpStyle, paddingLeft: "2rem" }}
                placeholder="username"
                value={form.followHandle}
                onChange={e => set("followHandle", e.target.value)} />
            </div>
          </Field>
        )}
        {(questTypes.includes("post_original") || questTypes.includes("quote_tweet")) && (
          <div className="space-y-3">
            <Field label="Required Hashtags" helper="Comma-separated, no # symbol">
              <div className="relative">
                <Hash size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textMuted }} />
                <input className={inp} style={{ ...inpStyle, paddingLeft: "2rem" }}
                  placeholder="web3, quest, campaign"
                  value={form.requiredHashtags}
                  onChange={e => set("requiredHashtags", e.target.value)} />
              </div>
            </Field>
            <Field label="Accounts to Tag" helper="Comma-separated, no @ symbol">
              <div className="relative">
                <AtSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textMuted }} />
                <input className={inp} style={{ ...inpStyle, paddingLeft: "2rem" }}
                  placeholder="account1, account2"
                  value={form.tagAccounts}
                  onChange={e => set("tagAccounts", e.target.value)} />
              </div>
            </Field>
          </div>
        )}
      </SectionCard>

      {/* ── Entry Criteria ─── */}
      <SectionCard icon={<Lock size={16} />} title="Entry Criteria"
        subtitle="Select one or more eligibility requirements">
        <div className="grid grid-cols-2 gap-3">
          {CRITERIA_OPTIONS.map(cr => {
            const sel = criteria.includes(cr.key);
            return (
              <button key={cr.key} type="button" onClick={() => toggleCriteria(cr.key)}
                className="text-left rounded-xl p-3 transition-all"
                style={{
                  background: sel ? C.amberBg : C.cardAlt,
                  border: `1px solid ${sel ? C.amber : C.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span style={{ color: sel ? C.amber : C.textMuted }}>{cr.icon}</span>
                  <span className="text-xs font-semibold" style={{ color: C.text }}>{cr.label}</span>
                  {sel && <Check size={11} className="ml-auto shrink-0" style={{ color: C.amber }} />}
                </div>
                <p className="text-[11px]" style={{ color: C.textMuted }}>{cr.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Criteria-specific fields */}
        {criteria.includes("min_inj") && (
          <Field label="Minimum INJ Balance" required helper="Participants must hold at least this much INJ in their wallet">
            <input type="number" min={0.1} step={0.1} className={inp}
              style={{ ...inpStyle, maxWidth: "200px" }}
              value={form.minInj}
              onChange={e => set("minInj", Number(e.target.value))} />
          </Field>
        )}
        {criteria.includes("nft_holder") && (
          <Field label="NFT Collection Contract" required helper="CW721 contract address on Injective testnet">
            <input className={inp} style={inpStyle}
              placeholder="inj1…"
              value={form.nftContract}
              onChange={e => set("nftContract", e.target.value)} />
          </Field>
        )}
      </SectionCard>

      {/* ── Timeline ─── */}
      <SectionCard icon={<Calendar size={16} />} title="Timeline & Participation"
        subtitle="Configure when your quest runs and how many can join">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Start Date" required>
            <input type="date" className={inp} style={inpStyle}
              value={form.startDate} onChange={e => set("startDate", e.target.value)} />
          </Field>
          <Field label="End Date" required>
            <input type="date" className={inp} style={inpStyle}
              value={form.endDate} onChange={e => set("endDate", e.target.value)} />
          </Field>
          <Field label="Max Participants" required>
            <input type="number" min={10} max={10000} className={inp} style={inpStyle}
              value={form.maxParticipants} onChange={e => set("maxParticipants", Number(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="" helper="Start time (UTC)">
            <input type="time" className={inp} style={inpStyle}
              value={form.startTime} onChange={e => set("startTime", e.target.value)} />
          </Field>
          <Field label="" helper={dur ? `End time (UTC) · Duration: ${dur}` : "End time (UTC, min 10 min after start)"}>
            <input type="time" className={inp} style={inpStyle}
              value={form.endTime} onChange={e => set("endTime", e.target.value)} />
          </Field>
        </div>
      </SectionCard>
    </div>
  );
}

// ── Step 3: AI Knowledge ──────────────────────────────────────────────────────
function AIKnowledge({ form, set }: { form: any; set: (k: string, v: any) => void }) {
  const C = useC();
  const inpStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.text };
  const pdfRef = useRef<HTMLInputElement>(null);
  const MIN_CHARS = 100;

  return (
    <div className="space-y-5">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-0.5">
          <Sparkles size={15} style={{ color: "#7C3AED" }} />
          <h2 className="font-semibold text-base" style={{ color: C.text }}>AI Knowledge Base</h2>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: C.textMuted }}>
          Upload your knowledge base so participants can generate authentic, on-brand content using AI.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl px-4 py-3.5"
        style={{ background: C.sectionHead, border: `1px solid ${C.border}` }}>
        <div>
          <p className="text-sm font-medium" style={{ color: C.text }}>Enable AI Tweet Generation</p>
          <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>Allow participants to generate tweets using your knowledge base</p>
        </div>
        <Toggle checked={form.enableAI} onChange={v => set("enableAI", v)} />
      </div>

      {form.enableAI && (
        <>
          <div>
            <p className="text-sm font-medium mb-2" style={{ color: C.textMed }}>Knowledge Base Input Method</p>
            <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
              {(["pdf", "text"] as const).map(method => (
                <button key={method} type="button" onClick={() => set("kbMethod", method)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors"
                  style={{
                    background: form.kbMethod === method ? C.amber : C.card,
                    color: form.kbMethod === method ? "#FFF8F0" : C.textMuted,
                  }}
                >
                  <FileText size={14} />
                  {method === "pdf" ? "PDF Upload" : "Manual Text"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2" style={{ color: C.textMed }}>Knowledge Base Content</p>
            {form.kbMethod === "pdf" ? (
              <div
                className="rounded-xl flex flex-col items-center justify-center gap-3 py-12 cursor-pointer transition-opacity hover:opacity-70"
                style={{ background: C.sectionHead, border: `2px dashed ${C.border}` }}
                onClick={() => pdfRef.current?.click()}
              >
                <Upload size={26} style={{ color: C.textMuted }} />
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: C.textMed }}>Click to upload PDF</p>
                  <p className="text-xs mt-1" style={{ color: C.textMuted }}>PDF files up to 10 MB</p>
                </div>
                <input ref={pdfRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) set("pdfFile", e.target.files[0].name); }} />
              </div>
            ) : (
              <div>
                <textarea
                  className={inp}
                  style={{ ...inpStyle, resize: "none" }}
                  rows={9}
                  placeholder={"Enter your organization's knowledge base…\n• Company mission and values\n• Product features and benefits\n• Key achievements and milestones\n• Industry insights and thought leadership\n\nThis content will be used by AI to generate authentic tweets."}
                  value={form.knowledgeBase}
                  onChange={e => set("knowledgeBase", e.target.value)}
                />
                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs" style={{ color: C.textMuted }}>{form.knowledgeBase.length} characters</p>
                  {form.knowledgeBase.length < MIN_CHARS && (
                    <p className="text-xs font-medium" style={{ color: C.amber }}>
                      {MIN_CHARS - form.knowledgeBase.length} more to go
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl px-4 py-3.5 flex gap-3"
            style={{ background: "#7C3AED0C", border: "1px solid #7C3AED22" }}>
            <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: "#7C3AED" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#6D50C0" }}>
              Participants will use this text to generate tweets that are authentic to your brand voice.
              All content follows your hashtags and campaign guidelines automatically.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 4: Rewards ───────────────────────────────────────────────────────────
function Rewards({ form, set, injBalance }: { form: any; set: (k: string, v: any) => void; injBalance: number | null }) {
  const C = useC();
  const inpStyle = { background: C.input, border: `1px solid ${C.border}`, color: C.text };
  const fee       = +(form.rewardAmount * PLATFORM_FEE).toFixed(4);
  const total     = +(form.rewardAmount + fee).toFixed(4);
  const perWinner = form.distribution === "lucky_draw" && form.numWinners > 0
    ? +(form.rewardAmount / form.numWinners).toFixed(3)
    : form.maxParticipants > 0
    ? +(form.rewardAmount / form.maxParticipants).toFixed(3)
    : 0;
  const lowReward   = perWinner > 0 && perWinner < 0.5;
  const winnerCount = form.distribution === "lucky_draw" ? form.numWinners : form.maxParticipants;

  return (
    <div className="space-y-5">
      <div className="mb-5">
        <h2 className="font-semibold text-base mb-0.5" style={{ color: C.text }}>Reward Configuration</h2>
        <p className="text-xs" style={{ color: C.textMuted }}>Set up how participants will be rewarded for completing your quest</p>
      </div>

      <SectionCard icon={<BarChart2 size={16} />} title="Distribution Method"
        subtitle="Choose how rewards reach your participants">
        <div className="grid grid-cols-2 gap-3">
          {[
            {
              key: "lucky_draw", label: "Lucky Draw", badge: "Random Selection",
              bullets: ["Random winners from all participants", "Higher rewards per winner", "Fair selection process"],
            },
            {
              key: "equal", label: "Equal Distribution", badge: "Everyone Wins",
              bullets: ["Split evenly across all participants", "Lower per-person, universal reward", "Most inclusive approach"],
            },
          ].map(opt => {
            const sel = form.distribution === opt.key;
            return (
              <button key={opt.key} type="button" onClick={() => set("distribution", opt.key)}
                className="text-left rounded-xl p-4 transition-all"
                style={{
                  background: sel ? C.amberBg : C.cardAlt,
                  border: `1px solid ${sel ? C.amber : C.border}`,
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: sel ? C.amber : C.borderStrong }}>
                    {sel && <div className="w-2 h-2 rounded-full" style={{ background: C.amber }} />}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: C.text }}>{opt.label}</span>
                </div>
                <XPBadge label={opt.badge} />
                <div className="mt-3 space-y-1.5">
                  {opt.bullets.map(b => (
                    <div key={b} className="flex items-start gap-1.5">
                      <span className="text-xs mt-0.5" style={{ color: C.amber }}>·</span>
                      <p className="text-xs leading-snug" style={{ color: C.textMuted }}>{b}</p>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Reward pool */}
      <SectionCard icon={<Coins size={16} />} title="Reward Pool"
        subtitle="Total amount deposited on-chain to fund this campaign">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total Reward Amount" required helper="Distributed among all winners">
            <input type="number" min={0.1} step={0.1} className={inp} style={inpStyle}
              value={form.rewardAmount} onChange={e => set("rewardAmount", Number(e.target.value))} />
          </Field>
          <Field label="Reward Token" required>
            <div
              className="py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5"
              style={{ background: C.amber, color: "#FFF8F0", border: `1px solid ${C.amber}` }}
            >
              INJ <span className="text-xs opacity-70">(Injective native token)</span>
            </div>
          </Field>
        </div>
      </SectionCard>

      {form.distribution === "lucky_draw" && (
        <SectionCard icon={<Trophy size={16} />} title="Lucky Draw Configuration"
          subtitle={`How many of the ${form.maxParticipants} participants win a reward`}>
          <Field label="Number of Winners" required helper={`Max: ${form.maxParticipants} participants`}>
            <input type="number" min={1} max={form.maxParticipants} className={inp}
              style={{ ...inpStyle, maxWidth: "200px" }}
              value={form.numWinners} onChange={e => set("numWinners", Number(e.target.value))} />
          </Field>
        </SectionCard>
      )}

      {/* Reward summary */}
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
        <div className="px-5 py-3.5 flex items-center gap-2"
          style={{ background: C.sectionHead, borderBottom: `1px solid ${C.border}` }}>
          <BarChart2 size={15} style={{ color: C.amber }} />
          <p className="text-sm font-semibold" style={{ color: C.text }}>Reward Summary</p>
          <p className="text-xs ml-1" style={{ color: C.textMuted }}>Preview of distribution</p>
        </div>
        <div className="p-5" style={{ background: C.card }}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            {[
              { value: `${form.rewardAmount}`, unit: form.rewardToken, label: "Total Pool"  },
              { value: `${winnerCount}`,        unit: form.distribution === "lucky_draw" ? "Lucky Draw" : "Equal Split", label: "Winners" },
              { value: `${perWinner}`,          unit: form.rewardToken, label: "Per Winner"  },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3 text-center"
                style={{ background: C.cardAlt, border: `1px solid ${C.border}` }}>
                <p className="text-xl font-bold" style={{ color: C.amber }}>{s.value}</p>
                <p className="text-xs mt-0.5" style={{ color: C.textLight }}>{s.unit}</p>
                <p className="text-xs mt-1" style={{ color: C.textMuted }}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl p-4 space-y-2"
            style={{ background: C.sectionHead, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: C.text }}>Total Deposit Required</p>
              <p className="text-sm font-bold" style={{ color: C.amber }}>
                {form.rewardAmount} {form.rewardToken}
                <span className="font-normal text-xs ml-1" style={{ color: C.textMuted }}>
                  + {fee} fee
                </span>
              </p>
            </div>
            <div className="space-y-1 pt-1">
              <p className="text-xs" style={{ color: C.textMuted }}>· Rewards: {form.rewardAmount} {form.rewardToken}</p>
              <p className="text-xs" style={{ color: C.textMuted }}>· Platform fee: {fee} {form.rewardToken} (5%)</p>
            </div>
            <p className="text-xs pt-1 leading-relaxed" style={{ color: C.textMuted }}>
              Transferred from your wallet in a single transaction when you create the campaign.
            </p>
          </div>

          {lowReward && (
            <div className="mt-3 rounded-xl p-3 flex items-start gap-2"
              style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}` }}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: C.amber }} />
              <p className="text-xs" style={{ color: C.textLight }}>
                Reward per winner is very low ({perWinner} {form.rewardToken}).
                Consider fewer winners or a larger pool.
              </p>
            </div>
          )}

          {form.rewardToken === "INJ" && injBalance !== null && injBalance < total && (
            <div className="mt-3 rounded-xl p-3 flex items-start gap-2"
              style={{ background: C.errorBg, border: `1px solid ${C.errorBorder}` }}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: C.error }} />
              <p className="text-xs" style={{ color: C.error }}>
                Insufficient balance — you need {total.toFixed(4)} INJ but your wallet has {injBalance.toFixed(4)} INJ.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar: Campaign Copilot ─────────────────────────────────────────────────

interface CopilotConfig {
  title:             string;
  description:       string;
  quest_type:        string;
  entry_criteria:    string;
  required_hashtags: string;
  follow_handle:     string | null;
  duration_days:     number;
  reward_suggestion: number;
  max_participants:  number;
  distribution:      string;
  reasoning:         string;
  economic_warning:  string | null;
}

/**
 * Chat-first campaign composer.
 * User describes their campaign → copilot returns a complete config → user confirms → fields populated.
 */
function CopilotPanel({
  onApply,
}: {
  onApply: (config: CopilotConfig) => void;
}) {
  const C = useC();
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CopilotConfig | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const run = async () => {
    if (!brief.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setApplied(false);
    try {
      const res = await fetch("/api/agent/copilot", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: "compose", brief: brief.trim() }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setResult(json);
    } catch (e: any) {
      setError(e.message ?? "Copilot failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result) return;
    onApply(result);
    setApplied(true);
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2.5"
        style={{ background: C.sectionHead, borderBottom: `1px solid ${C.border}` }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #B9752B, #7C3AED)" }}>
          <Wand2 size={13} color="#FFF" />
        </div>
        <div>
          <p className="text-xs font-bold" style={{ color: C.text }}>Campaign Copilot</p>
          <p className="text-[10px]" style={{ color: C.textMuted }}>Describe → fill all fields</p>
        </div>
        <div className="ml-auto text-[10px] px-1.5 py-0.5 rounded font-semibold"
          style={{ background: C.amberBg, color: C.amber, border: `1px solid ${C.amberBorder}` }}>
          AI
        </div>
      </div>

      <div className="p-4 space-y-3" style={{ background: C.card }}>
        {/* Brief input */}
        <div className="relative">
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && brief.trim()) { e.preventDefault(); run(); }}}
            placeholder="e.g. 'Grow our DeFi protocol on Injective with an NFT-holder only tweet campaign, 5 INJ pool'"
            rows={3}
            className="w-full rounded-xl px-3.5 py-2.5 text-xs resize-none focus:outline-none"
            style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }}
          />
        </div>

        <button
          onClick={run}
          disabled={!brief.trim() || loading}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
          style={{ background: C.amber, color: "#FFF8F0" }}
        >
          {loading ? (
            <><div className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin" /> Generating…</>
          ) : (
            <><Wand2 size={12} /> Generate Campaign</>
          )}
        </button>

        {/* Error */}
        {error && (
          <p className="text-xs" style={{ color: C.error }}>{error}</p>
        )}

        {/* Result */}
        {result && !applied && (
          <div className="space-y-2 pt-1">
            <div className="rounded-xl p-3 space-y-2" style={{ background: C.sectionHead }}>
              <p className="text-xs font-semibold" style={{ color: C.text }}>{result.title}</p>
              <p className="text-[11px] leading-relaxed" style={{ color: C.textMuted }}>
                {result.description}
              </p>
              <div className="flex flex-wrap gap-1 mt-1">
                {[
                  result.quest_type?.replace("_", " "),
                  result.entry_criteria !== "none" ? result.entry_criteria?.replace("_", " ") : null,
                  `${result.duration_days}d`,
                  `${result.reward_suggestion} INJ`,
                  `${result.max_participants} spots`,
                ].filter((t): t is string => t !== null).map((tag) => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: C.amberBg, color: C.amber }}>
                    {tag}
                  </span>
                ))}
              </div>
              {result.reasoning && (
                <p className="text-[10px] italic" style={{ color: C.textMuted }}>
                  {result.reasoning}
                </p>
              )}
            </div>

            {result.economic_warning && (
              <div className="rounded-lg p-2.5 flex items-start gap-2"
                style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}` }}>
                <AlertCircle size={11} className="shrink-0 mt-0.5" style={{ color: C.amber }} />
                <p className="text-[10px]" style={{ color: C.textLight }}>{result.economic_warning}</p>
              </div>
            )}

            <button
              onClick={apply}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: C.greenBg, color: C.greenDark, border: `1px solid ${C.greenBorder}` }}
            >
              <CheckCircle2 size={12} /> Apply to form
            </button>
          </div>
        )}

        {applied && (
          <div className="flex items-center gap-2 justify-center py-1"
            style={{ color: C.greenDark }}>
            <CheckCircle2 size={13} />
            <p className="text-xs font-medium">Applied! Review and adjust above.</p>
          </div>
        )}

        <p className="text-[10px] text-center" style={{ color: C.textMuted }}>
          Copilot fills title, description, quest type, criteria, duration, reward & participants.
        </p>
      </div>
    </div>
  );
}

// ── Sidebar: AI Assistant ─────────────────────────────────────────────────────
function AISidebar({ onOpen }: { onOpen: () => void }) {
  const C = useC();
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-5 flex flex-col gap-4"
        style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #7C3AED, #A78BFA)" }}>
            <Sparkles size={15} color="#FFF" />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: C.text }}>AI Assistant</p>
            <p className="text-xs" style={{ color: C.textMuted }}>Powered by DeepSeek</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: C.textMuted }}>
          Generate a campaign title and description — pick your category, tone, and language.
        </p>
        <button onClick={onOpen}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
          style={{ background: "linear-gradient(135deg, #7C3AED, #A78BFA)", color: "#FFF" }}>
          <Sparkles size={13} /> Open AI Assistant
        </button>
      </div>

      <div className="rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.border}` }}>
        <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: C.textMuted }}>
          Quick tips
        </p>
        <div className="space-y-2.5">
          {[
            { icon: <Coins size={12} />,     tip: "Hook with the reward amount"    },
            { icon: <Zap size={12} />,       tip: "Name your chain or protocol"    },
            { icon: <FileText size={12} />,  tip: "One clear action per campaign"  },
            { icon: <Calendar size={12} />,  tip: "3–7 day windows work best"      },
            { icon: <Trophy size={12} />,    tip: "Generous rewards attract quality"},
          ].map(({ icon, tip }) => (
            <p key={tip} className="text-xs leading-snug flex items-start gap-2" style={{ color: C.textMuted }}>
              <span style={{ color: C.amber, marginTop: "1px", flexShrink: 0 }}>{icon}</span>
              {tip}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sidebar: Campaign Summary (step 4) ────────────────────────────────────────
function CampaignSummary({ form }: { form: any }) {
  const C = useC();
  const fee = +(form.rewardAmount * PLATFORM_FEE).toFixed(4);
  const fmt = (d: string) => d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
      <div className="px-5 py-3.5" style={{ background: C.sectionHead, borderBottom: `1px solid ${C.border}` }}>
        <p className="text-sm font-bold" style={{ color: C.text }}>Campaign Summary</p>
      </div>
      <div className="p-5 space-y-3" style={{ background: C.card }}>
        {[
          { label: "Title",    value: form.title || "Untitled Campaign"                  },
          { label: "Starts",   value: `${fmt(form.startDate)}, ${form.startTime || "—"}` },
          { label: "Ends",     value: `${fmt(form.endDate)}, ${form.endTime || "—"}`     },
          { label: "Reward",   value: `${form.rewardAmount} ${form.rewardToken}`          },
          { label: "Capacity", value: `${form.maxParticipants} participants`              },
        ].map(row => (
          <div key={row.label} className="flex items-start justify-between gap-2">
            <p className="text-xs" style={{ color: C.textMuted }}>{row.label}</p>
            <p className="text-xs font-medium text-right" style={{ color: C.text }}>{row.value}</p>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: C.textMuted }}>Distribution</p>
          <XPBadge label={form.distribution === "lucky_draw" ? "Lucky Draw" : "Equal Split"} />
        </div>
        <div className="pt-3 mt-1 border-t" style={{ borderColor: C.border }}>
          <p className="text-xs mb-1" style={{ color: C.textMuted }}>Total Deposit</p>
          <p className="text-base font-bold" style={{ color: C.amber }}>
            {form.rewardAmount + fee} {form.rewardToken}
          </p>
          <p className="text-xs mt-0.5" style={{ color: C.textMuted }}>
            {form.rewardAmount} reward + {fee} platform fee
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [
  { icon: <FileText size={16} />,  label: "Basic Info",   sub: "Campaign details"    },
  { icon: <Zap size={16} />,       label: "Quest Setup",  sub: "Tasks & timeline"    },
  { icon: <Sparkles size={16} />,  label: "AI Knowledge", sub: "Knowledge base"      },
  { icon: <Coins size={16} />,     label: "Rewards",      sub: "Distribution & pool" },
];

// ── Main ──────────────────────────────────────────────────────────────────────
function CreateCampaignPage() {
  const { address: keplrAddr } = useWalletStore();
  const { dark } = useTheme();
  const { toast } = useToast();

  // Injective sender address (Keplr / Cosmos only)
  const senderAddr: string | null = keplrAddr ?? null;
  const walletConnected = !!keplrAddr;
  const walletKey       = keplrAddr ?? null;

  const C = dark ? DARK_C : LIGHT_C;

  const searchParams = useSearchParams();
  const draftId      = searchParams.get("draft");

  const [step,        setStep]        = useState(0);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitted,   setSubmitted]   = useState(false);
  const [txHash,      setTxHash]      = useState("");
  const [injBalance,  setInjBalance]  = useState<number | null>(null);
  const [draftSaved,  setDraftSaved]  = useState(false);
  const [submitError, setSubmitError] = useState("");
  // Agent (operator) address — set as the campaign operator so rewards can be
  // distributed autonomously when the campaign fills or its end time passes.
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/agent/address")
      .then(r => r.json())
      .then(d => setAgentAddress(typeof d?.address === "string" ? d.address : null))
      .catch(() => {});
  }, []);

  // Apply copilot result to form fields
  const applyCopilot = (config: CopilotConfig) => {
    const QT_MAP: Record<string, QuestType> = {
      post_original: "post_original",
      like_repost:   "like_repost",
      follow:        "follow",
      quote_tweet:   "quote_tweet",
    };
    const EC_MAP: Record<string, EntryCriteria> = {
      none:          "none",
      min_inj:       "min_inj",
      nft_holder:    "nft_holder",
    };
    setFormRaw(prev => ({
      ...prev,
      title:            config.title          ?? prev.title,
      description:      config.description    ?? prev.description,
      questType:        QT_MAP[config.quest_type] ?? prev.questType,
      entryCriteria:    EC_MAP[config.entry_criteria] ?? prev.entryCriteria,
      requiredHashtags: config.required_hashtags ?? prev.requiredHashtags,
      followHandle:     config.follow_handle  ?? prev.followHandle,
      rewardAmount:     config.reward_suggestion ?? prev.rewardAmount,
      maxParticipants:  config.max_participants  ?? prev.maxParticipants,
      distribution:     (config.distribution === "equal" || config.distribution === "lucky_draw")
                        ? config.distribution : prev.distribution,
      // duration_days → compute a new end date from today
      endDate: config.duration_days
        ? new Date(Date.now() + Number(config.duration_days) * 86_400_000).toISOString().split("T")[0]
        : prev.endDate,
    }));
  };

  const [form, setFormRaw] = useState({
    title: "", description: "", org: "", orgLogo: "", questBanner: "",
    startDate: today, startTime: "00:00", endDate: tomorrow, endTime: "00:00",
    maxParticipants: 500,
    // Quest type & criteria (new)
    questType:     "post_original" as QuestType,
    entryCriteria: "none"          as EntryCriteria,
    targetTweetUrl: "",
    followHandle:   "",
    minInj:         1,
    nftContract:    "",
    minFollowers:   100,
    // Post-type config
    requiredHashtags: "web3, quest, campaign", tagAccounts: "",
    // Legacy toggles (kept for draft compat, not shown in UI)
    twitterFollow: false, followAccount: "", twitterPost: false, postLimit: 1,
    enableAI: true, kbMethod: "text" as "pdf" | "text", knowledgeBase: "", pdfFile: "",
    distribution: "lucky_draw" as "lucky_draw" | "equal",
    rewardAmount: 2, rewardToken: "INJ" as "INJ" | "USDC", numWinners: 10,
  });

  const set = (k: string, v: any) => setFormRaw(prev => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (step === 3 && senderAddr) fetchInjBalance(senderAddr).then(setInjBalance);
  }, [step, senderAddr]);

  // Load draft from URL param on mount
  useEffect(() => {
    if (!draftId || !walletKey) return;
    try {
      const raw = localStorage.getItem(DRAFTS_KEY(walletKey));
      if (!raw) return;
      const drafts: CampaignDraft[] = JSON.parse(raw);
      const found = drafts.find(d => d.id === draftId);
      if (!found) return;
      setFormRaw(prev => ({ ...prev, ...(found.form as typeof prev) }));
      setStep(found.step);
    } catch { /* corrupt storage — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, walletKey]);

  const saveDraft = () => {
    if (!walletKey) return;
    try {
      const raw    = localStorage.getItem(DRAFTS_KEY(walletKey));
      const drafts: CampaignDraft[] = raw ? JSON.parse(raw) : [];
      const existingIdx = draftId ? drafts.findIndex(d => d.id === draftId) : -1;
      const draft: CampaignDraft = {
        id:      existingIdx >= 0 ? draftId! : Date.now().toString(),
        savedAt: Date.now(),
        step,
        form:    { ...form },
      };
      if (existingIdx >= 0) drafts[existingIdx] = draft;
      else drafts.unshift(draft);
      localStorage.setItem(DRAFTS_KEY(walletKey), JSON.stringify(drafts));
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 2000);
    } catch { /* storage may be restricted */ }
  };

  const canNext = () => {
    if (step === 0) return form.title.trim() && form.description.trim() && form.org.trim();
    if (step === 1) {
      if (!form.startDate || !form.endDate || form.maxParticipants <= 0) return false;
      // Ensure end is strictly after start
      const startDt = new Date(`${form.startDate}T${form.startTime}`);
      const endDt   = new Date(`${form.endDate}T${form.endTime}`);
      if (isNaN(startDt.getTime()) || isNaN(endDt.getTime()) || endDt <= startDt) return false;
      if ((form.questType === "like_repost" || form.questType === "quote_tweet") && !form.targetTweetUrl.trim()) return false;
      if (form.questType === "follow" && !form.followHandle.trim()) return false;
      if (form.entryCriteria === "min_inj" && !(form.minInj > 0)) return false;
      if (form.entryCriteria === "nft_holder" && !form.nftContract.trim()) return false;
      return true;
    }
    if (step === 3) return form.rewardAmount > 0;
    return true;
  };

  const submit = async () => {
    if (!walletConnected) { setSubmitError("Please connect your wallet first."); return; }
    if (!form.title.trim() || !form.description.trim() || !form.org.trim()) {
      setSubmitError("Please fill in all required fields (title, description, org)."); return;
    }
    if (form.rewardAmount <= 0) { setSubmitError("Reward amount must be greater than 0."); return; }

    setSubmitError("");
    setSubmitting(true);
    try {
      const startMs      = new Date(`${form.startDate}T${form.startTime}`).getTime();
      const endMs        = new Date(`${form.endDate}T${form.endTime}`).getTime();
      const durationDays = Math.max(1, Math.round((endMs - startMs) / 86_400_000));
      // Only the reward amount goes to the contract; the platform fee is
      // collected separately (treasury mechanism) and shown to the creator
      // as informational at create time.
      const funds = [{ denom: "inj", amount: injToWei(form.rewardAmount) }];

      const msg = buildExecuteMsg(senderAddr!, {
        create_campaign: {
          title:            form.title.trim(),
          description:      form.description.trim(),
          target_platform:  "twitter",
          duration_days:    durationDays,
          max_participants: form.maxParticipants,
          operator:         agentAddress,   // agent wallet → enables autonomous reward distribution
        },
      }, funds);

      // Keplr (Cosmos native signDirect flow)
      const hash = await broadcastWithKeplr(keplrAddr!, msg);

      setTxHash(hash);
      setSubmitted(true);

      // Persist tx hash + metadata keyed by campaign ID
      try {
        const res = await queryContract<{ campaigns: { id: number; creator: string; created_at: number }[] }>(
          { list_campaigns: { limit: 100 } }
        );
        const mine   = res.campaigns.filter(c => c.creator.toLowerCase() === senderAddr!.toLowerCase());
        const newest = mine[mine.length - 1];
        if (newest) {
          try { localStorage.setItem(`rb_campaign_${newest.id}_tx`, hash); } catch { /* storage restricted */ }
          // Save quest type + criteria metadata to Supabase
          try {
            await saveCampaignMetadata({
              campaign_id:       newest.id,
              quest_type:        form.questType,
              entry_criteria:    form.entryCriteria,
              min_inj:           form.entryCriteria === "min_inj"       ? form.minInj       : null,
              nft_contract:      form.entryCriteria === "nft_holder"    ? form.nftContract  : null,
              min_followers:     null,
              target_tweet_url:  (form.questType === "like_repost" || form.questType === "quote_tweet")
                                   ? form.targetTweetUrl.trim() : null,
              follow_handle:     form.questType === "follow" ? form.followHandle.trim() : null,
              required_hashtags: form.requiredHashtags || null,
              tag_accounts:      form.tagAccounts || null,
            });
          } catch { /* non-fatal */ }

          // Notify email subscribers about the new quest (fire-and-forget)
          fetch("/api/notify-quest", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title:     form.title,
              platform:  "Twitter",
              rewardInj: form.rewardAmount.toString(),
            }),
          }).catch(() => {});
        }
      } catch { /* non-fatal metadata persistence */ }

      // Remove draft from localStorage after successful submission
      if (walletKey && draftId) {
        try {
          const raw = localStorage.getItem(DRAFTS_KEY(walletKey));
          if (raw) {
            const remaining = (JSON.parse(raw) as CampaignDraft[]).filter(d => d.id !== draftId);
            localStorage.setItem(DRAFTS_KEY(walletKey), JSON.stringify(remaining));
          }
        } catch { /* storage restricted */ }
      }
    } catch (e: any) {
      const errMsg = e?.message ?? "Transaction failed";
      const displayMsg = errMsg.includes("insufficient funds") || errMsg.toLowerCase().includes("not enough")
        ? `Insufficient INJ. You need ${(form.rewardAmount * (1 + PLATFORM_FEE_RATE)).toFixed(4)} INJ (${form.rewardAmount} reward + ${(form.rewardAmount * PLATFORM_FEE_RATE).toFixed(4)} fee).`
        : errMsg.includes("rejected")
        ? "Transaction rejected in wallet."
        : errMsg;
      setSubmitError(displayMsg);
      toast.error(displayMsg, 0); // sticky — user must dismiss explicitly after tx failure
    } finally { setSubmitting(false); }
  };

  // ── Success ─────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <ColorCtx.Provider value={C}>
        <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4"
          style={{ background: C.page, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
          <div className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: C.greenBg, border: `2px solid ${C.greenBorder}` }}>
            <CheckCircle2 size={34} style={{ color: C.greenDark }} />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2" style={{ color: C.text, letterSpacing: "-0.02em" }}>
              Campaign Created
            </h2>
            <p className="text-sm max-w-sm" style={{ color: C.textMuted }}>
              Your reward pool is funded on-chain. Participants can now discover and join your quest.
            </p>
          </div>
          {txHash && (
            <div className="rounded-2xl p-5 max-w-sm w-full text-center"
              style={{ background: C.card, border: `1px solid ${C.greenBorder}` }}>
              <p className="text-xs mb-1" style={{ color: C.textMuted }}>Transaction confirmed</p>
              <p className="text-xs font-mono break-all mb-3" style={{ color: C.textMed }}>{txHash}</p>
              <a href={`https://testnet.explorer.injective.network/transaction/${txHash}`}
                target="_blank" rel="noreferrer"
                className="text-xs font-medium hover:opacity-70 transition-opacity"
                style={{ color: C.amber }}>
                View on Injective Explorer
              </a>
            </div>
          )}
          <div className="flex gap-3">
            <Link href="/quests"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: C.text, color: C.page }}>
              View Quests <ArrowRight size={14} />
            </Link>
            <button onClick={() => { setSubmitted(false); setTxHash(""); setStep(0); }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: C.card, color: C.textMed, border: `1px solid ${C.border}` }}>
              Create Another
            </button>
          </div>
        </div>
      </ColorCtx.Provider>
    );
  }

  // ── Page ────────────────────────────────────────────────────────────────────
  return (
    <ColorCtx.Provider value={C}>
      <div className="min-h-screen" style={{ background: C.page, fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>

        <AppNav />

        {/* Colour strip */}
        <div className="flex" style={{ height: "3px" }}>
          {[C.beige, C.green, C.amber, C.text].map(c => (
            <div key={c} className="flex-1" style={{ background: c }} />
          ))}
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">

          {/* Page heading */}
          <div className="mb-8">
            <h1 className="font-bold mb-1" style={{ fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.025em", color: C.text }}>
              Create Campaign
            </h1>
            <p className="text-sm" style={{ color: C.textMuted }}>
              Set up your quest, deposit the reward pool, and let participants create content on your behalf.
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex mb-0">
            {STEPS.map((s, i) => {
              const done    = i < step;
              const current = i === step;
              return (
                <button key={i} type="button" onClick={() => done && setStep(i)}
                  className="flex-1 flex flex-col items-center pb-5 gap-1.5 transition-opacity"
                  style={{ cursor: done ? "pointer" : "default", opacity: !done && !current ? 0.35 : 1 }}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all"
                    style={{
                      borderColor: current ? C.amber : done ? C.green : C.border,
                      background:  current ? C.amberBg : done ? C.greenBg : C.card,
                      color:       current ? C.amber : done ? C.greenDark : C.textMuted,
                    }}
                  >
                    {done ? <CheckCircle2 size={16} /> : s.icon}
                  </div>
                  <p className="text-xs font-semibold"
                    style={{ color: current ? C.text : done ? C.greenDark : C.textMuted }}>
                    {s.label}
                  </p>
                  <p className="text-[10px] text-center hidden lg:block" style={{ color: C.textMuted }}>{s.sub}</p>
                </button>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="h-0.5 mb-10 rounded-full" style={{ background: C.border }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${((step + 1) / 4) * 100}%`, background: C.amber }} />
          </div>

          {/* Body grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Form */}
            <div className="lg:col-span-2">
              {step === 0 && <BasicInfo   form={form} set={set} />}
              {step === 1 && <QuestSetup  form={form} set={set} />}
              {step === 2 && <AIKnowledge form={form} set={set} />}
              {step === 3 && <Rewards     form={form} set={set} injBalance={injBalance} />}


              {/* Submit error banner */}
              {submitError && (
                <div className="mt-6 rounded-xl p-4 flex items-start gap-3"
                  style={{ background: C.errorBg, border: `1px solid ${C.errorBorder}` }}>
                  <AlertCircle size={15} className="shrink-0 mt-0.5" style={{ color: C.error }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: C.error }}>{submitError}</p>
                  </div>
                  <button
                    onClick={() => setSubmitError("")}
                    className="shrink-0 text-xs transition-opacity hover:opacity-70"
                    style={{ color: C.error }}
                  >✕</button>
                </div>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between mt-10 pt-6"
                style={{ borderTop: `1px solid ${C.border}` }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(s => Math.max(0, s - 1))}
                    disabled={step === 0}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium transition-opacity disabled:opacity-30 hover:opacity-70"
                    style={{ color: C.textMed, border: `1px solid ${C.border}`, background: C.card }}
                  >
                    <ArrowLeft size={14} /> Previous
                  </button>
                  <button
                    onClick={saveDraft}
                    disabled={!walletKey}
                    title={walletKey ? "Save as draft" : "Connect wallet to save"}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-70 disabled:opacity-30"
                    style={{ color: C.textMuted, border: `1px solid ${C.border}`, background: C.card }}
                  >
                    {draftSaved ? <><Check size={13} style={{ color: C.greenDark }} /> Saved</> : <><Save size={13} /> Save Draft</>}
                  </button>
                </div>

                {step < 3 ? (
                  <button
                    onClick={() => setStep(s => s + 1)}
                    disabled={!canNext()}
                    className="flex items-center gap-1.5 px-7 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: C.text, color: C.page }}
                  >
                    Next <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    onClick={submit}
                    disabled={submitting || !walletConnected || !canNext()}
                    className="flex items-center gap-1.5 px-7 py-2.5 rounded-full text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{ background: C.amber, color: "#FFF8F0" }}
                  >
                    {submitting ? "Creating…" : !walletConnected
                      ? "Connect Wallet First"
                      : <>Create Campaign <ArrowRight size={14} /></>}
                  </button>
                )}
              </div>
            </div>

            {/* Sidebar — Campaign Copilot (steps 0-2) or Summary (step 3) */}
            <div className="space-y-4">
              {step === 3 ? (
                <CampaignSummary form={form} />
              ) : (
                <CopilotPanel onApply={applyCopilot} />
              )}
            </div>
          </div>
        </div>
      </div>
    </ColorCtx.Provider>
  );
}

// Suspense wrapper required because CreateCampaignPage calls useSearchParams()
export default function CreateCampaignPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8] dark:bg-[#0D0A07]">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CreateCampaignPage />
    </Suspense>
  );
}

