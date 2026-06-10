"use client";
import { useState } from "react";
import { Sparkles, Copy, Check, Loader2, TrendingUp } from "lucide-react";

const PLATFORMS = ["Twitter/X", "Discord", "Telegram", "LinkedIn"];
const TONES = ["Bullish", "Educational", "Community", "FOMO", "Technical"];

export default function ContentGenerator() {
  const [platform, setPlatform] = useState("Twitter/X");
  const [tone, setTone] = useState("Bullish");
  const [topic, setTopic] = useState("");
  const [campaign, setCampaign] = useState("");
  const [generated, setGenerated] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!topic || !campaign) return;
    setLoading(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, tone, topic, campaign }),
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Sparkles className="text-indigo-400" size={20} />
        <h2 className="text-white font-semibold text-lg">AI Content Generator</h2>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Platform</label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          >
            {TONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Campaign Name</label>
        <input
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="e.g. Injective Summer DeFi"
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Topic / Key Message</label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. fastest L1, zero gas fees, new DEX launch"
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-slate-600"
        />
      </div>

      <button
        onClick={generate}
        disabled={loading || !topic || !campaign}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-medium text-sm transition-colors"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
        {loading ? "Generating..." : "Generate Content"}
      </button>

      {generated && (
        <div className="space-y-3">
          <div className="relative bg-slate-800 border border-slate-700 rounded-lg p-4">
            <p className="text-slate-200 text-sm leading-relaxed whitespace-pre-wrap">{generated}</p>
            <button
              onClick={copy}
              className="absolute top-3 right-3 p-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            </button>
          </div>
          {score !== null && (
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp size={14} className="text-green-400" />
              <span className="text-slate-400">Predicted engagement score:</span>
              <span className="text-green-400 font-semibold">{score}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
