"use client";
import { useState, useRef, useEffect } from "react";
import {
  X, Bot, Sparkles, Lightbulb, Check, Copy, ArrowRight,
  Zap, Target, Gift, Clock, FileText, TrendingUp,
} from "lucide-react";
import { useTheme } from "@/store/theme";

// ── Palettes ──────────────────────────────────────────────────────────────────
const LIGHT = {
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
};

const DARK: typeof LIGHT = {
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
};

// ── Data ──────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "DeFi & Finance", "NFTs & Digital Art", "Gaming & Metaverse",
  "Community Building", "Education & Learning", "Social Impact",
  "Innovation & Tech", "Trading & Investment", "Governance & DAOs",
  "Infrastructure", "General",
];

const TONES = ["Casual", "Professional", "Friendly", "Bold", "Educational", "Hype", "Technical"];

const LANGUAGES = ["English", "Spanish", "French", "German", "Japanese", "Korean", "Chinese", "Portuguese", "Arabic"];

const TIPS = [
  {
    icon: <Zap size={16} />,
    color: "#B9752B",
    bg: "#B9752B14",
    border: "#B9752B40",
    title: "Hook in the first line",
    body: 'Lead with the reward amount and the exact action. "Earn 0.5 INJ for every verified tweet" beats "Join our community campaign".',
  },
  {
    icon: <Target size={16} />,
    color: "#3B82F6",
    bg: "#3B82F610",
    border: "#3B82F630",
    title: "Be chain-specific",
    body: "Name the protocol, ecosystem, or token. Web3 audiences filter fast — specificity signals legitimacy.",
  },
  {
    icon: <Gift size={16} />,
    color: "#5A7A52",
    bg: "#ADC6A322",
    border: "#ADC6A355",
    title: "Reward generously",
    body: "Campaigns offering ≥ 0.5 INJ per winner see 3× more participation. Generosity signals you're serious.",
  },
  {
    icon: <Clock size={16} />,
    color: "#7C3AED",
    bg: "#7C3AED10",
    border: "#7C3AED30",
    title: "Keep the window tight",
    body: "3–7 day campaigns consistently outperform longer ones. Scarcity and urgency drive quality over quantity.",
  },
  {
    icon: <FileText size={16} />,
    color: "#DC2626",
    bg: "#DC262610",
    border: "#DC262630",
    title: "One clear action",
    body: '"Tweet about X with hashtag Y" outperforms "engage with us across platforms". One task, one focus.',
  },
  {
    icon: <TrendingUp size={16} />,
    color: "#B9752B",
    bg: "#B9752B14",
    border: "#B9752B40",
    title: "Let AI do the variants",
    body: "Generate 3–5 titles with different tones, pick the one that sounds most like your brand, then tweak.",
  },
];

// ── Shared select ─────────────────────────────────────────────────────────────

function StyledSelect({
  label, value, onChange, options, placeholder, C,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  C: typeof LIGHT;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium" style={{ color: C.textLight }}>{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg px-3.5 py-2.5 text-sm focus:outline-none pr-9"
          style={{
            background: C.input,
            border: `1px solid ${C.border}`,
            color: value ? C.text : C.textMuted,
          }}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1l4 4 4-4" stroke={C.textMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// ── Generated result card ─────────────────────────────────────────────────────

function ResultCard({
  label, value, onApply, C,
}: {
  label: string;
  value: string;
  onApply: () => void;
  C: typeof LIGHT;
}) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className="rounded-xl p-4 space-y-2.5"
      style={{ background: C.cardAlt, border: `1px solid ${C.border}` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.amber }}>
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copy}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-all"
            style={{
              background: copied ? C.greenBg : C.sectionHead,
              color: copied ? C.greenDark : C.textMuted,
              border: `1px solid ${copied ? C.greenBorder : C.border}`,
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onApply}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg font-medium transition-all hover:opacity-80"
            style={{ background: C.amber, color: "#FFF8F0" }}
          >
            Use <ArrowRight size={11} />
          </button>
        </div>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: C.text }}>{value}</p>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

type Props = {
  onClose: () => void;
  onApplyTitle: (v: string) => void;
  onApplyDescription: (v: string) => void;
  onApplyBoth: (title: string, desc: string) => void;
  initialTopic?: string;
};

export default function AIAssistantModal({
  onClose, onApplyTitle, onApplyDescription, onApplyBoth, initialTopic = "",
}: Props) {
  const { dark } = useTheme();
  const C = dark ? DARK : LIGHT;

  const [tab,      setTab]      = useState<"generator" | "tips">("generator");
  const [prompt,   setPrompt]   = useState(initialTopic);
  const [category, setCategory] = useState("");
  const [tone,     setTone]     = useState("Professional");
  const [language, setLanguage] = useState("English");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState<{ title: string; description: string } | null>(null);
  const [error,    setError]    = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  const generate = async () => {
    if (!prompt.trim()) { setError("Add a prompt first."); return; }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "campaign", topic: prompt, category, tone, language }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      setError(e.message ?? "Generation failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const applyBoth = () => {
    if (!result) return;
    onApplyBoth(result.title, result.description);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ background: "rgba(24,14,2,0.55)", backdropFilter: "blur(8px)" }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="relative w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: "860px",
          maxHeight: "90vh",
          background: C.card,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: "20px",
          boxShadow: "0 24px 64px rgba(24,14,2,0.18), 0 4px 16px rgba(24,14,2,0.10)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${C.border}`, background: C.sectionHead }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, #7C3AED, #A78BFA)" }}
            >
              <Bot size={17} color="#FFF" />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: C.text }}>AI Campaign Assistant</p>
              <p className="text-xs" style={{ color: C.textLight }}>
                Craft your campaign title and description with AI
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: C.textMuted, background: C.border + "60" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex overflow-hidden" style={{ minHeight: 0, flex: 1 }}>

          {/* Left sidebar */}
          <div
            className="shrink-0 flex flex-col py-5 px-3 gap-1"
            style={{ width: "188px", borderRight: `1px solid ${C.border}`, background: C.cardAlt }}
          >
            {([
              { key: "generator", icon: <Sparkles size={14} />, label: "AI Generator"      },
              { key: "tips",      icon: <Lightbulb size={14} />, label: "Tips for Success"  },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-xs font-medium transition-all"
                style={{
                  background: tab === t.key ? C.amber : "transparent",
                  color:      tab === t.key ? "#FFF8F0" : C.textMuted,
                }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}

            {/* Quick tips */}
            <div className="mt-6 px-1 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.border }}>
                Quick tips
              </p>
              {[
                "Hook with the reward",
                "Name the chain/protocol",
                "One action per campaign",
                "3–7 day windows work best",
              ].map(tip => (
                <p key={tip} className="text-xs leading-snug" style={{ color: C.textMuted }}>
                  · {tip}
                </p>
              ))}
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5" style={{ background: C.card }}>

            {/* ── Generator tab ── */}
            {tab === "generator" && (
              <>
                <div>
                  <h2 className="text-base font-bold mb-0.5" style={{ color: C.text }}>Generate Campaign Content</h2>
                  <p className="text-xs" style={{ color: C.textLight }}>
                    Describe your idea — AI will craft a title and description optimised for Web3 audiences.
                  </p>
                </div>

                {/* Prompt */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium" style={{ color: C.textLight }}>
                    Campaign Prompt <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={e => { setPrompt(e.target.value); setError(""); }}
                    placeholder="Describe your campaign idea, goals, target audience, or any context you want the AI to use…"
                    rows={4}
                    className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none"
                    style={{
                      background: C.input,
                      border: `1px solid ${error ? "#DC2626" : C.border}`,
                      color: C.text,
                    }}
                  />
                  {error && <p className="text-xs" style={{ color: "#DC2626" }}>{error}</p>}
                </div>

                {/* Dropdowns */}
                <div className="grid grid-cols-3 gap-3">
                  <StyledSelect C={C}
                    label="Category"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES}
                    placeholder="Select category"
                  />
                  <StyledSelect C={C} label="Tone"     value={tone}     onChange={setTone}     options={TONES}     />
                  <StyledSelect C={C} label="Language" value={language} onChange={setLanguage} options={LANGUAGES} />
                </div>

                {/* Generate button */}
                <button
                  onClick={generate}
                  disabled={loading || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                  style={{
                    background: loading ? C.sectionHead : C.amber,
                    color: loading ? C.textMuted : "#FFF8F0",
                    border: loading ? `1px solid ${C.border}` : "none",
                  }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke={C.border} strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke={C.amber} strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} />
                      Generate with AI
                    </>
                  )}
                </button>

                {/* Result */}
                {result && (
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{ border: `1px solid ${C.amberBorder}`, animation: "rb-fade-in 0.35s ease both" }}
                  >
                    <div
                      className="flex items-center gap-2 px-4 py-2.5"
                      style={{ background: C.amberBg, borderBottom: `1px solid ${C.amberBorder}` }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.greenDark }} />
                      <span className="text-xs font-medium" style={{ color: C.amber }}>
                        AI generated — review before applying
                      </span>
                    </div>
                    <div className="p-4 space-y-3" style={{ background: C.cardAlt }}>
                      <ResultCard C={C}
                        label="Title"
                        value={result.title}
                        onApply={() => { onApplyTitle(result.title); onClose(); }}
                      />
                      <ResultCard C={C}
                        label="Description"
                        value={result.description}
                        onApply={() => { onApplyDescription(result.description); onClose(); }}
                      />
                      <button
                        onClick={applyBoth}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-80"
                        style={{ background: C.amber, color: "#FFF8F0" }}
                      >
                        <Check size={14} /> Apply both to form
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Tips tab ── */}
            {tab === "tips" && (
              <>
                <div>
                  <h2 className="text-base font-bold mb-0.5" style={{ color: C.text }}>Tips for Campaign Success</h2>
                  <p className="text-xs" style={{ color: C.textLight }}>
                    Patterns from high-performing Web3 reward campaigns on Injective.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {TIPS.map(tip => (
                    <div
                      key={tip.title}
                      className="rounded-xl p-4 space-y-2"
                      style={{ background: C.cardAlt, border: `1px solid ${tip.border}` }}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: tip.bg, color: tip.color }}
                        >
                          {tip.icon}
                        </div>
                        <p className="text-sm font-semibold" style={{ color: C.text }}>{tip.title}</p>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: C.textMed }}>{tip.body}</p>
                    </div>
                  ))}
                </div>

                {/* Pro tip */}
                <div
                  className="rounded-xl px-4 py-3.5 flex items-start gap-3"
                  style={{ background: C.amberBg, border: `1px solid ${C.amberBorder}` }}
                >
                  <Sparkles size={15} className="shrink-0 mt-0.5" style={{ color: C.amber }} />
                  <p className="text-xs leading-relaxed" style={{ color: C.textMed }}>
                    <span className="font-semibold" style={{ color: C.amber }}>Pro tip:</span>{" "}
                    Run the AI Generator with 3 different tones — pick the one that sounds most like your brand,
                    then edit just the reward amount and deadline. That&apos;s it.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
