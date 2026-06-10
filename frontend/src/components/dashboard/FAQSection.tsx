"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTheme } from "@/store/theme";

const FAQS = [
  {
    q: "What is Questa?",
    a: "Questa is a decentralised platform that combines AI-powered content creation with automated, blockchain-verified reward distribution on Injective. Brands launch quests, creators produce authentic social content, and rewards are distributed on-chain — automatically, with zero manual intervention.",
  },
  {
    q: "How do I create a campaign?",
    a: "Connect your wallet, go to Campaigns → Create, and complete the form: set your title, quest type, duration, participant cap, and deposit your reward budget. The Campaign Copilot can fill the entire form from a single sentence description.",
  },
  {
    q: "How are rewards distributed?",
    a: "Automatically — by the AI Verifier Agent. When a campaign ends, it verifies all submissions, approves legitimate ones, rejects spam and sybil wallets, then triggers on-chain distribution. You don't need to do anything.",
  },
  {
    q: "What does the Verifier Agent do?",
    a: "The Verifier Agent reviews every quest submission using DeepSeek AI. It checks if the post meets campaign requirements, scores content quality, detects duplicate content across wallets (sybil detection), and flags spam or off-topic entries — all automatically.",
  },
  {
    q: "What is Campaign Copilot?",
    a: "Campaign Copilot is an AI assistant available to campaign creators. It analyses live participation data, identifies trends, and surfaces actionable recommendations — like adjusting the reward pool or extending the campaign duration. Access it from your campaign admin page.",
  },
  {
    q: "What is Quest Concierge?",
    a: "Quest Concierge is a floating chat assistant on every quest page. Participants can ask it anything about the quest requirements, how to submit, what hashtags to use, or what the rewards are. It understands the full campaign context and answers in real time.",
  },
  {
    q: "What wallet do I need?",
    a: "Questa uses Keplr, the Cosmos-native wallet for Injective. Connect Keplr to create campaigns and participate in quests — it handles signing and on-chain rewards.",
  },
];

export default function FAQSection() {
  const [open, setOpen] = useState<number | null>(0);
  const { dark } = useTheme();

  const bg      = dark ? "#0D0A07" : "#F5F0E8";
  const h2Color = dark ? "#F0EAE0" : "#1A0D00";
  const subTxt  = dark ? "#B8A990" : "#6B4C2A";
  const qColor  = dark ? "#F0EAE0" : "#1A0D00";
  const aColor  = dark ? "#B8A990" : "#6B4C2A";
  const chevron = dark ? "#B8A990" : "#8C6A3A";

  // Liquid glass tokens — same pattern as FeaturesSection
  const glassCard: React.CSSProperties = {
    background: dark
      ? "linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.45) 100%)",
    backdropFilter:       "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: dark
      ? "1px solid rgba(255,255,255,0.09)"
      : "1px solid rgba(255,255,255,0.65)",
    boxShadow: dark
      ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)"
      : "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
    borderRadius: "18px",
    overflow: "hidden",
  };

  const meshBg = dark
    ? "radial-gradient(ellipse 70% 50% at 30% 60%, rgba(185,117,43,0.07) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 75% 30%, rgba(173,198,163,0.05) 0%, transparent 60%)"
    : "radial-gradient(ellipse 70% 50% at 30% 60%, rgba(185,117,43,0.10) 0%, transparent 60%), radial-gradient(ellipse 50% 40% at 75% 30%, rgba(173,198,163,0.12) 0%, transparent 60%)";

  return (
    <section className="px-4 md:px-8 lg:px-16 py-20 relative overflow-hidden" style={{ background: bg }}>
      {/* Mesh blobs for glass backdrop */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: meshBg }} />

      <div data-reveal className="text-center mb-12 relative">
        <h2
          className="mb-3"
          style={{ fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 600, letterSpacing: "-0.02em", color: h2Color }}
        >
          Frequently Asked Questions
        </h2>
        <p className="text-sm max-w-lg mx-auto" style={{ color: subTxt }}>
          Everything you need to know about Questa on Injective testnet.
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-3 relative">
        {FAQS.map((item, i) => (
          <div
            key={i}
            data-reveal
            data-delay={String(Math.min(i + 1, 5))}
            style={glassCard}
          >
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="text-sm font-medium pr-4" style={{ color: qColor }}>{item.q}</span>
              <ChevronDown
                size={16}
                className="shrink-0 transition-transform duration-200"
                style={{ color: chevron, transform: open === i ? "rotate(180deg)" : "rotate(0deg)" }}
              />
            </button>

            <div
              className="overflow-hidden transition-all duration-200"
              style={{ maxHeight: open === i ? "300px" : "0" }}
            >
              <p className="text-sm leading-relaxed px-5 pb-5" style={{ color: aColor }}>{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
