/**
 * Deploy reward_campaign CosmWasm contract to Injective testnet
 * using the Injective TypeScript SDK (no injectived CLI needed).
 *
 * Usage:
 *   cd contracts
 *   MNEMONIC="your twelve word phrase here" npx tsx deploy.ts
 */
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import {
  MsgStoreCode,
  MsgInstantiateContract,
  PrivateKey,
  TxGrpcApi,
  ChainRestAuthApi,
  createTransaction,
  getTxRawFromTxRawOrDirectSignResponse,
} from "@injectivelabs/sdk-ts";
import { Network, getNetworkEndpoints } from "@injectivelabs/networks";

const NETWORK = Network.Testnet;
const ENDPOINTS = getNetworkEndpoints(NETWORK);
const CHAIN_ID = "injective-888";

// Storing a ~250 KB wasm needs millions of gas — DEFAULT_STD_FEE (400k gas)
// is nowhere near enough and would fail with "out of gas". Use explicit fees.
// Gas price 500_000_000 inj/gas (matches deploy.sh).
const STORE_FEE = {
  amount: [{ denom: "inj", amount: "3000000000000000" }], // 6,000,000 × 500,000,000
  gas: "6000000",
};
const INSTANTIATE_FEE = {
  amount: [{ denom: "inj", amount: "500000000000000" }], // 1,000,000 × 500,000,000
  gas: "1000000",
};

// Robustly pull an attribute out of a tx response, handling both the classic
// rawLog JSON shape and the structured `events` array used by newer Cosmos SDK
// (keys/values may be plain strings or base64-encoded bytes).
function findAttr(resp: any, eventType: string, attrKey: string): string | undefined {
  const decode = (x: unknown): string =>
    typeof x === "string" ? x : x ? Buffer.from(x as Uint8Array).toString("utf8") : "";
  const scan = (events: any[]): string | undefined => {
    for (const e of events ?? []) {
      if (e?.type !== eventType) continue;
      for (const a of e.attributes ?? []) {
        if (decode(a.key) === attrKey) return decode(a.value);
      }
    }
    return undefined;
  };
  // 1. structured events on the response
  const direct = scan(resp?.events);
  if (direct) return direct;
  // 2. classic rawLog string
  try {
    const logs = JSON.parse(resp?.rawLog ?? "[]");
    for (const log of logs) {
      const v = scan(log?.events);
      if (v) return v;
    }
  } catch { /* rawLog not JSON */ }
  return undefined;
}

async function main() {
  const mnemonic = process.env.MNEMONIC;
  if (!mnemonic) {
    console.error("Set MNEMONIC env var to your wallet mnemonic.");
    process.exit(1);
  }

  // ── 1. Derive key + address ──────────────────────────────────────────────
  const privateKey = PrivateKey.fromMnemonic(mnemonic);
  const injectiveAddress = privateKey.toBech32();
  const publicKey = privateKey.toPublicKey().toBase64();
  console.log("Deploying from:", injectiveAddress);

  // ── 2. Build the contract ────────────────────────────────────────────────
  const contractDir = path.join(__dirname, "reward_campaign");
  const wasmOut = path.join(contractDir, "reward_campaign_optimized.wasm");

  if (!fs.existsSync(wasmOut)) {
    console.log("Building contract...");
    execSync("cargo build --release --target wasm32-unknown-unknown", {
      cwd: contractDir,
      stdio: "inherit",
    });

    const rawWasm = path.join(
      contractDir,
      "target/wasm32-unknown-unknown/release/reward_campaign.wasm"
    );

    // Try wasm-opt, fall back to raw binary
    try {
      execSync(`wasm-opt -Oz "${rawWasm}" -o "${wasmOut}"`, { stdio: "inherit" });
    } catch {
      console.warn("wasm-opt not found — using unoptimized binary (still works on testnet)");
      fs.copyFileSync(rawWasm, wasmOut);
    }
  } else {
    console.log("Using existing optimized wasm:", wasmOut);
  }

  const wasmBytes = fs.readFileSync(wasmOut);
  console.log(`Wasm size: ${(wasmBytes.length / 1024).toFixed(1)} KB`);

  // ── 3. Fetch account info ────────────────────────────────────────────────
  const authApi = new ChainRestAuthApi(ENDPOINTS.rest);
  const accountDetails = await authApi.fetchAccount(injectiveAddress);

  // ── 4. Store code ────────────────────────────────────────────────────────
  console.log("\nStoring contract on-chain...");
  const storeMsg = MsgStoreCode.fromJSON({
    sender: injectiveAddress,
    wasmBytes,
  });

  const { signBytes: storeSignBytes, txRaw: storeTxRaw } = createTransaction({
    message: storeMsg,
    memo: "Questa store",
    fee: STORE_FEE,
    pubKey: publicKey,
    sequence: parseInt(accountDetails.account.base_account.sequence, 10),
    accountNumber: parseInt(accountDetails.account.base_account.account_number, 10),
    chainId: CHAIN_ID,
  });

  const storeSignature = await privateKey.sign(Buffer.from(storeSignBytes));
  storeTxRaw.signatures = [storeSignature];

  const txClient = new TxGrpcApi(ENDPOINTS.grpc);
  const storeTxResponse = await txClient.broadcastBlock(
    getTxRawFromTxRawOrDirectSignResponse(storeTxRaw)
  );

  console.log("Store tx hash:", storeTxResponse.txHash);
  if (storeTxResponse.code !== 0) {
    console.error("Store tx failed:", storeTxResponse.rawLog);
    process.exit(1);
  }

  // Extract code_id (handles both rawLog and structured-events response shapes)
  const codeId =
    findAttr(storeTxResponse, "cosmwasm.wasm.v1.EventCodeStored", "code_id") ??
    findAttr(storeTxResponse, "store_code", "code_id");

  if (!codeId) {
    console.error("Could not extract code_id automatically.");
    console.error("Tx hash:", storeTxResponse.txHash, "— look up code_id on the explorer.");
    console.error("Raw log:", storeTxResponse.rawLog);
    process.exit(1);
  }
  console.log("Code ID:", codeId);

  // ── 5. Instantiate contract ───────────────────────────────────────────────
  console.log("\nInstantiating contract...");

  // Re-fetch account to get updated sequence
  const accountDetails2 = await authApi.fetchAccount(injectiveAddress);

  const initMsg = MsgInstantiateContract.fromJSON({
    sender: injectiveAddress,
    admin: injectiveAddress,
    codeId: Number(codeId),
    label: "Questa",
    msg: {},
  });

  const { signBytes: initSignBytes, txRaw: initTxRaw } = createTransaction({
    message: initMsg,
    memo: "Questa instantiate",
    fee: INSTANTIATE_FEE,
    pubKey: publicKey,
    sequence: parseInt(accountDetails2.account.base_account.sequence, 10),
    accountNumber: parseInt(accountDetails2.account.base_account.account_number, 10),
    chainId: CHAIN_ID,
  });

  const initSignature = await privateKey.sign(Buffer.from(initSignBytes));
  initTxRaw.signatures = [initSignature];

  const initTxResponse = await txClient.broadcastBlock(
    getTxRawFromTxRawOrDirectSignResponse(initTxRaw)
  );

  console.log("Instantiate tx hash:", initTxResponse.txHash);
  if (initTxResponse.code !== 0) {
    console.error("Instantiate tx failed:", initTxResponse.rawLog);
    process.exit(1);
  }

  const contractAddress =
    findAttr(initTxResponse, "cosmwasm.wasm.v1.EventContractInstantiated", "contract_address") ??
    findAttr(initTxResponse, "instantiate", "_contract_address");

  if (!contractAddress) {
    console.error("Could not extract contract address automatically.");
    console.error("Tx hash:", initTxResponse.txHash, "— look up the contract address on the explorer.");
    console.error("Raw log:", initTxResponse.rawLog);
    process.exit(1);
  }

  console.log("\n==========================================");
  console.log("CONTRACT ADDRESS:", contractAddress);
  console.log("==========================================");
  console.log("\nAdd to frontend/.env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);

  // Auto-write to .env.local
  const envPath = path.join(__dirname, "../frontend/.env.local");
  if (fs.existsSync(envPath)) {
    let env = fs.readFileSync(envPath, "utf8");
    env = env.replace(
      /^NEXT_PUBLIC_CONTRACT_ADDRESS=.*$/m,
      `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, env);
    console.log("\n.env.local updated automatically.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
