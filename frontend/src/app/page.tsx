"use client";
import { useState, useEffect } from "react";
import { ArrowRight, Sun, Moon, Menu, X } from "lucide-react";
import Link from "next/link";
import WalletButton from "@/components/WalletButton";
import DashboardCard from "@/components/dashboard/DashboardCard";
import FeaturesSection from "@/components/dashboard/FeaturesSection";
import FAQSection from "@/components/dashboard/FAQSection";
import FooterSection from "@/components/dashboard/FooterSection";
import HeroStats from "@/components/HeroStats";
import { useTheme } from "@/store/theme";

const NAV_LINKS = [
  { label: "Features",     href: "#features"         },
  { label: "For Brands",   href: "/campaigns/create" },
  { label: "For Creators", href: "/quests"           },
  { label: "FAQ",          href: "#faq"              },
];

export default function Home() {
  const { dark, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  // Palette tokens — light vs dark warm
  const bg          = dark ? "#0D0A07"  : "#F5F0E8";
  const headColor   = dark ? "#F0EAE0"  : "#180E02";
  const bodyColor   = dark ? "#B8A990"  : "#4A3520";
  const subColor    = dark ? "#7A6855"  : "#6B4C2A";
  const h2Color     = dark ? "#F0EAE0"  : "#180E02";
  const tagBg       = dark ? "#1C1510"  : "#DDD6C5";
  const tagColor    = dark ? "#B8A990"  : "#8C6A3A";
  const tagBorder   = dark ? "#B8A990"  : "#8C6A3A";

  return (
    <div style={{ fontFamily: "var(--font-outfit), 'Helvetica Neue', system-ui, sans-serif" }}>

      {/* ══════════════════════════════════════════════════════════════════
          FIXED NAV — persists through scroll
      ══════════════════════════════════════════════════════════════════ */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 rb-anim-fade-in"
        style={{
          background:         scrolled || menuOpen ? "rgba(13,10,7,0.92)" : "transparent",
          backdropFilter:     scrolled || menuOpen ? "blur(14px)" : "none",
          WebkitBackdropFilter: scrolled || menuOpen ? "blur(14px)" : "none",
          borderBottom:       scrolled || menuOpen ? "1px solid rgba(255,255,255,0.06)" : "none",
          transition:         "background 0.35s ease, backdrop-filter 0.35s ease, border-bottom 0.35s ease",
        }}
      >
        <div className="flex items-center justify-between px-5 sm:px-10 py-4 sm:py-5">
          <span
            className="text-xl text-white rb-delay-1"
            style={{ fontWeight: 500, letterSpacing: "-0.02em" }}
          >
            Questa
          </span>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-5 rb-delay-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-white hover:text-amber-200 transition-colors"
                style={{ fontWeight: 500, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={toggle}
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
              style={{ color: "#B9752B", background: "#B9752B20", border: "1px solid #B9752B50" }}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <WalletButton variant="dark" />
          </div>

          {/* Mobile cluster: wallet + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <WalletButton variant="dark" />
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ color: "#FFF", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {menuOpen && (
          <div className="md:hidden flex flex-col px-5 pb-4 gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="text-sm text-white py-3 px-3 rounded-lg transition-colors"
                style={{ fontWeight: 500, background: "rgba(255,255,255,0.04)" }}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={() => { toggle(); }}
              className="flex items-center gap-2 text-sm text-white py-3 px-3 rounded-lg mt-1"
              style={{ fontWeight: 500, background: "rgba(185,117,43,0.15)" }}
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
              {dark ? "Light mode" : "Dark mode"}
            </button>
          </div>
        )}
      </nav>

      {/* ══════════════════════════════════════════════════════════════════
          HERO — full-width background image
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="relative w-full h-[58vh] min-h-[340px] md:h-[78vh] md:min-h-[520px]"
        style={{
          backgroundImage: "url('/cat-hero.png')",
          backgroundSize: "cover",
          backgroundPosition: "center 50%",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.20) 55%, transparent 100%)",
          }}
        />

        {/* Tagline badge with animated Injective */}
        <div
          className="absolute bottom-0 left-0 flex items-center gap-2.5 px-6 py-3 rb-anim-slide-left rb-delay-4"
          style={{
            background: tagBg,
            clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 100%, 0 100%)",
            paddingRight: "48px",
          }}
        >
          <div className="w-3 h-3 rounded-full shrink-0" style={{ border: `1.5px solid ${tagBorder}` }} />
          <span className="text-sm" style={{ fontWeight: 400, color: tagColor, letterSpacing: "0.04em" }}>
            Trustless rewards. Powered by{" "}
            <span className="questa-injective-aura">Injective</span>.
          </span>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT SECTION
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col md:flex-row" style={{ background: bg, minHeight: "400px" }}>

        {/* Left — big headline */}
        <div
          data-reveal
          className="flex items-center px-6 py-10 md:px-10 md:py-14 w-full md:w-[55%] md:border-r"
          style={{ borderColor: dark ? "#2A2018" : "#E2DAC8" }}
        >
          <h1
            style={{
              fontSize: "clamp(32px, 8vw, 78px)",
              fontWeight: 500,
              color: headColor,
              letterSpacing: "-0.03em",
              lineHeight: 1.06,
            }}
          >
            Create a quest.
            <br />
            Deposit your budget.
            <br />
            We handle the{" "}
            <span style={{ color: "#B9752B" }}>rest.</span>
          </h1>
        </div>

        {/* Right — description + stats + CTA */}
        <div
          data-reveal
          data-delay="2"
          className="flex flex-col justify-between gap-6 px-6 py-10 md:px-10 md:py-14 w-full md:w-[45%]"
        >
          <p className="text-base leading-relaxed max-w-sm" style={{ color: bodyColor, fontWeight: 400 }}>
            Brands create a quest, deposit their reward budget,
            and Questa automatically distributes INJ to every verified participant.
          </p>

          {/* Stats are supplementary — hide on the smallest screens to declutter */}
          <div className="hidden sm:block">
            <HeroStats dark={dark} />
          </div>

          <Link
            href="/quests"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm w-fit transition-opacity hover:opacity-80"
            style={{ fontWeight: 500, background: "#B9752B", color: "#FFF8F0" }}
          >
            Get started <ArrowRight size={15} strokeWidth={2} />
          </Link>
        </div>
      </div>

      {/* Colour strip */}
      <div className="flex" style={{ height: "10px" }}>
        <div className="flex-1" style={{ background: "#DDD6C5" }} />
        <div className="flex-1" style={{ background: "#ADC6A3" }} />
        <div className="flex-1" style={{ background: "#B9752B" }} />
        <div className="flex-1" style={{ background: "#180E02" }} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DASHBOARD + FEATURES + FAQ
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ background: bg }}>

        <div data-reveal className="text-center px-4 pt-16 pb-2">
          <h2
            className="mb-3"
            style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 600, letterSpacing: "-0.02em", color: h2Color }}
          >
            Boost Your Brand with AI-Powered Quests
          </h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: subColor }}>
            Set up a campaign in minutes. Participants create authentic content — AI-generated,
            multilingual, engagement-optimised. Rewards distribute automatically on Injective.
          </p>
        </div>

        {/* The dashboard mockup is a desktop-oriented showcase (6 panels) that
            becomes an endless stack on phones — hide it on mobile to declutter. */}
        <div id="dashboard" className="hidden md:block"><DashboardCard landing /></div>
        <div id="features"><FeaturesSection /></div>
        <div id="faq"><FAQSection /></div>
        <FooterSection />
      </div>
    </div>
  );
}
