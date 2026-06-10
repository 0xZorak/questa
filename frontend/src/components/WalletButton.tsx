"use client";
import { useState } from "react";
import { X, ChevronDown, AlertCircle } from "lucide-react";
import { useWalletStore } from "@/store/wallet";

// ── Keplr SVG icon ──────────────────────────────────────────────────────────
function KeplrIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill="#2F2E41" />
      <path d="M11 10h5v8.5l8-8.5h6.5L20 21l11 9H24l-8-8V30h-5V10z" fill="white" />
    </svg>
  );
}

function truncate(addr: string) {
  return `${addr.slice(0, 8)}…${addr.slice(-4)}`;
}

// ── Wallet button (Keplr / Cosmos only) ──────────────────────────────────────
export default function WalletButton({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const [error, setError] = useState("");
  const { address, isConnecting, connect, disconnect } = useWalletStore();

  const lightStyle = { bg: "#1A0D00", text: "#F5F0E8", border: "transparent" };
  const darkStyle  = { bg: "#2A1A0A", text: "#F5F0E8", border: "#3D2910" };
  const s = variant === "light" ? lightStyle : darkStyle;

  const handleConnect = async () => {
    setError("");
    try {
      await connect();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to connect Keplr";
      setError(msg);
      setTimeout(() => setError(""), 5000);
    }
  };

  if (address) {
    return (
      <div className="flex items-center gap-2">
        {/* Connected pill */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm"
          style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}`, fontWeight: 500 }}
        >
          <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#4ADE80" }} />
          <span className="font-mono text-xs">{truncate(address)}</span>
          <span className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: "#C4720A22", color: "#C4720A" }}>
            <KeplrIcon size={11} /> Keplr
          </span>
          <ChevronDown size={12} className="opacity-60" />
        </div>

        {/* Disconnect */}
        <button
          onClick={disconnect}
          className="p-2 rounded-full text-xs transition-opacity hover:opacity-70"
          style={{ background: s.bg, color: "#EF4444", border: `1px solid ${s.border}` }}
          title="Disconnect"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full transition-opacity hover:opacity-80 disabled:opacity-60"
        style={{ fontWeight: 500, background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
      >
        <KeplrIcon size={15} />
        {isConnecting ? "Connecting…" : "Connect Wallet"}
      </button>

      {error && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm"
          style={{ background: "#7F1D1D", border: "1px solid #F8717140", color: "#F87171", maxWidth: "360px" }}
        >
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </>
  );
}
