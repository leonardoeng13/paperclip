import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  DraftNumberInput,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import { DEFAULT_MAX_TURNS } from "@paperclipai/adapter-ollama-local";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const baseUrlHint =
  'Ollama API endpoint. Use "http://localhost:11434" for local Ollama, ' +
  '"http://localhost:1234" for LM Studio, or your Ollama Cloud URL.';

const apiKeyHint =
  "API key for Ollama Cloud or other authenticated endpoints. Leave blank for local Ollama and LM Studio.";

const modelHint =
  "Model name to use, e.g. \"llama3.2\" or \"mistral\". Must be pulled in your Ollama installation.";

const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

const maxTurnsHint =
  "Maximum number of bash tool-call iterations Paperclip will allow per run. " +
  "This is an internal Paperclip limit — it is not imposed by Ollama or LM Studio. " +
  "Increase it for complex multi-step tasks; reduce it to cap resource usage.";

export function OllamaLocalConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  return (
    <>
      <Field label="Endpoint URL" hint={baseUrlHint}>
        <DraftInput
          value={
            isCreate
              ? values!.url ?? ""
              : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? "http://localhost:11434"))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ url: v })
              : mark("adapterConfig", "baseUrl", v || "http://localhost:11434")
          }
          immediate
          className={inputClass}
          placeholder="http://localhost:11434"
        />
      </Field>
      <Field label="API key" hint={apiKeyHint}>
        <div className="relative">
          <button
            type="button"
            aria-label={apiKeyVisible ? "Hide API key" : "Show API key"}
            onClick={() => setApiKeyVisible((v) => !v)}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            {apiKeyVisible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <DraftInput
            value={
              isCreate
                ? values!.args ?? ""
                : eff("adapterConfig", "apiKey", String(config.apiKey ?? ""))
            }
            onCommit={(v) =>
              isCreate
                ? set!({ args: v })
                : mark("adapterConfig", "apiKey", v || undefined)
            }
            immediate
            type={apiKeyVisible ? "text" : "password"}
            className={inputClass + " pl-8"}
            placeholder="Leave blank for local Ollama / LM Studio"
          />
        </div>
      </Field>
      <Field label="Model" hint={modelHint}>
        <DraftInput
          value={
            isCreate
              ? values!.model ?? ""
              : eff("adapterConfig", "model", String(config.model ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ model: v })
              : mark("adapterConfig", "model", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="llama3.2"
        />
      </Field>
      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}
      <Field label="Max turns per run" hint={maxTurnsHint}>
        {isCreate ? (
          <input
            type="number"
            className={inputClass}
            value={values!.maxTurnsPerRun ?? DEFAULT_MAX_TURNS}
            onChange={(e) => set!({ maxTurnsPerRun: Number(e.target.value) || DEFAULT_MAX_TURNS })}
          />
        ) : (
          <DraftNumberInput
            value={eff(
              "adapterConfig",
              "maxTurns",
              Number(config.maxTurns ?? DEFAULT_MAX_TURNS),
            )}
            onCommit={(v) => mark("adapterConfig", "maxTurns", v || DEFAULT_MAX_TURNS)}
            immediate
            className={inputClass}
          />
        )}
      </Field>
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  );
}
