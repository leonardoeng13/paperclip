import fs from "node:fs/promises";
import { exec as cpExec } from "node:child_process";
import { promisify } from "node:util";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  asBoolean,
  parseObject,
  buildPaperclipEnv,
  redactEnvForLogs,
  ensureAbsoluteDirectory,
  renderTemplate,
  joinPromptSections,
} from "@paperclipai/adapter-utils/server-utils";
import { chatCompletion, listModels, type ChatMessage, type ToolCall } from "./api.js";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL, DEFAULT_MAX_TURNS } from "../index.js";

const execAsync = promisify(cpExec);

const BASH_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "bash",
    description:
      "Execute a shell command in the working directory and return stdout/stderr. " +
      "Use this to read files, run scripts, make changes, and verify results.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute.",
        },
      },
      required: ["command"],
    },
  },
};

const DEFAULT_SYSTEM_PROMPT =
  "You are a software engineering agent. " +
  "You have access to a `bash` tool to execute shell commands. " +
  "Use it to read files, edit code, run tests, and complete tasks. " +
  "Be concise in your explanations and focus on getting the task done.";

function buildRuntimeEnv(
  configEnv: Record<string, unknown>,
  paperclipEnv: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = { ...paperclipEnv };
  for (const [key, value] of Object.entries(configEnv)) {
    if (typeof value === "string") {
      env[key] = value;
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    ) {
      const rec = value as Record<string, unknown>;
      if (rec.type === "plain" && typeof rec.value === "string") {
        env[key] = rec.value;
      }
    }
  }
  return env;
}

async function readInstructionsFile(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.trim() || null;
  } catch {
    return null;
  }
}

async function executeBashCommand(
  command: string,
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ output: string; exitCode: number; isError: boolean }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      env: { ...process.env, ...env },
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
    });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { output: output || "(no output)", exitCode: 0, isError: false };
  } catch (err) {
    const execError = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
    };
    const output = [execError.stdout ?? "", execError.stderr ?? ""]
      .filter(Boolean)
      .join("\n")
      .trim();
    const exitCode = typeof execError.code === "number" ? execError.code : 1;
    const isTimeout = execError.killed === true || execError.code === null;
    return {
      output: output || (isTimeout ? "Command timed out" : "Command failed"),
      exitCode,
      isError: true,
    };
  }
}

export async function execute(
  ctx: AdapterExecutionContext,
): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta } = ctx;

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const apiKey =
    asString(config.apiKey, asString(process.env.OLLAMA_API_KEY, "")) || null;
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);
  const maxTurns = asNumber(config.maxTurns, DEFAULT_MAX_TURNS);
  const timeoutSec = asNumber(config.timeoutSec, 0);
  const cmdTimeoutMs = 30_000;

  const configEnv = parseObject(config.env);
  const paperclipEnv = buildPaperclipEnv(agent);
  const runtimeEnv = buildRuntimeEnv(configEnv, paperclipEnv);

  const configCwd = asString(config.cwd, "");
  const workspaceContext = parseObject(context.paperclipWorkspace);
  const workspaceCwd = asString(workspaceContext.cwd, "");
  let effectiveCwd = workspaceCwd || configCwd || process.cwd();

  try {
    await ensureAbsoluteDirectory(effectiveCwd, { createIfMissing: true });
  } catch {
    // non-fatal — continue with process.cwd() as fallback
    effectiveCwd = process.cwd();
  }

  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );
  const templateData = {
    agent: { id: agent.id, name: agent.name },
    run: { id: runId },
  };

  const promptContext = parseObject(context.paperclipRun ?? context);
  const taskPrompt = asString(promptContext.prompt, asString(context.prompt, ""));

  const prompt = taskPrompt || renderTemplate(promptTemplate, templateData);

  if (onMeta) {
    await onMeta({
      adapterType: "ollama_local",
      command: baseUrl,
      cwd: effectiveCwd,
      commandNotes: [`model: ${model}`],
      env: redactEnvForLogs(runtimeEnv),
      prompt,
    });
  }

  // Build system prompt
  const instructionsFilePath = asString(config.instructionsFilePath, "");
  const customSystemPrompt = asString(config.systemPrompt, "");
  let instructionsContent: string | null = null;
  if (instructionsFilePath) {
    instructionsContent = await readInstructionsFile(instructionsFilePath);
    if (!instructionsContent) {
      await onLog(
        "stderr",
        `[paperclip] Warning: could not read instructions file: ${instructionsFilePath}\n`,
      );
    }
  }

  const systemPrompt = joinPromptSections([
    customSystemPrompt || DEFAULT_SYSTEM_PROMPT,
    instructionsContent,
    `Working directory: ${effectiveCwd}`,
  ]);

  // Log start
  const sessionId = `ollama-${runId}`;
  await onLog(
    "stdout",
    JSON.stringify({ type: "session.started", model, sessionId }) + "\n",
  );

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: prompt },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let lastAssistantText = "";
  let errorMessage: string | null = null;
  let timedOut = false;

  const runTimeout =
    timeoutSec > 0
      ? setTimeout(() => {
          timedOut = true;
        }, timeoutSec * 1000)
      : null;

  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      if (timedOut) {
        await onLog(
          "stderr",
          JSON.stringify({ type: "error", message: "Run timed out" }) + "\n",
        );
        errorMessage = "Run timed out";
        break;
      }

      let response;
      try {
        response = await chatCompletion(
          baseUrl,
          apiKey,
          {
            model,
            messages,
            tools: [BASH_TOOL_DEFINITION],
            tool_choice: "auto",
          },
          timeoutSec > 0 ? Math.max(10_000, timeoutSec * 1000) : 120_000,
        );
      } catch (err) {
        errorMessage =
          err instanceof Error ? err.message : String(err);
        await onLog(
          "stderr",
          JSON.stringify({ type: "error", message: errorMessage }) + "\n",
        );
        break;
      }

      const choice = response.choices[0];
      if (!choice) {
        errorMessage = "No response from model";
        await onLog(
          "stderr",
          JSON.stringify({ type: "error", message: errorMessage }) + "\n",
        );
        break;
      }

      // Accumulate usage
      if (response.usage) {
        totalInputTokens += response.usage.prompt_tokens;
        totalOutputTokens += response.usage.completion_tokens;
      }

      const assistantMessage = choice.message;
      const assistantText = assistantMessage.content?.trim() ?? "";
      const toolCalls: ToolCall[] = assistantMessage.tool_calls ?? [];

      // Log the assistant's text response (if any)
      if (assistantText) {
        lastAssistantText = assistantText;
        await onLog(
          "stdout",
          JSON.stringify({ type: "assistant", text: assistantText }) + "\n",
        );
      }

      // Add assistant turn to message history
      messages.push({
        role: "assistant",
        content: assistantText || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });

      // If no tool calls, we're done
      if (toolCalls.length === 0) {
        break;
      }

      // Execute all tool calls
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let toolArgs: Record<string, unknown> = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments) as Record<
            string,
            unknown
          >;
        } catch {
          toolArgs = {};
        }

        await onLog(
          "stdout",
          JSON.stringify({
            type: "tool_call",
            id: toolCall.id,
            name: toolName,
            input: toolArgs,
          }) + "\n",
        );

        let toolOutput: string;
        let toolExitCode = 0;
        let toolIsError = false;

        if (toolName === "bash") {
          const command = asString(toolArgs.command, "");
          if (!command) {
            toolOutput = "Error: no command provided";
            toolIsError = true;
            toolExitCode = 1;
          } else {
            const result = await executeBashCommand(
              command,
              effectiveCwd,
              runtimeEnv,
              cmdTimeoutMs,
            );
            toolOutput = result.output;
            toolExitCode = result.exitCode;
            toolIsError = result.isError;
          }
        } else {
          toolOutput = `Unknown tool: ${toolName}`;
          toolIsError = true;
          toolExitCode = 1;
        }

        await onLog(
          "stdout",
          JSON.stringify({
            type: "tool_result",
            id: toolCall.id,
            output: toolOutput,
            exit_code: toolExitCode,
            is_error: toolIsError,
          }) + "\n",
        );

        // Add tool result to history
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolOutput,
          name: toolName,
        });
      }
    }
  } finally {
    if (runTimeout) clearTimeout(runTimeout);
  }

  await onLog(
    "stdout",
    JSON.stringify({
      type: "done",
      model,
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
    }) + "\n",
  );

  return {
    exitCode: errorMessage ? 1 : 0,
    signal: null,
    timedOut,
    errorMessage: errorMessage ?? null,
    model,
    provider: "ollama",
    billingType: apiKey ? "api" : "fixed",
    usage: {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    },
    summary: lastAssistantText || null,
  };
}

export async function listOllamaModels(
  config: Record<string, unknown>,
): Promise<Array<{ id: string; label: string }>> {
  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const apiKey =
    asString(config.apiKey, asString(process.env.OLLAMA_API_KEY, "")) || null;
  return listModels(baseUrl, apiKey);
}
