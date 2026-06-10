/**
 * LLM helper for agent routes.
 *
 * Wraps DeepSeek via the OpenAI SDK:
 * - Forces response_format: json_object
 * - Validates output against a Zod schema
 * - Retries once on malformed output
 * - Throws AgentError(LLM_MALFORMED_OUTPUT) on second failure
 * - Throws AgentError(LLM_CALL_FAILED) on API errors
 */
import OpenAI from "openai";
import { z } from "zod";
import { AppError } from "../errors";
import { createRouteLogger } from "../logger";

const log = createRouteLogger("agent/llm");

// Shared client — instantiated once
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new AppError({
      code: "LLM_CALL_FAILED",
      userMessage: "AI agent is not configured (missing API key).",
      retryable: false,
    });
  }
  _client = new OpenAI({
    apiKey,
    baseURL: "https://api.deepseek.com",
  });
  return _client;
}

export interface LLMCallOptions {
  system:    string;
  user:      string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Call the LLM and parse + validate the output against a Zod schema.
 * Retries once on malformed output. Throws AppError on second failure.
 */
export async function llmCall<T>(
  opts:   LLMCallOptions,
  schema: z.ZodType<T>,
): Promise<T> {
  const client = getClient();
  let lastErr: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    try {
      const res = await client.chat.completions.create({
        model:           "deepseek-chat",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: opts.system },
          { role: "user",   content: opts.user   },
        ],
        max_tokens:  opts.maxTokens  ?? 600,
        temperature: opts.temperature ?? 0.4,
      });

      const raw = res.choices[0]?.message?.content?.trim() ?? "";
      const durationMs = Date.now() - t0;
      log.info("LLM response", { attempt: attempt + 1, durationMs, chars: raw.length });

      // Strip markdown fences if the model still wraps JSON
      const jsonStr = raw
        .replace(/^```(?:json)?\n?/m, "")
        .replace(/\n?```$/m, "")
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error("JSON.parse failed: " + jsonStr.slice(0, 120));
      }

      // Zod validation
      const result = schema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new Error(`Schema validation failed: ${issues}`);
      }

      return result.data;
    } catch (err) {
      lastErr = err;
      log.warn("LLM attempt failed", { attempt: attempt + 1, error: err instanceof Error ? err.message : String(err) });

      // Don't retry API-level errors (quota, auth) — only malformed output
      const msg = err instanceof Error ? err.message : String(err);
      const isApiError = msg.includes("401") || msg.includes("429") || msg.includes("503");
      if (isApiError) {
        throw new AppError({
          code: "LLM_CALL_FAILED",
          userMessage: "AI agent is temporarily unavailable.",
          retryable: true,
          cause: err,
        });
      }
    }
  }

  throw new AppError({
    code: "LLM_MALFORMED_OUTPUT",
    userMessage: "AI agent produced an unexpected response after retry.",
    retryable: false,
    cause: lastErr,
  });
}
