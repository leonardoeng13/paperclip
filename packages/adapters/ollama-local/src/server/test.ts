import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import {
  asString,
  parseObject,
  ensureAbsoluteDirectory,
} from "@paperclipai/adapter-utils/server-utils";
import { DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";
import { pingEndpoint, listModels } from "./api.js";

function summarizeStatus(
  checks: AdapterEnvironmentCheck[],
): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
      host.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);

  const baseUrl = asString(config.baseUrl, DEFAULT_OLLAMA_BASE_URL);
  const apiKey =
    asString(config.apiKey, asString(process.env.OLLAMA_API_KEY, "")) || null;
  const cwd = asString(config.cwd, process.cwd());
  const model = asString(config.model, DEFAULT_OLLAMA_MODEL);

  // 1. Validate the base URL
  if (!isValidUrl(baseUrl)) {
    checks.push({
      code: "ollama_invalid_base_url",
      level: "error",
      message: `Invalid base URL: ${baseUrl}`,
      hint: 'Provide a valid http:// or https:// URL, e.g. "http://localhost:11434".',
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "ollama_base_url_valid",
    level: "info",
    message: `Base URL: ${baseUrl}`,
  });

  // 2. Check working directory
  try {
    await ensureAbsoluteDirectory(cwd, { createIfMissing: true });
    checks.push({
      code: "ollama_cwd_valid",
      level: "info",
      message: `Working directory is valid: ${cwd}`,
    });
  } catch (err) {
    checks.push({
      code: "ollama_cwd_invalid",
      level: "warn",
      message: err instanceof Error ? err.message : "Invalid working directory",
      detail: cwd,
      hint: "Provide an absolute path that can be created or already exists.",
    });
  }

  // 3. Check API key for non-local URLs
  const isLocal = isLocalUrl(baseUrl);
  if (!isLocal && !apiKey) {
    checks.push({
      code: "ollama_api_key_missing",
      level: "warn",
      message:
        "API key is not set for a non-local endpoint. Requests may fail if authentication is required.",
      hint: "Set the apiKey field in adapter config or the OLLAMA_API_KEY environment variable.",
    });
  } else if (apiKey) {
    const source = asString(config.apiKey, "") ? "adapter config" : "environment";
    checks.push({
      code: "ollama_api_key_present",
      level: "info",
      message: "API key is configured.",
      detail: `Detected in ${source}.`,
    });
  } else {
    checks.push({
      code: "ollama_local_no_key",
      level: "info",
      message: "Local endpoint — no API key required.",
    });
  }

  // 4. Connectivity ping
  const ping = await pingEndpoint(baseUrl, apiKey);
  if (!ping.ok) {
    const isLocalNotRunning =
      isLocal &&
      (ping.error?.includes("ECONNREFUSED") ||
        ping.error?.includes("fetch failed") ||
        ping.error?.includes("ENOTFOUND") ||
        ping.error?.includes("Connection refused"));

    checks.push({
      code: "ollama_connectivity_failed",
      level: isLocalNotRunning ? "warn" : "error",
      message: isLocalNotRunning
        ? `Cannot reach Ollama at ${baseUrl}. Is the service running?`
        : `Cannot reach endpoint at ${baseUrl}.`,
      detail: ping.error ?? (ping.status ? `HTTP ${ping.status}` : undefined),
      hint: isLocalNotRunning
        ? "Run `ollama serve` (or start LM Studio) and retry the probe."
        : "Verify the baseUrl and network access, then retry.",
    });
    return {
      adapterType: ctx.adapterType,
      status: summarizeStatus(checks),
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  checks.push({
    code: "ollama_connectivity_ok",
    level: "info",
    message: `Successfully reached ${baseUrl}.`,
  });

  // 5. List models and check configured model is available
  const availableModels = await listModels(baseUrl, apiKey);
  if (availableModels.length === 0) {
    checks.push({
      code: "ollama_no_models",
      level: "warn",
      message: "No models found at this endpoint.",
      hint: isLocal
        ? "Pull a model first, e.g. `ollama pull llama3.2`."
        : "Verify the endpoint returns models via /v1/models.",
    });
  } else {
    const modelIds = availableModels.map((m) => m.id);
    const modelAvailable = modelIds.some(
      (id) => id === model || id.startsWith(`${model}:`),
    );
    if (modelAvailable) {
      checks.push({
        code: "ollama_model_available",
        level: "info",
        message: `Model "${model}" is available.`,
        detail: `${availableModels.length} model(s) found.`,
      });
    } else {
      checks.push({
        code: "ollama_model_not_found",
        level: "warn",
        message: `Configured model "${model}" was not found at this endpoint.`,
        detail: `Available: ${modelIds.slice(0, 8).join(", ")}${modelIds.length > 8 ? ` (+${modelIds.length - 8} more)` : ""}`,
        hint: isLocal
          ? `Pull the model with \`ollama pull ${model}\`.`
          : "Update the model field to match one of the available models.",
      });
    }
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
