import { describe, expect, it } from "vitest";
import { parseOllamaStdoutLine } from "@paperclipai/adapter-ollama-local/ui";

const ts = "2026-03-25T00:00:00.000Z";

describe("ollama_local ui stdout parser", () => {
  it("parses session.started event", () => {
    const line = JSON.stringify({
      type: "session.started",
      model: "llama3.2",
      sessionId: "ollama-run-1",
    });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      { kind: "init", ts, model: "llama3.2", sessionId: "ollama-run-1" },
    ]);
  });

  it("parses assistant text message", () => {
    const line = JSON.stringify({ type: "assistant", text: "Hello, world!" });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      { kind: "assistant", ts, text: "Hello, world!" },
    ]);
  });

  it("skips empty assistant messages", () => {
    const line = JSON.stringify({ type: "assistant", text: "" });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([]);
  });

  it("parses tool_call event", () => {
    const line = JSON.stringify({
      type: "tool_call",
      id: "call_abc",
      name: "bash",
      input: { command: "ls -la" },
    });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_call",
        ts,
        name: "bash",
        toolUseId: "call_abc",
        input: { command: "ls -la" },
      },
    ]);
  });

  it("parses tool_result as success when exit_code is 0", () => {
    const line = JSON.stringify({
      type: "tool_result",
      id: "call_abc",
      output: "file1.ts\nfile2.ts",
      exit_code: 0,
      is_error: false,
    });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_result",
        ts,
        toolUseId: "call_abc",
        content: "file1.ts\nfile2.ts",
        isError: false,
      },
    ]);
  });

  it("parses tool_result as error when exit_code is non-zero", () => {
    const line = JSON.stringify({
      type: "tool_result",
      id: "call_xyz",
      output: "command not found",
      exit_code: 127,
      is_error: true,
    });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      {
        kind: "tool_result",
        ts,
        toolUseId: "call_xyz",
        content: "command not found",
        isError: true,
      },
    ]);
  });

  it("parses done event with token usage", () => {
    const line = JSON.stringify({
      type: "done",
      model: "llama3.2",
      input_tokens: 150,
      output_tokens: 42,
    });
    const result = parseOllamaStdoutLine(line, ts);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "result",
      ts,
      inputTokens: 150,
      outputTokens: 42,
      isError: false,
    });
  });

  it("parses error event", () => {
    const line = JSON.stringify({
      type: "error",
      message: "connection refused",
    });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      { kind: "stderr", ts, text: "connection refused" },
    ]);
  });

  it("falls back to stdout for non-JSON lines", () => {
    const line = "raw text output";
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      { kind: "stdout", ts, text: "raw text output" },
    ]);
  });

  it("falls back to stdout for unknown JSON events", () => {
    const line = JSON.stringify({ type: "unknown_event", data: 42 });
    expect(parseOllamaStdoutLine(line, ts)).toEqual([
      { kind: "stdout", ts, text: line },
    ]);
  });
});
