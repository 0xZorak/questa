"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sun, Moon, Menu, X } from "lucide-react";
import WalletButton from "@/components/WalletButton";
import { useTheme } from "@/store/theme";

const NAV_LINKS = [
  { label: "Profile",   href: "/profile"   },
  { label: "Quests",    href: "/quests"    },
  { label: "Campaigns", href: "/campaigns" },
];

export default function AppNav() {
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Liquid glass tokens
  const navBg    = dark
    ? "rgba(13, 10, 7, 0.68)"
    : "rgba(245, 240, 232, 0.80)";
  const navBdr   = dark
    ? "1px solid rgba(255,255,255,0.07)"
    : "1px solid rgba(0,0,0,0.07)";
  const navShadow = dark
    ? "0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)"
    : "0 4px 20px rgba(0,0,0,0.07), inset 0 -1px 0 rgba(0,0,0,0.04)";
  const brandClr  = dark ? "#F5F0E8" : "#180E02";
  const activeClr = dark ? "#F5F0E8" : "#180E02";
  const mutedClr  = dark ? "#7A6855" : "#8C6A3A";
  const menuBg    = dark ? "rgba(13,10,7,0.96)" : "rgba(245,240,232,0.97)";

  const glassStyle: React.CSSProperties = {
    background:           navBg,
    backdropFilter:       "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderBottom:         navBdr,
    boxShadow:            navShadow,
  };

  return (
    <header className="sticky top-0 z-40" style={glassStyle}>
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-10 py-4">
        <div className="flex items-center gap-7">
          <Link
            href="/"
            className="font-bold text-base hover:opacity-80 transition-opacity"
            style={{ color: brandClr, letterSpacing: "-0.02em" }}
          >
            Questa
          </Link>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-5">
            {NAV_LINKS.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm transition-colors"
                style={{
                  color:      isActive(l.href) ? activeClr : mutedClr,
                  fontWeight: isActive(l.href) ? 600 : 400,
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme toggle — desktop only; on mobile it lives in the collapse menu */}
          <button
            onClick={toggle}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center transition-colors hover:opacity-80 shrink-0"
            style={{ color: "#B9752B", background: "#B9752B18", border: "1px solid #B9752B33" }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <WalletButton variant="dark" />
          {/* Mobile menu toggle */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:opacity-80 shrink-0"
            style={{ color: brandClr, background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: navBdr }}
          >
            {menuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      {/* Mobile collapsible menu */}
      {menuOpen && (
        <nav
          className="md:hidden flex flex-col px-4 pb-3 pt-1"
          style={{ background: menuBg, borderBottom: navBdr }}
        >
          {NAV_LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="py-3 text-sm rounded-lg px-3 transition-colors"
              style={{
                color:      isActive(l.href) ? activeClr : mutedClr,
                fontWeight: isActive(l.href) ? 600 : 400,
                background:  isActive(l.href) ? (dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)") : "transparent",
              }}
            >
              {l.label}
            </Link>
          ))}
          {/* Light/dark toggle inside the mobile menu */}
          <button
            onClick={toggle}
            className="flex items-center gap-2 py-3 px-3 mt-1 text-sm rounded-lg"
            style={{ color: "#B9752B", background: "#B9752B14", fontWeight: 500 }}
          >
            {dark ? <Sun size={15} /> : <Moon size={15} />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
        </nav>
      )}
    </header>
  );
}
