export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OllamaModelsResponse {
  object: string;
  data: Array<{ id: string; object: string }>;
}

export class OllamaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OllamaApiError";
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function chatCompletion(
  baseUrl: string,
  apiKey: string | null,
  body: Record<string, unknown>,
  timeoutMs = 120_000,
): Promise<ChatCompletionResponse> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new OllamaApiError(
        `HTTP ${response.status}: ${errorText || response.statusText}`,
        response.status,
      );
    }

    return (await response.json()) as ChatCompletionResponse;
  } catch (err) {
    if (err instanceof OllamaApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new OllamaApiError("Request timed out");
    }
    throw new OllamaApiError(err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

export async function listModels(
  baseUrl: string,
  apiKey: string | null,
  timeoutMs = 5_000,
): Promise<Array<{ id: string; label: string }>> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/models`;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) return [];

    const data = (await response.json()) as OllamaModelsResponse;
    if (!Array.isArray(data?.data)) return [];

    return data.data
      .filter((m) => typeof m.id === "string")
      .map((m) => ({ id: m.id, label: m.id }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function pingEndpoint(
  baseUrl: string,
  apiKey: string | null,
  timeoutMs = 5_000,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = `${normalizeBaseUrl(baseUrl)}/v1/models`;
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Connection timed out" };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
