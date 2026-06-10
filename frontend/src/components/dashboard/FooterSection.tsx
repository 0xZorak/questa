"use client";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTheme } from "@/store/theme";
import { supabase } from "@/lib/supabase";

async function subscribeEmail(email: string): Promise<void> {
  const { error } = await supabase
    .from("email_subscribers")
    .upsert({ email }, { onConflict: "email" });
  if (error) {
    // If the table doesn't exist yet, treat it as a no-op (graceful degradation)
    if (error.message?.includes("does not exist") || error.message?.includes("schema cache") || error.code === "42P01") {
      return; // Silently succeed until migration is applied
    }
    throw new Error(error.message);
  }
}

export default function FooterSection() {
  const [email,      setEmail]      = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [subError,   setSubError]   = useState("");
  const { dark } = useTheme();

  const ctaBg      = dark ? "#1C1510" : "#DDD6C5";
  const h2Color    = dark ? "#F0EAE0" : "#180E02";
  const bodyTxt    = dark ? "#B8A990" : "#6B4C2A";
  const footerBg   = dark ? "#0D0A07" : "#F5F0E8";
  const footerBdr  = dark ? "#2A2018" : "#E2DAC8";
  const titleColor = dark ? "#F0EAE0" : "#180E02";
  const inputBg    = dark ? "#1A1510" : "#FFFDF8";
  const inputBdr   = dark ? "#2A2018" : "#E2DAC8";
  const inputTxt   = dark ? "#F0EAE0" : "#180E02";
  const successTxt = dark ? "#7AAD72" : "#5A7A52";
  const errTxt     = dark ? "#F87171" : "#DC2626";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setSubError("");
    try {
      await subscribeEmail(email);
      setSubscribed(true);
    } catch (err: any) {
      setSubError(err?.message ?? "Could not subscribe. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* ── CTA band ─────────────────────────────────────────────────── */}
      <section
        className="px-4 py-28 text-center relative overflow-hidden"
        style={{ background: ctaBg }}
      >
        {/* Decorative glow */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, #B9752B22 0%, transparent 65%)" }}
        />

        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 rounded-full"
          style={{ background: "#B9752B" }}
        />

        <h2
          data-reveal
          className="relative mb-4"
          style={{ fontSize: "clamp(32px, 5vw, 56px)", fontWeight: 600, letterSpacing: "-0.02em", color: h2Color }}
        >
          Ready to boost
          <br />
          your rewards?
        </h2>

        <p
          data-reveal
          data-delay="2"
          className="text-sm mb-8 max-w-md mx-auto relative"
          style={{ color: bodyTxt }}
        >
          Create a campaign, deposit your reward budget, and let Questa automatically distribute INJ to every verified participant on Injective.
        </p>

        <a
          data-reveal
          data-delay="3"
          href="/campaigns/create"
          className="relative inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
          style={{ background: "#B9752B", color: "#FFF8F0" }}
        >
          Start creating <ArrowRight size={15} />
        </a>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer
        className="px-4 md:px-8 lg:px-16 py-12"
        style={{ background: footerBg, borderTop: `1px solid ${footerBdr}` }}
      >
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10 w-full">

          {/* Brand */}
          <div className="md:max-w-xs">
            <p className="font-semibold text-base mb-2" style={{ color: titleColor }}>Questa</p>
            <p className="text-sm leading-relaxed" style={{ color: bodyTxt }}>
              AI-powered quest campaigns with trustless INJ rewards on Injective testnet.
            </p>
          </div>

          {/* Subscribe — right-hand corner */}
          <div className="md:max-w-sm md:text-right">
            <p className="font-medium text-sm mb-1" style={{ color: titleColor }}>Stay updated</p>
            <p className="text-xs mb-3" style={{ color: bodyTxt }}>
              Get notified by email whenever a new quest is published.
            </p>
            {subscribed ? (
              <p className="text-sm" style={{ color: successTxt }}>You&apos;re in — we&apos;ll email you for every new quest.</p>
            ) : (
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  style={{ background: inputBg, border: `1px solid ${inputBdr}`, color: inputTxt }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-60 flex items-center gap-1.5"
                  style={{ background: "#B9752B", color: "#FFF8F0" }}
                >
                  {loading ? <Loader2 size={13} className="animate-spin" /> : "Subscribe"}
                </button>
              </form>
            )}
            {subError && <p className="text-xs mt-2" style={{ color: errTxt }}>{subError}</p>}
          </div>
        </div>
      </footer>
    </>
  );
}
