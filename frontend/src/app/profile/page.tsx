"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Copy, Check, Wallet, Loader2, LogOut } from "lucide-react";
import { useWalletStore } from "@/store/wallet";
import { useTheme } from "@/store/theme";
import AppNav from "@/components/AppNav";
import { getProfile, upsertProfile } from "@/lib/supabase";
import { queryContract, CONTRACT_ADDRESS } from "@/lib/injective";

// ── Types ─────────────────────────────────────────────────────────────────────
type Profile = {
  display_name: string;
  avatar_url:   string | null;
  twitter:      string;
};

type RewardRow = { campaignId: number; title: string; amountInj: number };

const EMPTY: Profile = { display_name: "", avatar_url: null, twitter: "" };

// Friendly messages for the ?twitter_error=… reasons returned by the OAuth callback.
const TWITTER_ERRORS: Record<string, string> = {
  denied:         "X authorization was cancelled or denied. Please try again and approve access.",
  state_mismatch: "Security check failed (session expired). Start the X connection again.",
  bad_state:      "Invalid linking session. Please retry from this page.",
  no_token:       "X rejected the token exchange — check the app's redirect URL and client type in the X developer portal.",
  server_error:   "Could not reach X. Please try again in a moment.",
  already_linked: "This X account is already linked to a different wallet. Each X account can only connect to one wallet.",
};

// ── X icon ────────────────────────────────────────────────────────────────────
function XIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.741l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ── Address row ───────────────────────────────────────────────────────────────
function AddressRow({
  label, dotColor, value, C,
}: {
  label:    string;
  dotColor: string;
  value:    string | null;
  C: { input: string; inputBdr: string; text: string; textMuted: string; labelClr: string; sectionHd: string; border: string };
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div>
      <p className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: C.labelClr }}>
        <span className="w-2 h-2 rounded-full shrink-0 inline-block" style={{ background: dotColor }} />
        {label}
      </p>
      <div className="flex items-center gap-2">
        <div
          className="flex-1 rounded-lg px-3.5 py-2.5 text-sm font-mono truncate"
          style={{ background: C.input, border: `1px solid ${C.inputBdr}`, color: value ? C.text : C.textMuted }}
        >
          {value ?? "Not connected"}
        </div>
        {value && (
          <button
            onClick={copy}
            className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              background: copied ? "#ADC6A322" : C.sectionHd,
              border:     `1px solid ${C.border}`,
              color:      copied ? "#5A7A52" : C.textMuted,
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Twitter connect ───────────────────────────────────────────────────────────
function TwitterConnect({
  handle, walletKey, dbKey, onDisconnect, dark,
}: {
  handle:       string;
  walletKey:    string | null;
  dbKey:        string | null;
  onDisconnect: () => void;
  dark:         boolean;
}) {
  const connect = () => {
    if (!dbKey) return;
    window.location.href = `/api/auth/twitter?wallet=${encodeURIComponent(dbKey)}`;
  };

  if (handle) {
    return (
      <div
        className="flex items-center justify-between px-4 py-3 rounded-xl"
        style={{
          background: dark ? "#0D0D0D" : "#F5F5F5",
          border:     dark ? "1px solid #222" : "1px solid #E0E0E0",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#000" }}>
            <XIcon size={13} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: dark ? "#F0EAE0" : "#180E02" }}>
              @{handle}
            </p>
            <p className="text-xs" style={{ color: dark ? "#7A6855" : "#8C6A3A" }}>Connected via X</p>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium ml-1"
            style={{ background: "#4ADE8022", color: "#4ADE80", border: "1px solid #4ADE8033" }}
          >
            Connected
          </span>
        </div>
        <button
          onClick={onDisconnect}
          className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
          style={{ color: dark ? "#7A6855" : "#8C6A3A" }}
        >
          <LogOut size={12} />
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={connect}
        disabled={!walletKey}
        className="w-full flex items-center justify-center gap-2.5 py-3 text-sm font-semibold rounded-xl transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "#000", color: "#FFF", border: "1px solid #2A2A2A" }}
      >
        <XIcon size={14} /> Connect X (Twitter)
      </button>
      {!walletKey && (
        <p className="text-xs text-center" style={{ color: "#7A6855" }}>
          Connect a wallet first to link your X account.
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { dark }  = useTheme();
  const router    = useRouter();
  const params    = useSearchParams();

  const { address: keplrAddr } = useWalletStore();

  const walletKey = keplrAddr ?? null;
  const injAddr   = keplrAddr ?? null;
  const dbKey     = injAddr ?? walletKey;

  const [profile,   setProfile]   = useState<Profile>(EMPTY);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [saveError,    setSaveError]    = useState("");
  const [twitterError, setTwitterError] = useState("");
  const [rewards,      setRewards]      = useState<RewardRow[]>([]);

  // ── Load this wallet's distributed rewards from the contract ──────────────
  useEffect(() => {
    if (!injAddr || !CONTRACT_ADDRESS) { setRewards([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await queryContract<{ campaigns: { id: number; title: string; distributed: boolean }[] }>(
          { list_campaigns: { limit: 50 } },
        );
        const out: RewardRow[] = [];
        for (const c of r.campaigns.filter(c => c.distributed)) {
          try {
            const pr = await queryContract<{ participants: { address: string; reward_amount: string }[] }>(
              { get_participants: { campaign_id: c.id } },
            );
            const me = pr.participants.find(p => p.address.toLowerCase() === injAddr.toLowerCase());
            if (me && me.reward_amount && Number(me.reward_amount) > 0) {
              out.push({ campaignId: c.id, title: c.title, amountInj: Number(BigInt(me.reward_amount)) / 1e18 });
            }
          } catch { /* skip campaign on query error */ }
        }
        if (!cancelled) setRewards(out);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [injAddr]);

  // A handle freshly linked via the OAuth redirect (?twitter_connected=…).
  const linkedHandle = params.get("twitter_connected");

  // ── Surface OAuth errors (previously failed silently) ─────────────────────
  useEffect(() => {
    const err = params.get("twitter_error");
    if (!err) return;
    setTwitterError(TWITTER_ERRORS[err] ?? `X linking failed (${err}). Please try again.`);
    router.replace("/profile", { scroll: false });
  }, [params, router]);

  // ── Load profile (prefer a freshly-linked handle, and persist it) ─────────
  useEffect(() => {
    if (!dbKey) { setProfile(EMPTY); return; }
    setLoading(true);
    getProfile(dbKey)
      .then(row => {
        // The handle from the OAuth redirect wins over the stored value — the
        // server-side upsert can race or be blocked, so it may not be in the DB yet.
        const twitter = linkedHandle || row?.twitter || "";
        setProfile({
          display_name: row?.display_name ?? "",
          avatar_url:   row?.avatar_url   ?? null,
          twitter,
        });
        // If we just linked and the DB doesn't reflect it, persist from the client.
        if (linkedHandle && row?.twitter !== linkedHandle) {
          upsertProfile({
            wallet_address: dbKey,
            display_name:   row?.display_name ?? null,
            avatar_url:     row?.avatar_url   ?? null,
            twitter:        linkedHandle,
            discord:        null,
            telegram:       null,
          }).catch(() => { /* non-fatal — shown via URL param regardless */ });
        }
      })
      .finally(() => {
        setLoading(false);
        if (linkedHandle) router.replace("/profile", { scroll: false });
      });
  }, [dbKey, linkedHandle, router]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const save = async () => {
    if (!dbKey) return;
    setSaving(true);
    setSaveError("");
    try {
      await upsertProfile({
        wallet_address: dbKey,
        display_name:   profile.display_name || null,
        avatar_url:     profile.avatar_url   ?? null,
        twitter:        profile.twitter      || null,
        discord:        null,
        telegram:       null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Palette ───────────────────────────────────────────────────────────────
  const bg        = dark ? "#0D0A07" : "#F5F0E8";
  const border    = dark ? "#2A2018" : "#E2DAC8";
  const text      = dark ? "#F0EAE0" : "#180E02";
  const textMuted = dark ? "#7A6855" : "#8C6A3A";
  const input     = dark ? "#100D0A" : "#FAF7F2";
  const inputBdr  = dark ? "#2A2018" : "#DDD6C5";
  const labelClr  = dark ? "#B8A990" : "#6B4C2A";
  const sectionHd = dark ? "#1C1510" : "#EDE8DF";

  const C         = { input, inputBdr, text, textMuted, labelClr, sectionHd, border };

  const glassCard: React.CSSProperties = {
    background: dark
      ? "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)"
      : "linear-gradient(135deg, rgba(255,255,255,0.80) 0%, rgba(255,255,255,0.50) 100%)",
    backdropFilter:       "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: dark
      ? "1px solid rgba(255,255,255,0.07)"
      : "1px solid rgba(255,255,255,0.70)",
    boxShadow: dark
      ? "0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)"
      : "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)",
    borderRadius:  "16px",
    overflow:      "hidden" as const,
  };

  const hdStyle = {
    background:   dark ? "rgba(0,0,0,0.25)"     : "rgba(255,255,255,0.35)",
    borderBottom: dark ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.05)",
  };

  return (
    <div style={{ background: bg, minHeight: "100vh" }}>
      <AppNav />

      <div className="max-w-2xl mx-auto px-4 py-10">

        <h1
          className="mb-1"
          style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 600, color: text, letterSpacing: "-0.02em" }}
        >
          Profile
        </h1>
        <p className="text-sm mb-8" style={{ color: textMuted }}>
          {walletKey
            ? "Your on-chain identity on Questa."
            : "Connect a wallet from the nav bar to view your profile."}
        </p>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={22} className="animate-spin" style={{ color: "#B9752B" }} />
          </div>
        )}

        {!loading && (
          <>
            {/* ── Wallets card ── */}
            <div className="mb-4" style={glassCard}>
              <div className="px-6 py-4 flex items-center gap-2" style={hdStyle}>
                <Wallet size={13} style={{ color: textMuted }} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>
                  Connected Wallets
                </p>
              </div>
              <div className="px-6 py-5 space-y-4">
                <AddressRow label="Injective Address (Keplr)" dotColor="#0082FA" value={injAddr} C={C} />
                {!keplrAddr && (
                  <p className="text-xs text-center py-1" style={{ color: textMuted }}>
                    Connect your Keplr wallet from the nav bar to see your address.
                  </p>
                )}
              </div>
            </div>

            {/* ── Social link card ── */}
            <div className="mb-6" style={glassCard}>
              <div className="px-6 py-4" style={hdStyle}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Social Link</p>
              </div>
              <div className="px-6 py-5">
                <p className="text-xs mb-3" style={{ color: textMuted }}>
                  Connect your X account to verify social quests and display your handle.
                </p>
                {twitterError && (
                  <div className="mb-3 rounded-lg px-3 py-2.5 text-xs flex items-start gap-2"
                    style={{ background: "#7F1D1D22", border: "1px solid #F8717140", color: "#F87171" }}>
                    <span className="flex-1">{twitterError}</span>
                    <button onClick={() => setTwitterError("")} className="shrink-0 opacity-70 hover:opacity-100">✕</button>
                  </div>
                )}
                <TwitterConnect
                  handle={profile.twitter}
                  walletKey={walletKey}
                  dbKey={dbKey}
                  onDisconnect={() => setProfile(p => ({ ...p, twitter: "" }))}
                  dark={dark}
                />
              </div>
            </div>

            {/* ── Rewards card ── */}
            {rewards.length > 0 && (
              <div className="mb-6" style={glassCard}>
                <div className="px-6 py-4 flex items-center justify-between" style={hdStyle}>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: textMuted }}>Rewards</p>
                  <span className="text-xs font-bold" style={{ color: "#4ADE80" }}>
                    {rewards.reduce((s, r) => s + r.amountInj, 0).toFixed(4)} INJ earned
                  </span>
                </div>
                <div className="px-6 py-4 space-y-2">
                  {rewards.map(r => (
                    <a
                      key={r.campaignId}
                      href={`/quests/${r.campaignId}`}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-opacity hover:opacity-80"
                      style={{ background: dark ? "#0D0D0D" : "#F5F0EB", border: `1px solid ${C.border}` }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: C.text }}>{r.title}</p>
                        <p className="text-[10px]" style={{ color: textMuted }}>Quest #{r.campaignId} · Paid</p>
                      </div>
                      <span className="text-xs font-bold shrink-0 ml-3" style={{ color: "#4ADE80" }}>
                        +{r.amountInj.toFixed(4)} INJ
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {saveError && (
              <p className="text-xs text-red-400 mb-3 text-center">{saveError}</p>
            )}

            <button
              onClick={save}
              disabled={!walletKey || saving}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{ background: "#B9752B", color: "#FFF8F0" }}
            >
              {saving ? (
                <><Loader2 size={15} className="animate-spin" /> Saving…</>
              ) : saved ? (
                <><Check size={15} /> Saved!</>
              ) : (
                "Save Profile"
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
