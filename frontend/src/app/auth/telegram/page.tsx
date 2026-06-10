"use client";
import { useEffect, useRef } from "react";

export default function TelegramAuthPage({
  searchParams,
}: {
  searchParams: { wallet?: string };
}) {
  const wallet = searchParams.wallet ?? "";
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !botUsername) return;
    ref.current.innerHTML = "";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", `${appUrl}/api/auth/telegram/callback?wallet=${encodeURIComponent(wallet)}`);
    script.setAttribute("data-request-access", "write");
    script.async = true;
    ref.current.appendChild(script);
  }, [wallet, botUsername, appUrl]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: "#0A0A0A" }}
    >
      <p className="text-white text-base font-medium">Connect your Telegram account</p>
      <p className="text-slate-500 text-sm">Approve access in the Telegram popup</p>
      {botUsername ? (
        <div ref={ref} />
      ) : (
        <p className="text-red-400 text-sm">NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not configured.</p>
      )}
    </div>
  );
}
