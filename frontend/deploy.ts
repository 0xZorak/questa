/**
 * Deploy reward_campaign CosmWasm contract to Injective testnet.
 * Usage (from the frontend/ directory):
 *   MNEMONIC="word1 word2 ..." npx tsx deploy.ts
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  MsgStoreCode,
  MsgInstantiateContract,
  PrivateKey,
  TxRestApi,
  ChainRestAuthApi,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
} from "@injectivelabs/sdk-ts";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";

const NETWORK = Network.Testnet;
const ENDPOINTS = getNetworkEndpoints(NETWORK);
const CHAIN_ID = "injective-888";

async function broadcast(
  privateKey: PrivateKey,
  msg: MsgStoreCode | MsgInstantiateContract,
  label: string,
) {
  const injectiveAddress = privateKey.toBech32();
  const publicKey = privateKey.toPublicKey().toBase64();

  const authApi = new ChainRestAuthApi(ENDPOINTS.rest);
  const account = await authApi.fetchAccount(injectiveAddress);
  const { base_account } = account.account;

  const { signBytes, txRaw } = createTransaction({
    message: msg,
    memo: label,
    fee: {
      amount: [{ denom: "inj", amount: "2500000000000000" }],
      gas: "5000000",
    },
    pubKey: publicKey,
    sequence: parseInt(base_account.sequence, 10),
    accountNumber: parseInt(base_account.account_number, 10),
    chainId: CHAIN_ID,
  });

  const sig = await privateKey.sign(Buffer.from(signBytes));
  txRaw.signatures = [sig];

  const txApi = new TxRestApi(ENDPOINTS.rest);
  const res = await txApi.broadcast(getTxRawFromTxRawOrDirectSignResponse(txRaw));

  if (res.code !== 0) {
    throw new Error(`Tx failed (${label}): ${res.rawLog}`);
  }
  return res;
}

/**
 * Extract an event attribute from a broadcast tx response. On success Injective
 * returns an empty `rawLog` and exposes events on `res.events` (Cosmos SDK
 * >=0.50). Attribute keys/values may be plain strings or base64-encoded, so try
 * both. Falls back to parsing `rawLog` for older nodes.
 */
function findEventAttr(res: any, eventType: string, attrKey: string): string | undefined {
  const b64 = (s: string) => {
    try {
      return Buffer.from(s, "base64").toString("utf8");
    } catch {
      return s;
    }
  };

  const strip = (s: string) => (s ?? "").replace(/^"|"$/g, "");
  const events: any[] = res?.events ?? [];
  for (const e of events) {
    if (e.type !== eventType) continue;
    for (const a of e.attributes ?? []) {
      // typed events (SDK >=0.50) expose plain keys with JSON-quoted values
      if (a.key === attrKey) return strip(a.value ?? "");
      // legacy events expose base64-encoded keys/values
      if (b64(a.key) === attrKey) return strip(b64(a.value ?? ""));
    }
  }

  // Fallback: legacy rawLog JSON
  if (res?.rawLog) {
    try {
      const log = JSON.parse(res.rawLog);
      return log[0]?.events
        ?.find((e: any) => e.type === eventType)
        ?.attributes?.find((a: any) => a.key === attrKey)?.value;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error("Set MNEMONIC env var");
    process.exit(1);
  }

  const privateKey = PrivateKey.fromMnemonic(mnemonic);
  const injectiveAddress = privateKey.toBech32();
  console.log("Deploying from:", injectiveAddress);

  // ── Build ────────────────────────────────────────────────────────────────
  const contractDir = path.join(__dirname, "../contracts/reward_campaign");
  const wasmOut = path.join(contractDir, "reward_campaign_optimized.wasm");

  // Prefer the prebuilt, VM-compatible wasm if it's already there — it has the
  // join_and_submit + operator variants and avoids needing the Rust toolchain.
  // Delete reward_campaign_optimized.wasm to force a fresh rebuild from source.
  if (!fs.existsSync(wasmOut)) {
    console.log("No prebuilt wasm found — building contract from source...");
    // Injective testnet's CosmWasm VM rejects bulk-memory / sign-extension ops.
    // Modern Rust (>=1.87) enables these by default in the *precompiled* std, so
    // a plain `cargo build` produces an incompatible wasm even with target-feature
    // flags. Recompile std from source via nightly `-Z build-std` with both
    // bulk-memory and bulk-memory-opt (the memcpy/memset lowering) disabled.
    execSync(
      "cargo +nightly build --release --target wasm32-unknown-unknown " +
        "-Z build-std=std,panic_abort",
      {
        cwd: contractDir,
        stdio: "inherit",
        env: {
          ...process.env,
          RUSTFLAGS:
            "-C target-feature=-bulk-memory,-bulk-memory-opt,-sign-ext " +
            "-C link-arg=--allow-undefined",
        },
      }
    );
    const rawWasm = path.join(
      contractDir,
      "target/wasm32-unknown-unknown/release/reward_campaign.wasm"
    );
    try {
      execSync(
        `wasm-opt -Oz --disable-bulk-memory --disable-sign-ext "${rawWasm}" -o "${wasmOut}"`,
        { stdio: "inherit" }
      );
    } catch {
      console.warn("wasm-opt not found — using unoptimized wasm");
      fs.copyFileSync(rawWasm, wasmOut);
    }
  } else {
    console.log("Using existing prebuilt wasm:", wasmOut);
  }

  const wasmBytes = fs.readFileSync(wasmOut);
  console.log(`Wasm size: ${(wasmBytes.length / 1024).toFixed(1)} KB`);

  // ── Store ────────────────────────────────────────────────────────────────
  console.log("\nStoring contract on-chain...");
  const storeMsg = MsgStoreCode.fromJSON({
    sender: injectiveAddress,
    wasmBytes,
  });

  const storeRes = await broadcast(privateKey, storeMsg, "Questa store");
  const codeId =
    findEventAttr(storeRes, "cosmwasm.wasm.v1.EventCodeStored", "code_id") ??
    findEventAttr(storeRes, "store_code", "code_id");

  if (!codeId) {
    console.error("Could not extract code_id. Events:", JSON.stringify(storeRes.events, null, 2));
    process.exit(1);
  }
  console.log("Code ID:", codeId);

  // ── Instantiate ──────────────────────────────────────────────────────────
  console.log("\nInstantiating contract...");
  const initMsg = MsgInstantiateContract.fromJSON({
    sender: injectiveAddress,
    admin: injectiveAddress,
    codeId: Number(codeId),
    label: "Questa",
    msg: {},
  });

  const initRes = await broadcast(privateKey, initMsg, "Questa instantiate");
  const contractAddress =
    findEventAttr(initRes, "cosmwasm.wasm.v1.EventContractInstantiated", "contract_address") ??
    findEventAttr(initRes, "instantiate", "_contract_address");

  if (!contractAddress) {
    console.error("Could not extract contract address. Events:", JSON.stringify(initRes.events, null, 2));
    process.exit(1);
  }

  console.log("\n==========================================");
  console.log("CONTRACT ADDRESS:", contractAddress);
  console.log("==========================================");

  // Auto-write to .env.local
  const envPath = path.join(__dirname, ".env.local");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    env = env.replace(
      /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, env);
    console.log(".env.local updated automatically.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
