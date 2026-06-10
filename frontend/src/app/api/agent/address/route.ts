/**
 * GET /api/agent/address — returns the agent (operator) wallet address.
 *
 * The campaign-create flow sets this as the on-chain `operator` so the agent
 * can autonomously distribute rewards. Returns { address: null } when
 * AGENT_MNEMONIC isn't configured (campaigns then have no auto-distribute).
 */
import { NextResponse } from "next/server";
import { getAgentAddress } from "@/lib/agent/wallet";

export async function GET() {
  try {
    return NextResponse.json({ address: getAgentAddress() });
  } catch {
    return NextResponse.json({ address: null });
  }
}
