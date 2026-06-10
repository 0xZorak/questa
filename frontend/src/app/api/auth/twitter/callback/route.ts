import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  console.log("[twitter-callback] hit — url:", req.nextUrl.toString());
  const fail = (reason: string) => {
    console.log("[twitter-callback] FAIL:", reason);
    return NextResponse.redirect(`${appUrl}/profile?twitter_error=${reason}`);
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) return fail("denied");

  const storedState = req.cookies.get("tw_state")?.value;
  const codeVerifier = req.cookies.get("tw_cv")?.value;
  if (!codeVerifier || storedState !== state) return fail("state_mismatch");

  let wallet = "";
  try {
    wallet = JSON.parse(Buffer.from(state, "base64url").toString()).wallet ?? "";
  } catch {
    return fail("bad_state");
  }

  try {
    const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/auth/twitter/callback`,
        code_verifier: codeVerifier,
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) return fail("no_token");

    const userRes = await fetch("https://api.twitter.com/2/users/me?user.fields=name,username,profile_image_url", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const { data } = await userRes.json();
    const username = data?.username ?? "";
    const name = data?.name ?? "";

    // Persist the twitter handle to Supabase — enforcing one X account per wallet.
    if (wallet && username) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL  ?? "",
          process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        );

        // Reject if this X handle is already linked to a DIFFERENT wallet.
        const { data: existing } = await sb
          .from("profiles")
          .select("wallet_address")
          .eq("twitter", username)
          .neq("wallet_address", wallet)
          .maybeSingle();
        if (existing) {
          return fail("already_linked");
        }

        // Upsert only the twitter field — merge with existing row
        await sb.from("profiles").upsert(
          { wallet_address: wallet, twitter: username, updated_at: new Date().toISOString() },
          { onConflict: "wallet_address", ignoreDuplicates: false },
        );
      } catch { /* non-fatal — profile page will still show the handle via URL param */ }
    }

    const res = NextResponse.redirect(
      `${appUrl}/profile?twitter_connected=${encodeURIComponent(username)}`
    );
    res.cookies.delete("tw_cv");
    res.cookies.delete("tw_state");
    return res;
  } catch {
    return fail("server_error");
  }
}
