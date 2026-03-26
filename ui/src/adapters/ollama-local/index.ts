import type { UIAdapterModule } from "../types";
import { parseOllamaStdoutLine } from "@paperclipai/adapter-ollama-local/ui";
import { OllamaLocalConfigFields } from "./config-fields";
import { buildOllamaLocalConfig, buildOllamaCloudConfig, buildLmStudioConfig } from "@paperclipai/adapter-ollama-local/ui";

export const ollamaLocalUIAdapter: UIAdapterModule = {
  type: "ollama_local",
  label: "Ollama Local",
  parseStdoutLine: parseOllamaStdoutLine,
  ConfigFields: OllamaLocalConfigFields,
  buildAdapterConfig: buildOllamaLocalConfig,
};

export const ollamaCloudUIAdapter: UIAdapterModule = {
  type: "ollama_cloud",
  label: "Ollama Cloud",
  parseStdoutLine: parseOllamaStdoutLine,
  ConfigFields: OllamaLocalConfigFields,
  buildAdapterConfig: buildOllamaCloudConfig,
};

export const lmStudioUIAdapter: UIAdapterModule = {
  type: "lm_studio",
  label: "LM Studio",
  parseStdoutLine: parseOllamaStdoutLine,
  ConfigFields: OllamaLocalConfigFields,
  buildAdapterConfig: buildLmStudioConfig,
};
