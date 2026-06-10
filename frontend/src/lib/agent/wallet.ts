/**
 * Server-side agent wallet — signs and broadcasts CosmWasm execute messages
 * using the AGENT_MNEMONIC environment variable.
 *
 * SECURITY: AGENT_MNEMONIC must NEVER be referenced client-side.
 * This file must only be imported in server-side code (API routes / server actions).
 *
 * The agent wallet is an operator address registered on campaigns that allow
 * autonomous reward distribution.
 */
import {
  MsgExecuteContractCompat,
  TxRestApi,
  ChainRestAuthApi,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
  PrivateKey,
} from "@injectivelabs/sdk-ts";
import { getNetworkEndpoints, Network } from "@injectivelabs/networks";
import { AppError, parseChainError } from "../errors";
import { createRouteLogger } from "../logger";
import crypto from "crypto";

const log = createRouteLogger("agent/wallet");

const NETWORK   = Network.Testnet;
const ENDPOINTS = getNetworkEndpoints(NETWORK);
const CHAIN_ID  = "injective-888";

export const AGENT_FEE = {
  amount: "3000000000000000",
  gas:    "600000",
};

let _cachedPrivKey: PrivateKey | null = null;

function getAgentPrivateKey(): PrivateKey {
  if (_cachedPrivKey) return _cachedPrivKey;

  const mnemonic = process.env.AGENT_MNEMONIC;
  if (!mnemonic) {
    throw new AppError({
      code: "AGENT_WALLET_MISSING",
      userMessage: "Agent wallet not configured.",
      retryable: false,
    });
  }

  _cachedPrivKey = PrivateKey.fromMnemonic(mnemonic);
  return _cachedPrivKey;
}

/** Returns the inj1… address of the agent wallet */
export function getAgentAddress(): string {
  return getAgentPrivateKey().toBech32();
}

/**
 * Sign and broadcast a CosmWasm execute message from the agent wallet.
 * Includes SHA-256 hash of reasoning in the memo for on-chain transparency.
 *
 * @param msg       Pre-built MsgExecuteContractCompat
 * @param reasoning The agent's reasoning text (hashed into memo)
 * @returns         On-chain tx hash
 */
export async function agentBroadcast(
  msg: MsgExecuteContractCompat,
  reasoning: string,
): Promise<string> {
  const privKey      = getAgentPrivateKey();
  const injAddress   = privKey.toBech32();
  const pubKeyBase64 = Buffer.from(privKey.toPublicKey().toPubKeyBytes()).toString("base64");

  // SHA-256 of the reasoning — included in memo for transparency
  const reasoningHash = crypto
    .createHash("sha256")
    .update(reasoning)
    .digest("hex")
    .slice(0, 16); // first 16 hex chars to keep memo short

  const memo = `questa-agent:${reasoningHash}`;

  try {
    // Fetch account state
    const authApi    = new ChainRestAuthApi(ENDPOINTS.rest);
    const accountRes = await authApi.fetchAccount(injAddress);
    const baseAcct   = accountRes.account.base_account;
    const sequence      = parseInt(baseAcct.sequence,      10);
    const accountNumber = parseInt(baseAcct.account_number, 10);

    // Build tx — createTransaction returns the full SignDoc bytes to sign over
    // (signing only bodyBytes produces an invalid signature).
    const { signBytes, txRaw } = createTransaction({
      message: msg,
      memo,
      fee: {
        amount: [{ denom: "inj", amount: AGENT_FEE.amount }],
        gas:    AGENT_FEE.gas,
      },
      pubKey:        pubKeyBase64,
      sequence,
      accountNumber,
      chainId:       CHAIN_ID,
    });

    // Sign with agent private key over the full sign bytes
    const sig = await privKey.sign(Buffer.from(signBytes));
    txRaw.signatures = [sig];

    // Broadcast over REST (sync mode). This is the path proven to work from the
    // server (the deploy script + curl both use REST; there's no browser CORS
    // here). gRPC-web's broadcastBlock is rejected by the node ("unsupported
    // return type") since block mode was removed in newer Cosmos SDK.
    const txApi = new TxRestApi(ENDPOINTS.rest);
    const res   = await txApi.broadcast(getTxRawFromTxRawOrDirectSignResponse(txRaw));

    if (res.code !== 0) {
      throw new AppError({
        code: "AGENT_TX_FAILED",
        userMessage: "Agent transaction failed on-chain.",
        retryable: false,
        context: { code: res.code, rawLog: res.rawLog, txHash: res.txHash },
      });
    }

    log.info("Agent broadcast success", { txHash: res.txHash, memo });
    return res.txHash;
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Surface the FULL chain detail (sdk-ts stashes the rawLog in originalMessage)
    // instead of a generic BROADCAST_FAILED, so the real ContractError is visible.
    const e = err as { message?: string; originalMessage?: string; context?: unknown };
    const detail = [e?.message, e?.originalMessage].filter(Boolean).join(" | ") || String(err);
    log.error("Agent broadcast threw", err, { agentAddress: injAddress, detail, context: e?.context });
    throw parseChainError(err, { agentAddress: injAddress, detail });
  }
}

/** SHA-256 hex of a string (for on-chain memo) */
export function hashReasoning(reasoning: string): string {
  return crypto.createHash("sha256").update(reasoning).digest("hex");
}
