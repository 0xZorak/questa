/**
 * withRetry — exponential backoff + jitter
 *
 * Defaults: 3 attempts, 500 ms base, 8 000 ms max cap.
 * Never retries USER_REJECTED or TX_AMBIGUOUS / TX_TIMEOUT codes because
 * re-broadcasting after an ambiguous result is dangerous.
 */
import { AppError, isAppError } from "./errors";

export interface RetryOptions {
  attempts?: number;   // default 3
  baseMs?:   number;   // default 500
  maxMs?:    number;   // default 8000
  /** Extra predicate — return false to stop retrying */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

const NON_RETRYABLE_CODES = new Set([
  "USER_REJECTED",
  "TX_TIMEOUT",
  "TX_AMBIGUOUS",
  "IDEMPOTENCY_CONFLICT",
  "INSUFFICIENT_FUNDS",
  "UNAUTHORIZED",
  "NOT_AUTHENTICATED",
  "WALLET_NOT_FOUND",
  "SYBIL_DETECTED",
]);

function jitter(ms: number): number {
  // ±25 % random jitter
  return ms * (0.75 + Math.random() * 0.5);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const attempts  = opts.attempts ?? 3;
  const baseMs    = opts.baseMs   ?? 500;
  const maxMs     = opts.maxMs    ?? 8_000;

  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      // AppError: check retryable flag and code
      if (isAppError(err)) {
        if (!err.retryable) throw err;
        if (NON_RETRYABLE_CODES.has(err.code)) throw err;
      }

      // Extra predicate
      if (opts.shouldRetry && !opts.shouldRetry(err, i + 1)) throw err;

      // Last attempt — re-throw immediately
      if (i === attempts - 1) break;

      // Exponential backoff with jitter
      const backoff = Math.min(baseMs * Math.pow(2, i), maxMs);
      await delay(jitter(backoff));
    }
  }

  throw lastErr;
}
