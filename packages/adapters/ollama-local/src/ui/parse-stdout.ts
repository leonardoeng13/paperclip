import { type TranscriptEntry } from "@paperclipai/adapter-utils";

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseOllamaStdoutLine(
  line: string,
  ts: string,
): TranscriptEntry[] {
  const parsed = asRecord(safeJsonParse(line));
  if (!parsed) {
    return [{ kind: "stdout", ts, text: line }];
  }

  const type = asString(parsed.type);

  if (type === "session.started") {
    return [
      {
        kind: "init",
        ts,
        model: asString(parsed.model, "ollama"),
        sessionId: asString(parsed.sessionId, ""),
      },
    ];
  }

  if (type === "assistant") {
    const text = asString(parsed.text);
    if (text) return [{ kind: "assistant", ts, text }];
    return [];
  }

  if (type === "tool_call") {
    const name = asString(parsed.name, "bash");
    const toolUseId = asString(parsed.id, name);
    const input = parsed.input ?? {};
    return [{ kind: "tool_call", ts, name, toolUseId, input }];
  }

  if (type === "tool_result") {
    const toolUseId = asString(parsed.id, "bash");
    const content = asString(parsed.output, "");
    const isError = parsed.is_error === true || asNumber(parsed.exit_code) !== 0;
    return [{ kind: "tool_result", ts, toolUseId, content, isError }];
  }

  if (type === "done") {
    const inputTokens = asNumber(parsed.input_tokens);
    const outputTokens = asNumber(parsed.output_tokens);
    return [
      {
        kind: "result",
        ts,
        text: "",
        inputTokens,
        outputTokens,
        cachedTokens: 0,
        costUsd: 0,
        subtype: "done",
        isError: false,
        errors: [],
      },
    ];
  }

  if (type === "error") {
    const text = asString(parsed.message, "error");
    return [{ kind: "stderr", ts, text }];
  }

  return [{ kind: "stdout", ts, text: line }];
}
