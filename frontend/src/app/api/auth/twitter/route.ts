import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  const clientId = process.env.TWITTER_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json({ error: "TWITTER_CLIENT_ID not set" }, { status: 500 });
  }

  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const state = Buffer.from(JSON.stringify({ wallet, nonce: crypto.randomBytes(8).toString("hex") })).toString("base64url");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/twitter/callback`,
    scope: "tweet.read users.read",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  // Use x.com (not twitter.com) — the legacy twitter.com authorize endpoint
  // loops the login screen when the user's session lives on x.com.
  const authUrl = `https://x.com/i/oauth2/authorize?${params}`;
  console.log("[twitter-oauth] client_id:", clientId.slice(0, 8) + "...");
  console.log("[twitter-oauth] redirect_uri:", `${appUrl}/api/auth/twitter/callback`);
  console.log("[twitter-oauth] full auth url:", authUrl);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set("tw_cv", codeVerifier, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  res.cookies.set("tw_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
