/**
 * Minimal OpenAI-compatible HTTP client used only server-side.
 *
 * - Never logs the API key (only the base URL and model).
 * - Enforces a hard timeout; callers fall back to the computed summary on failure.
 * - Treats provider responses as data, never as instructions.
 */
import { env } from "../config/env.js";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AiChatResult {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code: "TIMEOUT" | "UPSTREAM" | "INVALID_RESPONSE" | "NOT_CONFIGURED",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

function maskKey(key: string | undefined): string {
  if (!key) return "(none)";
  if (key.length <= 8) return "***";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function isAiConfigured(): boolean {
  return Boolean(env.AI_PROVIDER_API_KEY);
}

export async function chatCompletion(
  messages: AiChatMessage[],
  options: AiChatOptions = {},
): Promise<AiChatResult> {
  if (!env.AI_PROVIDER_API_KEY) {
    throw new AiProviderError(
      "AI provider is not configured. Set AI_PROVIDER_API_KEY in the environment.",
      "NOT_CONFIGURED",
    );
  }

  const model = options.model ?? env.AI_MODEL;
  const maxTokens = options.maxTokens ?? env.AI_MAX_TOKENS;
  const temperature = options.temperature ?? 0.2;

  const url = `${env.AI_PROVIDER_BASE_URL.replace(/\/+$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timeoutMs = env.AI_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal ?? controller.signal;

  try {
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AI_PROVIDER_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new AiProviderError(
        `AI provider returned ${response.status}: ${text.slice(0, 200)}`,
        "UPSTREAM",
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const text = payload?.choices?.[0]?.message?.content;
    if (!text || typeof text !== "string") {
      throw new AiProviderError("AI provider returned an empty response.", "INVALID_RESPONSE");
    }

    return {
      text,
      model: payload.model ?? model,
      usage: {
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
      },
    };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AiProviderError(`AI provider request timed out after ${timeoutMs}ms.`, "TIMEOUT");
    }
    throw new AiProviderError(
      error instanceof Error ? error.message : "AI provider request failed.",
      "UPSTREAM",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Log-safe diagnostic line. */
export function aiProviderLabel(): string {
  return `AI provider: ${env.AI_PROVIDER_BASE_URL} · model ${env.AI_MODEL} · key ${maskKey(env.AI_PROVIDER_API_KEY)}`;
}