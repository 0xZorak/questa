/**
 * Questa — unified error taxonomy
 *
 * All errors thrown by chain/wallet/agent code must be AppError instances.
 * Never surface raw JS Error messages to the UI — use toastError(err) instead.
 */

// ── Error codes ───────────────────────────────────────────────────────────────

export type WalletErrorCode =
  | "WALLET_NOT_FOUND"       // extension not installed
  | "USER_REJECTED"          // user clicked cancel in wallet popup
  | "WALLET_LOCKED"          // wallet is locked
  | "WRONG_CHAIN"            // connected to wrong chain
  | "NO_ACCOUNT";            // no account available

export type ChainErrorCode =
  | "TX_FAILED"              // submitted but code !== 0
  | "TX_TIMEOUT"             // broadcast ok, polling timed out — do NOT re-broadcast
  | "TX_AMBIGUOUS"           // broadcast returned no hash — state unknown
  | "INSUFFICIENT_FUNDS"     // out of INJ
  | "SEQUENCE_MISMATCH"      // account sequence stale
  | "BROADCAST_FAILED"       // could not reach chain endpoint
  | "QUERY_FAILED";          // read query failed

export type AuthErrorCode =
  | "NOT_AUTHENTICATED"      // wallet not connected
  | "UNAUTHORIZED"           // wallet connected but not authorized for this action
  | "SESSION_EXPIRED";       // auth token stale

export type VerificationErrorCode =
  | "CRITERIA_CHECK_FAILED"  // error while checking eligibility criteria
  | "TWITTER_FETCH_FAILED"   // could not fetch tweet
  | "NFT_CHECK_FAILED"       // could not verify NFT ownership
  | "BALANCE_CHECK_FAILED";  // could not verify INJ balance

export type AgentErrorCode =
  | "LLM_MALFORMED_OUTPUT"   // LLM returned invalid JSON after retry
  | "LLM_CALL_FAILED"        // OpenAI/DeepSeek API unreachable
  | "AGENT_WALLET_MISSING"   // AGENT_MNEMONIC not configured
  | "AGENT_TX_FAILED"        // agent on-chain tx failed
  | "IDEMPOTENCY_CONFLICT"   // another instance already claimed this action
  | "SYBIL_DETECTED";        // submission flagged as sybil

export type AppErrorCode =
  | WalletErrorCode
  | ChainErrorCode
  | AuthErrorCode
  | VerificationErrorCode
  | AgentErrorCode;

// ── AppError class ────────────────────────────────────────────────────────────

export class AppError extends Error {
  readonly code: AppErrorCode;
  /** Actionable user-facing message — safe to display in UI */
  readonly userMessage: string;
  /** Whether a retry is appropriate */
  readonly retryable: boolean;
  /** Original error that caused this */
  readonly cause?: unknown;
  /** Extra structured context for logging */
  readonly context?: Record<string, unknown>;

  constructor(opts: {
    code: AppErrorCode;
    userMessage: string;
    retryable: boolean;
    cause?: unknown;
    context?: Record<string, unknown>;
  }) {
    super(opts.userMessage);
    this.name = "AppError";
    this.code = opts.code;
    this.userMessage = opts.userMessage;
    this.retryable = opts.retryable;
    this.cause = opts.cause;
    this.context = opts.context;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

/** Parse a chain/broadcast error into an AppError */
export function parseChainError(err: unknown, context?: Record<string, unknown>): AppError {
  if (isAppError(err)) return err;

  const msg = err instanceof Error ? err.message : String(err);
  const lc = msg.toLowerCase();

  if (lc.includes("user rejected") || lc.includes("user denied") || lc.includes("rejected the request")) {
    return new AppError({
      code: "USER_REJECTED",
      userMessage: "Transaction cancelled.",
      retryable: false,
      cause: err, context,
    });
  }
  if (lc.includes("insufficient funds") || lc.includes("insufficient balance")) {
    return new AppError({
      code: "INSUFFICIENT_FUNDS",
      userMessage: "Insufficient INJ balance to cover transaction fees.",
      retryable: false,
      cause: err, context,
    });
  }
  if (lc.includes("sequence") || lc.includes("account sequence mismatch")) {
    return new AppError({
      code: "SEQUENCE_MISMATCH",
      userMessage: "Account sequence mismatch — please try again.",
      retryable: true,
      cause: err, context,
    });
  }
  if (lc.includes("timeout") || lc.includes("timed out")) {
    return new AppError({
      code: "TX_TIMEOUT",
      userMessage: "Transaction is taking longer than expected. Check the explorer for your tx hash.",
      retryable: false, // NEVER re-broadcast — poll instead
      cause: err, context,
    });
  }
  if (lc.includes("code 5") || lc.includes("code: 5")) {
    return new AppError({
      code: "INSUFFICIENT_FUNDS",
      userMessage: "Insufficient INJ balance to fund this campaign.",
      retryable: false,
      cause: err, context,
    });
  }
  if (lc.includes("code ") || lc.includes("transaction failed")) {
    return new AppError({
      code: "TX_FAILED",
      userMessage: "Transaction was rejected by the chain. Check your inputs and try again.",
      retryable: false,
      cause: err, context,
    });
  }
  if (lc.includes("keplr") && lc.includes("not found")) {
    return new AppError({
      code: "WALLET_NOT_FOUND",
      userMessage: "Keplr wallet not found. Please install the Keplr extension.",
      retryable: false,
      cause: err, context,
    });
  }
  if (lc.includes("metamask") && lc.includes("not found")) {
    return new AppError({
      code: "WALLET_NOT_FOUND",
      userMessage: "MetaMask not found. Please install the MetaMask extension.",
      retryable: false,
      cause: err, context,
    });
  }

  return new AppError({
    code: "BROADCAST_FAILED",
    userMessage: "Transaction failed. Please try again.",
    retryable: true,
    cause: err, context,
  });
}

/** Parse a verification-path error into an AppError (fail-closed) */
export function parseVerificationError(err: unknown, context?: Record<string, unknown>): AppError {
  if (isAppError(err)) return err;
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.toLowerCase().includes("twitter")) {
    return new AppError({
      code: "TWITTER_FETCH_FAILED",
      userMessage: "Could not fetch tweet for verification.",
      retryable: true,
      cause: err, context,
    });
  }
  if (msg.toLowerCase().includes("nft") || msg.toLowerCase().includes("cw721")) {
    return new AppError({
      code: "NFT_CHECK_FAILED",
      userMessage: "Could not verify NFT ownership.",
      retryable: true,
      cause: err, context,
    });
  }
  return new AppError({
    code: "CRITERIA_CHECK_FAILED",
    userMessage: "Verification check failed — please try again.",
    retryable: true,
    cause: err, context,
  });
}

/** Parse an agent-path error into an AppError */
export function parseAgentError(err: unknown, context?: Record<string, unknown>): AppError {
  if (isAppError(err)) return err;
  const msg = err instanceof Error ? err.message : String(err);
  const lc = msg.toLowerCase();

  if (lc.includes("malformed") || lc.includes("invalid json") || lc.includes("parse")) {
    return new AppError({
      code: "LLM_MALFORMED_OUTPUT",
      userMessage: "AI agent produced an unexpected response. Retrying…",
      retryable: true,
      cause: err, context,
    });
  }
  return new AppError({
    code: "LLM_CALL_FAILED",
    userMessage: "AI agent is temporarily unavailable.",
    retryable: true,
    cause: err, context,
  });
}

// ── Code → friendly message map (for toastError) ─────────────────────────────

const CODE_MESSAGES: Partial<Record<AppErrorCode, string>> = {
  USER_REJECTED:          "Transaction cancelled.",
  WALLET_NOT_FOUND:       "Wallet extension not found. Please install Keplr or MetaMask.",
  WALLET_LOCKED:          "Your wallet is locked. Please unlock it and try again.",
  WRONG_CHAIN:            "Wrong network selected. Please switch to Injective Testnet.",
  INSUFFICIENT_FUNDS:     "Insufficient INJ balance.",
  TX_FAILED:              "Transaction failed on-chain.",
  TX_TIMEOUT:             "Transaction is still pending — check the Injective explorer.",
  TX_AMBIGUOUS:           "Transaction status unknown — do NOT retry. Check the explorer.",
  SEQUENCE_MISMATCH:      "Account sequence error. Please try again.",
  BROADCAST_FAILED:       "Could not reach the Injective network. Please try again.",
  QUERY_FAILED:           "Failed to read chain data.",
  NOT_AUTHENTICATED:      "Please connect your wallet first.",
  UNAUTHORIZED:           "You are not authorized to perform this action.",
  CRITERIA_CHECK_FAILED:  "Eligibility check failed.",
  TWITTER_FETCH_FAILED:   "Could not verify your tweet.",
  NFT_CHECK_FAILED:       "Could not verify NFT ownership.",
  BALANCE_CHECK_FAILED:   "Could not verify your INJ balance.",
  LLM_MALFORMED_OUTPUT:   "AI response was malformed.",
  LLM_CALL_FAILED:        "AI agent is unavailable.",
  AGENT_WALLET_MISSING:   "Agent wallet not configured (server config error).",
  AGENT_TX_FAILED:        "Agent transaction failed on-chain.",
  IDEMPOTENCY_CONFLICT:   "This action is already being processed.",
  SYBIL_DETECTED:         "This submission was flagged as suspicious.",
};

/**
 * Map an unknown error to a user-friendly message.
 * Call this in catch blocks before passing to toast.error().
 */
export function toastMessage(err: unknown): string {
  if (isAppError(err)) {
    return CODE_MESSAGES[err.code] ?? err.userMessage;
  }
  if (err instanceof Error) {
    // Never surface stack traces or SDK internals
    const msg = err.message;
    if (msg.length < 200 && !msg.includes("at ") && !msg.includes("Error:")) {
      return msg;
    }
  }
  return "Something went wrong. Please try again.";
}

/** Short alias — same as toastMessage but name matches the spec */
export const toastError = toastMessage;
