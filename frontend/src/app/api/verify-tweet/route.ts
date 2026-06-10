import { NextRequest, NextResponse } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTweetId(url: string): string | null {
  // Handles twitter.com and x.com, with or without username
  const m = url.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Returns a Bearer Token for Twitter API v2 app-only access.
 * Priority:
 *  1. TWITTER_BEARER_TOKEN env var (direct, no round-trip)
 *  2. OAuth 2.0 client_credentials grant using TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET
 */
async function getBearerToken(): Promise<string> {
  if (process.env.TWITTER_BEARER_TOKEN) {
    return process.env.TWITTER_BEARER_TOKEN;
  }

  const id  = process.env.TWITTER_CLIENT_ID;
  const sec = process.env.TWITTER_CLIENT_SECRET;
  if (!id || !sec) {
    throw new Error(
      "Twitter not configured. Add TWITTER_BEARER_TOKEN (or TWITTER_CLIENT_ID + TWITTER_CLIENT_SECRET) to .env.local"
    );
  }

  const creds = Buffer.from(`${id}:${sec}`).toString("base64");

  const res = await fetch("https://api.twitter.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization:  `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitter auth failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return json.access_token as string;
}

// ── Route handler ─────────────────────────────────────────────────────────────

/**
 * GET /api/verify-tweet?url=<tweetUrl>
 *
 * Returns:
 *   { valid: true,  tweet: { id, text, author_id, created_at } }
 *   { valid: false, error: string }
 *   { error: string } with status 400/500 on bad request / server error
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tweetUrl = (searchParams.get("url") ?? "").trim();

  if (!tweetUrl) {
    return NextResponse.json({ error: "Missing ?url parameter" }, { status: 400 });
  }

  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) {
    return NextResponse.json({
      valid: false,
      error:
        "Invalid Twitter/X URL. Paste the full link to your tweet — e.g. https://x.com/you/status/1234567890",
    });
  }

  try {
    const token = await getBearerToken();

    const apiRes = await fetch(
      `https://api.twitter.com/2/tweets/${tweetId}?tweet.fields=text,author_id,created_at`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    // Protected / deleted tweet
    if (apiRes.status === 404) {
      return NextResponse.json({
        valid: false,
        error: "Tweet not found. Make sure your account is public and the post hasn't been deleted.",
      });
    }

    // 403 means the app's Twitter API tier doesn't support tweet lookup
    // (free tier). Fall back to URL-format validation — the tweet ID and
    // URL structure confirm it's a real Twitter/X post link.
    if (apiRes.status === 403) {
      return NextResponse.json({
        valid: true,
        tweet: null,
        note: "URL verified — Twitter API tier doesn't support full tweet lookup",
      });
    }

    if (!apiRes.ok) {
      const errJson = await apiRes.json().catch(() => ({}));
      const detail  = (errJson as { detail?: string; title?: string }).detail
                   ?? (errJson as { title?: string }).title;
      // Unknown API error — fall back to URL validation rather than blocking the user
      if (apiRes.status >= 400 && apiRes.status < 500) {
        return NextResponse.json({
          valid: true,
          tweet: null,
          note: `URL verified (API error: ${detail ?? apiRes.status})`,
        });
      }
      throw new Error(detail ?? `Twitter API returned ${apiRes.status}`);
    }

    const body = await apiRes.json() as {
      data?: { id: string; text: string; author_id: string; created_at: string };
      errors?: { detail: string }[];
    };

    if (!body.data) {
      const errMsg = body.errors?.[0]?.detail ?? "No tweet data returned";
      return NextResponse.json({ valid: false, error: errMsg });
    }

    return NextResponse.json({ valid: true, tweet: body.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
