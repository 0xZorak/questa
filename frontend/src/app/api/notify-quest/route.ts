import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
);

export async function POST(req: NextRequest) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    // Email sending not configured — silently succeed so campaign creation isn't blocked
    return NextResponse.json({ ok: true, sent: 0 });
  }

  let title = "New Quest";
  let platform = "Twitter";
  let rewardInj = "0";
  try {
    const body = await req.json();
    title      = body.title     ?? title;
    platform   = body.platform  ?? platform;
    rewardInj  = body.rewardInj ?? rewardInj;
  } catch {}

  // Fetch all subscribers
  const { data: subscribers, error } = await supabase
    .from("email_subscribers")
    .select("email");

  if (error || !subscribers || subscribers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0D0A07;color:#F0EAE0;border-radius:12px">
      <p style="font-size:22px;font-weight:600;margin:0 0 8px;letter-spacing:-0.02em">🎯 New Quest on Questa</p>
      <p style="color:#B8A990;font-size:14px;margin:0 0 24px">A new quest has just been published.</p>
      <div style="background:#1A1510;border:1px solid #2A2018;border-radius:10px;padding:16px;margin-bottom:24px">
        <p style="margin:0 0 4px;font-weight:600;font-size:15px">${title}</p>
        <p style="margin:0;color:#7A6855;font-size:13px">${platform} · ${rewardInj} INJ reward pool</p>
      </div>
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://bounti.xyz"}/quests"
         style="display:inline-block;background:#B9752B;color:#FFF8F0;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:500">
        View Quest →
      </a>
      <p style="margin:24px 0 0;font-size:11px;color:#7A6855">
        You're receiving this because you subscribed on Questa.
      </p>
    </div>
  `;

  let sent = 0;
  await Promise.allSettled(
    subscribers.map(async (row: { email: string }) => {
      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          from:    "Questa <quests@questa.xyz>",
          to:      row.email,
          subject: `New Quest: ${title}`,
          html,
        }),
      });
      if (res.ok) sent++;
    })
  );

  return NextResponse.json({ ok: true, sent });
}
