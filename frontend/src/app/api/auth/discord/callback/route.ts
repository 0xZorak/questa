import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const fail = (reason: string) => NextResponse.redirect(`${appUrl}/?social_error=discord&reason=${reason}`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) return fail("denied");

  const storedState = req.cookies.get("dc_state")?.value;
  if (storedState !== state) return fail("state_mismatch");

  let wallet = "";
  try {
    wallet = JSON.parse(Buffer.from(state, "base64url").toString()).wallet ?? "";
  } catch {
    return fail("bad_state");
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/auth/discord/callback`,
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) return fail("no_token");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();
    const username = user.username ?? "";
    const name = user.global_name ?? user.username ?? "";

    const res = NextResponse.redirect(
      `${appUrl}/?connected=discord&username=${encodeURIComponent(username)}&name=${encodeURIComponent(name)}&wallet=${encodeURIComponent(wallet)}`
    );
    res.cookies.delete("dc_state");
    return res;
  } catch {
    return fail("server_error");
  }
}
