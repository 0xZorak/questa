import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  const clientId = process.env.DISCORD_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!clientId) {
    return NextResponse.json({ error: "DISCORD_CLIENT_ID not set" }, { status: 500 });
  }

  const state = Buffer.from(JSON.stringify({ wallet, nonce: crypto.randomBytes(8).toString("hex") })).toString("base64url");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${appUrl}/api/auth/discord/callback`,
    response_type: "code",
    scope: "identify",
    state,
  });

  const res = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  res.cookies.set("dc_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
