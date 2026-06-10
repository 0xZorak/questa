/**
 * Distribution trigger — POST /api/agent/distribute  { campaign_id }
 *
 * Idempotent, gated entry point used by on-view triggers (quest / campaign
 * pages) and post-submission triggers. Distributes rewards only when the
 * campaign is filled or past its end time. Safe to call repeatedly.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { maybeDistribute } from "@/lib/agent/distribute";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("/api/agent/distribute");
const BodySchema = z.object({ campaign_id: z.number().int().positive() });

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const result = await maybeDistribute(parsed.data.campaign_id);
    return NextResponse.json(result);
  } catch (err) {
    log.error("Distribute failed", err, { campaign_id: parsed.data.campaign_id });
    const detail = err instanceof Error ? err.message : String(err);
    const context = (err as { context?: unknown })?.context;
    return NextResponse.json({ distributed: false, reason: "error", detail, context }, { status: 500 });
  }
}
