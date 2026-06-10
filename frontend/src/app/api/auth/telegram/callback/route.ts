import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const fail = () => NextResponse.redirect(`${appUrl}/?social_error=telegram`);

  if (!botToken) return fail();

  const p = req.nextUrl.searchParams;
  const wallet   = p.get("wallet") ?? "";
  const id       = p.get("id");
  const hash     = p.get("hash") ?? "";
  const authDate = p.get("auth_date") ?? "";

  if (!id || !hash) return fail();

  // Build data-check-string: sorted key=value pairs (excluding hash)
  const checkFields = ["auth_date", "first_name", "id", "last_name", "photo_url", "username"];
  const dataCheckString = checkFields
    .map(k => p.get(k) ? `${k}=${p.get(k)}` : null)
    .filter(Boolean)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expected  = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (expected !== hash) return fail();

  // Reject if auth_date is older than 24 h
  if (Date.now() / 1000 - parseInt(authDate, 10) > 86400) return fail();

  const username = p.get("username") ?? p.get("first_name") ?? "";
  const name     = [p.get("first_name"), p.get("last_name")].filter(Boolean).join(" ");

  return NextResponse.redirect(
    `${appUrl}/?connected=telegram&username=${encodeURIComponent(username)}&name=${encodeURIComponent(name)}&wallet=${encodeURIComponent(wallet)}`
  );
}
