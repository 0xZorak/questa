/**
 * Structured JSON logger for API routes.
 *
 * Outputs one line of JSON per event:
 * { level, route, ts, durationMs?, code?, wallet?, campaignId?, txHash?, msg, ...extra }
 *
 * Usage:
 *   const log = createRouteLogger("/api/agent/verify");
 *   log.info("Starting verification", { campaignId: 5 });
 *   log.error("LLM failed", err, { wallet: "inj1…" });
 */
import { isAppError } from "./errors";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level:       LogLevel;
  route:       string;
  ts:          string;
  msg:         string;
  durationMs?: number;
  code?:       string;
  wallet?:     string;
  campaignId?: number | string;
  txHash?:     string;
  [key: string]:  unknown;
}

function serialize(entry: LogEntry): string {
  try {
    return JSON.stringify(entry);
  } catch {
    return JSON.stringify({ level: entry.level, route: entry.route, msg: "log-serialize-error" });
  }
}

function emit(level: LogLevel, entry: LogEntry): void {
  const line = serialize(entry);
  if (level === "error" || level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export interface RouteLogger {
  debug: (msg: string, extra?: Record<string, unknown>) => void;
  info:  (msg: string, extra?: Record<string, unknown>) => void;
  warn:  (msg: string, extra?: Record<string, unknown>) => void;
  error: (msg: string, err?: unknown, extra?: Record<string, unknown>) => void;
  /** Convenience: log with timing. Start with log.start(), end with log.end(). */
  start: () => number;
  end:   (msg: string, startedAt: number, extra?: Record<string, unknown>) => void;
}

export function createRouteLogger(route: string): RouteLogger {
  function base(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
    emit(level, { level, route, ts: new Date().toISOString(), msg, ...extra });
  }

  return {
    debug: (msg, extra) => base("debug", msg, extra),
    info:  (msg, extra) => base("info",  msg, extra),
    warn:  (msg, extra) => base("warn",  msg, extra),

    error(msg, err, extra) {
      const errExtra: Record<string, unknown> = {};
      if (isAppError(err)) {
        errExtra.code    = err.code;
        errExtra.retryable = err.retryable;
        if (err.context) errExtra.context = err.context;
      } else if (err instanceof Error) {
        errExtra.errorMessage = err.message;
      } else if (err !== undefined) {
        errExtra.errorRaw = String(err);
      }
      emit("error", { level: "error", route, ts: new Date().toISOString(), msg, ...errExtra, ...extra });
    },

    start() {
      return Date.now();
    },

    end(msg, startedAt, extra) {
      const durationMs = Date.now() - startedAt;
      base("info", msg, { durationMs, ...extra });
    },
  };
}
