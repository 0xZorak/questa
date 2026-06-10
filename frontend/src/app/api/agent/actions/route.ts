/**
 * GET /api/agent/actions?campaign_id=N&agent=verifier&limit=50
 *
 * Returns the live feed of agent_actions for the /agents transparency page.
 */
import { NextRequest, NextResponse } from "next/server";
import { listAgentActions } from "@/lib/idempotency";
import { createRouteLogger } from "@/lib/logger";

const log = createRouteLogger("/api/agent/actions");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaign_id") ? Number(searchParams.get("campaign_id")) : undefined;
  const agent      = searchParams.get("agent")       ?? undefined;
  const limit      = searchParams.get("limit")       ? Number(searchParams.get("limit")) : 50;

  try {
    const actions = await listAgentActions({ campaignId, agent, limit });
    return NextResponse.json({ actions });
  } catch (err) {
    log.error("Failed to list agent actions", err);
    return NextResponse.json({ actions: [] });
  }
}
