"use client";
/**
 * Toast notification system
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success("Campaign created!");
 *   toast.error("Transaction rejected.");
 *   toast.info("Connecting to wallet…");
 *
 * Wire up: Wrap your app (or Providers) with <ToastProvider>.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, Info, X, AlertTriangle } from "lucide-react";
import { useTheme } from "@/store/theme";
import { toastMessage } from "@/lib/errors";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  /** Auto-dismiss after this many ms. 0 = sticky until closed. Default 4500. */
  duration?: number;
}

interface ToastAPI {
  success: (msg: string, duration?: number) => void;
  error:   (msg: string, duration?: number) => void;
  info:    (msg: string, duration?: number) => void;
  warning: (msg: string, duration?: number) => void;
  dismiss: (id: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ToastCtx = createContext<ToastAPI | null>(null);

export function useToast(): { toast: ToastAPI } {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return { toast: ctx };
}

/**
 * useToastError — convenience hook for catching errors in event handlers.
 *
 * Usage:
 *   const { toastErr } = useToastError();
 *   try { await broadcastWithKeplr(…); }
 *   catch (e) { toastErr(e); }
 */
export function useToastError(): { toastErr: (err: unknown, duration?: number) => void } {
  const { toast } = useToast();
  return {
    toastErr: (err: unknown, duration = 0) => {
      toast.error(toastMessage(err), duration);
    },
  };
}

// ── Variant config ────────────────────────────────────────────────────────────

const VARIANT_CFG: Record<ToastVariant, {
  icon: React.ReactNode;
  bg: string;
  border: string;
  text: string;
  bar: string;
}> = {
  success: {
    icon:   <CheckCircle2 size={15} />,
    bg:     "#0D2818",
    border: "#22C55E40",
    text:   "#4ADE80",
    bar:    "#22C55E",
  },
  error: {
    icon:   <XCircle size={15} />,
    bg:     "#1C0A0A",
    border: "#F8717140",
    text:   "#F87171",
    bar:    "#EF4444",
  },
  warning: {
    icon:   <AlertTriangle size={15} />,
    bg:     "#1C1200",
    border: "#F59E0B40",
    text:   "#FCD34D",
    bar:    "#F59E0B",
  },
  info: {
    icon:   <Info size={15} />,
    bg:     "#0A1020",
    border: "#60A5FA40",
    text:   "#93C5FD",
    bar:    "#3B82F6",
  },
};

// Light-mode overrides for bg/border (text stays the same — saturated enough)
const VARIANT_CFG_LIGHT: Record<ToastVariant, { bg: string; border: string }> = {
  success: { bg: "#F0FFF4", border: "#22C55E50" },
  error:   { bg: "#FFF5F5", border: "#EF444450" },
  warning: { bg: "#FFFBEB", border: "#F59E0B50" },
  info:    { bg: "#EFF6FF", border: "#3B82F650" },
};

// ── Single toast item ─────────────────────────────────────────────────────────

function ToastEntry({
  item,
  onDismiss,
  dark,
}: {
  item: ToastItem;
  onDismiss: () => void;
  dark: boolean;
}) {
  const cfg = VARIANT_CFG[item.variant];
  const lightCfg = VARIANT_CFG_LIGHT[item.variant];
  const dur = item.duration ?? 4500;

  // Progress bar animation
  const [width, setWidth] = useState(100);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (dur === 0) return; // sticky
    const step = 100 / (dur / 50); // decrement per 50 ms
    intervalRef.current = setInterval(() => {
      setWidth(w => {
        if (w <= 0) { clearInterval(intervalRef.current!); onDismiss(); return 0; }
        return w - step;
      });
    }, 50);
    return () => clearInterval(intervalRef.current!);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dur]);

  const bg     = dark ? cfg.bg     : lightCfg.bg;
  const border = dark ? cfg.border : lightCfg.border;
  const textColor = cfg.text;

  return (
    <div
      className="relative rounded-xl shadow-xl overflow-hidden min-w-[260px] max-w-[380px] w-full"
      style={{
        background: bg,
        border: `1px solid ${border}`,
        animation: "toast-in 0.22s ease",
      }}
      role="alert"
      aria-live="polite"
    >
      {/* Content row */}
      <div className="flex items-start gap-3 px-4 py-3.5 pr-10">
        <span className="shrink-0 mt-0.5" style={{ color: textColor }}>
          {cfg.icon}
        </span>
        <p
          className="text-xs leading-relaxed flex-1"
          style={{ color: dark ? "#F0EAE0" : "#180E02", fontWeight: 500 }}
        >
          {item.message}
        </p>
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-md transition-opacity hover:opacity-60"
        style={{ color: textColor }}
        aria-label="Dismiss"
      >
        <X size={12} />
      </button>

      {/* Auto-dismiss progress bar */}
      {dur > 0 && (
        <div className="h-0.5 w-full" style={{ background: border }}>
          <div
            className="h-full transition-none"
            style={{ width: `${width}%`, background: cfg.bar }}
          />
        </div>
      )}
    </div>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { dark } = useTheme();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback((variant: ToastVariant, message: string, duration?: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, variant, message, duration }]);
    return id;
  }, []);

  const api: ToastAPI = {
    success: (msg, dur) => add("success", msg, dur),
    error:   (msg, dur) => add("error",   msg, dur),
    info:    (msg, dur) => add("info",    msg, dur),
    warning: (msg, dur) => add("warning", msg, dur),
    dismiss,
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {mounted && createPortal(
        <>
          {/* Keyframe style */}
          <style>{`
            @keyframes toast-in {
              from { opacity: 0; transform: translateY(12px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0)    scale(1);    }
            }
          `}</style>

          {/* Stack — bottom-right */}
          <div
            className="fixed bottom-5 right-5 z-[9998] flex flex-col gap-2.5 items-end pointer-events-none"
            aria-label="Notifications"
          >
            {toasts.map(t => (
              <div key={t.id} className="pointer-events-auto">
                <ToastEntry
                  item={t}
                  onDismiss={() => dismiss(t.id)}
                  dark={dark}
                />
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
