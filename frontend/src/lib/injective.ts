import {
  Network,
  getNetworkEndpoints,
} from "@injectivelabs/networks";
import { parseChainError } from "./errors";
import {
  ChainGrpcWasmApi,
  ChainRestAuthApi,
  MsgExecuteContractCompat,
  TxGrpcApi,
  createTransactionAndCosmosSignDoc,
  getTxRawFromTxRawOrDirectSignResponse,
  getInjectiveAddress,
  getEthereumAddress,
  getEip712TypedData,
  createTxRawEIP712,
  createWeb3Extension,
  fromBase64,
  toBase64,
} from "@injectivelabs/sdk-ts";

export const NETWORK   = Network.Testnet;
export const ENDPOINTS = getNetworkEndpoints(NETWORK);
export const CHAIN_ID  = "injective-888";
export const CONTRACT_ADDRESS   = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";
export const PLATFORM_FEE_RATE  = 0.05; // 5 %

// ── Fee presets ───────────────────────────────────────────────────────────────
export type FeeConfig = {
  amount: string; // inj (1e-18 denomination)
  gas:    string;
};

/** Minimum fee — for simple CosmWasm state writes (join, submit content).
 *  250 000 gas × 160 000 000 inj/gas = 40 000 000 000 000 inj ≈ 0.00004 INJ
 */
export const MINIMAL_FEE: FeeConfig = {
  amount: "40000000000000",
  gas:    "250000",
};

/** Submission fee — join_and_submit does ~4 storage writes + a stats update,
 *  so it needs more headroom than a single-write call. 500 000 gas keeps it
 *  comfortably above the out-of-gas threshold. 500 000 × 160 000 000 inj/gas. */
export const SUBMIT_FEE: FeeConfig = {
  amount: "80000000000000",
  gas:    "500000",
};

/** Standard fee — for transactions that include fund transfers (create campaign). */
export const STANDARD_FEE: FeeConfig = {
  amount: "3000000000000000",
  gas:    "600000",
};

/**
 * Dynamic fee for DistributeRewards — each BankMsg::Send costs ~60 000 gas.
 * Formula: max(500_000, 300_000 + count × 60_000) gas @ 160 000 000 inj/gas.
 */
export function getDistributeFee(participantCount: number): FeeConfig {
  const gas    = Math.max(500_000, 300_000 + participantCount * 60_000);
  const amount = (BigInt(gas) * BigInt(160_000_000)).toString();
  return { gas: gas.toString(), amount };
}

// Injective testnet USDT/USDC via Peggy bridge (6 decimals)
export const USDC_DENOM = "peggy0x87aB3B4C8661e07D6372361211B96ed4Dc36B1B5";

export function usdcToMicro(usdc: number): string {
  return Math.round(usdc * 1_000_000).toString();
}

export const wasmApi = new ChainGrpcWasmApi(ENDPOINTS.grpc);

export async function fetchInjBalance(address: string): Promise<number> {
  const authApi = new ChainRestAuthApi(ENDPOINTS.rest);
  try {
    const res = await fetch(`${ENDPOINTS.rest}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=inj`);
    const data = await res.json();
    const amount = data?.balance?.amount ?? "0";
    return Number(BigInt(amount)) / 1e18;
  } catch {
    return 0;
  }
}

// ── Query ─────────────────────────────────────────────────────────────────────
export async function queryContract<T>(queryMsg: object): Promise<T> {
  const response = await wasmApi.fetchSmartContractState(
    CONTRACT_ADDRESS,
    toBase64(queryMsg)
  );
  return fromBase64(Buffer.from(response.data).toString("base64")) as T;
}

/** Query any CosmWasm contract (not just the campaign contract). */
export async function queryAnyContract<T>(
  contractAddress: string,
  queryMsg: object,
): Promise<T> {
  const response = await wasmApi.fetchSmartContractState(
    contractAddress,
    toBase64(queryMsg),
  );
  return fromBase64(Buffer.from(response.data).toString("base64")) as T;
}

/** Returns true if `ownerAddress` holds ≥1 token in a CW721 collection. */
export async function checkCw721Balance(
  nftContract: string,
  ownerAddress: string,
): Promise<boolean> {
  try {
    const result = await queryAnyContract<{ tokens: string[] }>(nftContract, {
      tokens: { owner: ownerAddress, limit: 1 },
    });
    return result.tokens.length > 0;
  } catch {
    return false;
  }
}

export const INJECTIVE_EVM_RPC = "https://testnet.evm.injective.network";

/** Derive the 0x EVM address that shares the key behind an inj1… address.
 *  Injective accounts map 1:1 between bech32 (inj1…) and hex (0x…). */
export function injToEvmAddress(injectiveAddress: string): string {
  return getEthereumAddress(injectiveAddress);
}

/** Returns true if `walletAddress` (0x…) holds ≥1 token in an ERC721 contract.
 *  Hard-capped with a timeout so a slow/unreachable EVM RPC can't hang the UI. */
export async function checkErc721Balance(
  nftContract: string,
  walletAddress: string,
  timeoutMs = 6000,
): Promise<boolean> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // eth_call: balanceOf(address) — selector 0x70a08231
    const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
    const data = "0x70a08231" + paddedAddr;
    const res = await fetch(INJECTIVE_EVM_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: nftContract, data }, "latest"],
      }),
    });
    const json = await res.json();
    if (json.error || !json.result || json.result === "0x") return false;
    return BigInt(json.result) > BigInt(0);
  } catch {
    return false; // timeout / network error → fail-closed (not eligible)
  } finally {
    clearTimeout(timer);
  }
}

// ── Build msg ─────────────────────────────────────────────────────────────────
export function buildExecuteMsg(
  sender: string,
  msg: object,
  funds?: { denom: string; amount: string }[]
) {
  return MsgExecuteContractCompat.fromJSON({
    contractAddress: CONTRACT_ADDRESS,
    sender,
    msg,
    funds: funds ?? [],
  });
}

// ── Broadcast via Keplr (no wallet-ts dependency) ─────────────────────────────
/**
 * Signs and broadcasts a CosmWasm execute message using Keplr's signDirect
 * API and broadcasts over gRPC-web (TxGrpcApi) — the same transport the queries
 * use, which is reachable from the browser (the LCD REST /txs POST was failing).
 * Does NOT use @injectivelabs/wallet-ts so there is no version-mismatch risk.
 *
 * @returns the confirmed on-chain tx hash
 */
/**
 * Poll for tx inclusion after broadcast.
 * TX_TIMEOUT — do NOT re-broadcast; surface the hash so the user can check the explorer.
 */
export async function pollTxHash(
  txHash: string,
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<void> {
  const attempts   = opts.attempts   ?? 20;
  const intervalMs = opts.intervalMs ?? 3_000;

  const txApi = new TxGrpcApi(ENDPOINTS.grpc);

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await txApi.fetchTx(txHash);
      if (res && res.code === 0) return;
      if (res && res.code !== 0) {
        throw parseChainError(
          new Error(`Transaction failed (code ${res.code}): ${res.rawLog}`),
          { txHash },
        );
      }
    } catch (err) {
      // 404 means not yet indexed — keep polling
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("404") && !msg.includes("not found")) {
        throw parseChainError(err, { txHash });
      }
    }
    if (i < attempts - 1) {
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }

  throw parseChainError(new Error(`TX polling timed out: ${txHash}`), { txHash });
}

export async function broadcastWithKeplr(
  injectiveAddress: string,
  msg: MsgExecuteContractCompat,
  feeConfig: FeeConfig = STANDARD_FEE,
): Promise<string> {
  const keplr = (window as any).keplr;
  if (!keplr) throw parseChainError(new Error("Keplr wallet not found. Please install the Keplr extension."));

  // 1. Enable Injective testnet in Keplr
  await keplr.enable(CHAIN_ID);

  // 2. Get public key bytes from Keplr
  const key          = await keplr.getKey(CHAIN_ID);
  const pubKeyBase64 = Buffer.from(key.pubKey).toString("base64");

  // 3. Fetch account sequence + account number from the chain
  const authApi    = new ChainRestAuthApi(ENDPOINTS.rest);
  const accountRes = await authApi.fetchAccount(injectiveAddress);
  const baseAcct   = accountRes.account.base_account;
  const sequence      = parseInt(baseAcct.sequence, 10);
  const accountNumber = parseInt(baseAcct.account_number, 10);

  // 4. Build unsigned tx + Cosmos-compatible signDoc (Keplr-ready)
  const { signDoc, txRaw } = createTransactionAndCosmosSignDoc({
    message: msg,
    memo:    "Questa Campaign",
    fee: {
      amount: [{ denom: "inj", amount: feeConfig.amount }],
      gas:    feeConfig.gas,
    },
    pubKey:        pubKeyBase64,
    sequence,
    accountNumber,
    chainId:       CHAIN_ID,
  });

  // 5. Ask Keplr to sign — opens the approval popup
  const signResponse = await keplr.signDirect(
    CHAIN_ID,
    injectiveAddress,
    signDoc,
  );

  // 6. Broadcast the EXACT bytes Keplr signed, not the locally-built ones.
  //    Keplr re-serializes the sign doc, so its body/authInfo bytes can differ
  //    from txRaw's. Verifying the signature against the original bytes fails
  //    ("unable to verify single signer signature"), so adopt the signed bytes.
  txRaw.bodyBytes     = signResponse.signed.bodyBytes;
  txRaw.authInfoBytes = signResponse.signed.authInfoBytes;
  txRaw.signatures    = [Buffer.from(signResponse.signature.signature, "base64")];

  const txApi = new TxGrpcApi(ENDPOINTS.grpc);
  const res   = await txApi.broadcast(getTxRawFromTxRawOrDirectSignResponse(txRaw));

  if (res.code !== 0) {
    throw parseChainError(
      new Error(`Transaction failed (code ${res.code}): ${res.rawLog ?? res.txHash}`),
      { injectiveAddress },
    );
  }

  return res.txHash;
}

// ── EVM (MetaMask) wallet broadcast ───────────────────────────────────────────
/**
 * Converts an Ethereum hex address (0x…) to an Injective bech32 address (inj1…).
 * Input is lowercased automatically.
 */
export function evmToInjAddress(evmAddress: string): string {
  return getInjectiveAddress(evmAddress.toLowerCase());
}

/**
 * Signs and broadcasts a CosmWasm execute message using MetaMask's
 * eth_signTypedData_v4 (EIP-712) flow for Injective.
 *
 * @param evmAddress  The 0x… Ethereum address of the connected MetaMask account
 * @param msg         The pre-built MsgExecuteContractCompat
 * @returns           The confirmed on-chain tx hash
 */
export async function broadcastWithEVM(
  evmAddress: string,
  msg: MsgExecuteContractCompat,
  feeConfig: FeeConfig = STANDARD_FEE,
): Promise<string> {
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw parseChainError(new Error("MetaMask not found. Please install the MetaMask extension."));

  // 1. Injective bech32 address from EVM hex address
  const injAddress = evmToInjAddress(evmAddress);

  // 2. Fetch account sequence + account number from the chain
  const authApi    = new ChainRestAuthApi(ENDPOINTS.rest);
  const accountRes = await authApi.fetchAccount(injAddress);
  const baseAcct   = accountRes.account.base_account;
  const sequence      = parseInt(baseAcct.sequence, 10);
  const accountNumber = parseInt(baseAcct.account_number, 10);

  // 3. Recover the compressed secp256k1 public key.
  //    Cached in localStorage after the first recovery so subsequent
  //    transactions skip the personal_sign popup entirely — one prompt per
  //    address, ever (same UX as Keplr).
  const { ethers } = await import("ethers");
  const PUBKEY_CACHE_KEY = `rb_evm_pubkey_${evmAddress.toLowerCase()}`;

  let pubKeyBase64: string | null =
    typeof window !== "undefined" ? localStorage.getItem(PUBKEY_CACHE_KEY) : null;

  if (!pubKeyBase64) {
    const PUBKEY_MSG = "Questa: authorize Injective transaction";
    const rawSig = await ethereum.request({
      method: "personal_sign",
      params: [ethers.hexlify(ethers.toUtf8Bytes(PUBKEY_MSG)), evmAddress],
    });
    const uncompressedHex = ethers.SigningKey.recoverPublicKey(
      ethers.hashMessage(PUBKEY_MSG),
      rawSig,
    ); // "0x04{x}{y}"
    const uncompressed = ethers.getBytes(uncompressedHex);           // 65 bytes
    const x    = uncompressed.slice(1, 33);
    const yLsb = uncompressed[64] & 1;
    const compressed = new Uint8Array(33);
    compressed[0] = yLsb === 0 ? 0x02 : 0x03;
    compressed.set(x, 1);
    pubKeyBase64 = Buffer.from(compressed).toString("base64");
    try { localStorage.setItem(PUBKEY_CACHE_KEY, pubKeyBase64); } catch { /* storage may be restricted */ }
  }

  // 4. Build unsigned tx to get the body/authInfo bytes we need for EIP-712
  const { txRaw } = createTransactionAndCosmosSignDoc({
    message: msg,
    memo:    "Questa Campaign",
    fee: {
      amount: [{ denom: "inj", amount: feeConfig.amount }],
      gas:    feeConfig.gas,
    },
    pubKey:        pubKeyBase64!,
    sequence,
    accountNumber,
    chainId:       CHAIN_ID,
  });

  // 5. Build EIP-712 typed data for this transaction
  const eip712TypedData = getEip712TypedData({
    msgs:       msg,
    tx: {
      accountNumber: String(accountNumber),
      sequence:      String(sequence),
      timeoutHeight: "0",
      chainId:       CHAIN_ID,
      memo:          "Questa Campaign",
    },
    fee: {
      amount: [{ denom: "inj", amount: feeConfig.amount }],
      gas:    feeConfig.gas,
    },
    evmChainId: 1439, // Injective Testnet EVM chain ID
  });

  // 6. Ask MetaMask to sign the EIP-712 typed data
  const eip712Sig: string = await ethereum.request({
    method: "eth_signTypedData_v4",
    params: [evmAddress, JSON.stringify(eip712TypedData)],
  });

  // 7. Build the final raw tx with the Web3 extension + EIP-712 signature
  const web3Extension = createWeb3Extension({ evmChainId: 1439 });
  const txRawEIP712   = createTxRawEIP712(txRaw, web3Extension);
  // The EIP-712 signature is a 0x-prefixed 65-byte hex string (r+s+v)
  txRawEIP712.signatures = [Buffer.from(eip712Sig.slice(2), "hex")];

  // 8. Broadcast
  const txApi = new TxGrpcApi(ENDPOINTS.grpc);
  const res   = await txApi.broadcast(getTxRawFromTxRawOrDirectSignResponse(txRawEIP712));

  if (res.code !== 0) {
    throw parseChainError(
      new Error(`Transaction failed (code ${res.code}): ${res.rawLog ?? res.txHash}`),
      { evmAddress },
    );
  }

  return res.txHash;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
export function injToWei(inj: number): string {
  return BigInt(Math.round(inj * 1e18)).toString();
}

export function weiToInj(wei: string): number {
  return Number(BigInt(wei)) / 1e18;
}

export function truncateAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 10)}...${addr.slice(-6)}`;
}
