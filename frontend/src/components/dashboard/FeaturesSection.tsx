"use client";
import { useTheme } from "@/store/theme";

const FEATURES = [
  {
    title: "AI Verification",
    body: "Every submission is automatically scored by the Verifier Agent — detecting spam, duplicate content, and sybil wallets before rewards are distributed.",
    detail: [
      { label: "Engine",    value: "DeepSeek AI"  },
      { label: "Detection", value: "Sybil + Spam" },
    ],
  },
  {
    title: "Campaign Copilot",
    body: "Get real-time AI insights on participation trends, fill rate velocity, and actionable recommendations — directly in your campaign dashboard.",
    detail: [
      { label: "Insights",  value: "Live analytics" },
      { label: "Available", value: "Creators only"  },
    ],
  },
  {
    title: "Quest Concierge",
    body: "Participants get a floating AI chat assistant on every quest page — answers questions, explains requirements, and guides them through submission.",
    detail: [
      { label: "Interface", value: "Chat (AI)"  },
      { label: "Context",   value: "Per-quest"  },
    ],
  },
  {
    title: "Onchain Rewards",
    body: "Earn INJ for authentic engagement. All transactions are transparent and verifiable — every payout recorded immutably on the Injective blockchain.",
    detail: [
      { label: "Network",       value: "Injective"  },
      { label: "Distribution",  value: "Automatic"  },
    ],
  },
  {
    title: "AI Tweet Generation",
    body: "Participants generate campaign-aligned tweets using the creator's knowledge base — authentic content that hits required hashtags every time.",
    detail: [
      { label: "Powered by", value: "DeepSeek AI" },
      { label: "Alignment",  value: "Campaign KB" },
    ],
  },
  {
    title: "Fully Decentralized",
    body: "No central authority controls your rewards. CosmWasm smart contracts ensure fair distribution — your earnings governed entirely by code.",
    detail: [
      { label: "Architecture", value: "CosmWasm"      },
      { label: "Distribution", value: "Smart contract" },
    ],
  },
];

export default function FeaturesSection() {
  const { dark } = useTheme();

  const bg      = dark ? "#0D0A07" : "#F5F0E8";
  const h2Color = dark ? "#F0EAE0" : "#1A0D00";
  const bodyTxt = dark ? "#B8A990" : "#6B4C2A";

  // Glass card tokens
  const glassCard: React.CSSProperties = {
    background:             dark
      ? "linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.45) 100%)",
    backdropFilter:         "blur(20px)",
    WebkitBackdropFilter:   "blur(20px)",
    border:                 dark
      ? "1px solid rgba(255,255,255,0.09)"
      : "1px solid rgba(255,255,255,0.65)",
    boxShadow:              dark
      ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)"
      : "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)",
    borderRadius:           "18px",
    padding:                "24px",
  };

  const glassInner: React.CSSProperties = {
    background:           dark
      ? "rgba(0,0,0,0.25)"
      : "rgba(255,255,255,0.4)",
    backdropFilter:       "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    border:               dark
      ? "1px solid rgba(255,255,255,0.06)"
      : "1px solid rgba(0,0,0,0.05)",
    borderRadius:         "12px",
    padding:              "12px",
    marginTop:            "auto",
  };

  // Mesh gradient blob for the section bg
  const meshBg = dark
    ? "radial-gradient(ellipse 80% 50% at 20% 40%, rgba(185,117,43,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 70%, rgba(173,198,163,0.06) 0%, transparent 60%)"
    : "radial-gradient(ellipse 80% 50% at 20% 40%, rgba(185,117,43,0.10) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 70%, rgba(173,198,163,0.12) 0%, transparent 60%)";

  return (
    <section
      className="px-4 md:px-8 lg:px-16 py-20 relative overflow-hidden"
      style={{ background: bg }}
    >
      {/* Background mesh blobs */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: meshBg }} />

      <div data-reveal className="text-center mb-14 relative">
        <h2
          className="mb-3"
          style={{ fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 600, letterSpacing: "-0.02em", color: h2Color }}
        >
          Built for Injective
        </h2>
        <p className="text-base max-w-xl mx-auto" style={{ color: bodyTxt }}>
          Everything you need to run transparent reward campaigns and generate content that actually performs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 relative">
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            data-reveal
            data-delay={String((i % 3) + 1)}
            className="flex flex-col gap-4"
            style={glassCard}
          >
            <div>
              <h3 className="font-semibold text-base mb-2" style={{ color: h2Color }}>{f.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: bodyTxt }}>{f.body}</p>
            </div>
            <div className="space-y-2" style={glassInner}>
              {f.detail.map((d) => (
                <div key={d.label} className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: dark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.4)" }}>{d.label}</span>
                  <span className="text-xs font-medium" style={{ color: "#C4720A" }}>{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
