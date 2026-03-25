export const type = "ollama_local";
export const label = "Ollama";
export const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "llama3.2";
export const DEFAULT_MAX_TURNS = 20;

export const models = [
  { id: "llama3.2", label: "Llama 3.2 (3B)" },
  { id: "llama3.2:1b", label: "Llama 3.2 (1B)" },
  { id: "llama3.1", label: "Llama 3.1 (8B)" },
  { id: "llama3.1:70b", label: "Llama 3.1 (70B)" },
  { id: "codellama", label: "Code Llama" },
  { id: "deepseek-coder-v2", label: "DeepSeek Coder V2" },
  { id: "qwen2.5-coder", label: "Qwen2.5 Coder" },
  { id: "mistral", label: "Mistral 7B" },
  { id: "mixtral", label: "Mixtral 8x7B" },
  { id: "phi4", label: "Phi-4" },
  { id: "gemma3", label: "Gemma 3" },
  { id: "gemma3:27b", label: "Gemma 3 (27B)" },
  { id: "qwen3", label: "Qwen3" },
  { id: "devstral", label: "Devstral" },
];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

This adapter connects to an Ollama instance (local or cloud) or LM Studio via the
OpenAI-compatible API and runs an agent loop that can execute shell commands.

Core fields:
- baseUrl (string, optional): API base URL. Defaults to "${DEFAULT_OLLAMA_BASE_URL}" for local
  Ollama. Set to your Ollama cloud URL or "http://localhost:1234" for LM Studio.
- apiKey (string, optional): API key for Ollama Cloud or other authenticated endpoints.
  Not required for local Ollama or LM Studio.
- model (string, optional): Model to use (e.g. "llama3.2", "codellama", "qwen2.5-coder").
  Defaults to "${DEFAULT_OLLAMA_MODEL}".
- cwd (string, optional): Working directory for command execution.
- instructionsFilePath (string, optional): Absolute path to a markdown instructions file
  prepended to the system prompt at runtime.
- systemPrompt (string, optional): Custom system prompt override.
- maxTurns (number, optional): Maximum number of tool-use iterations per run.
  Defaults to ${DEFAULT_MAX_TURNS}.

Operational fields:
- timeoutSec (number, optional): Run timeout in seconds. 0 = no timeout.
- graceSec (number, optional): Grace period in seconds after timeout.
- env (object, optional): KEY=VALUE environment variables injected into bash tool executions.

Notes:
- For local Ollama: install Ollama (https://ollama.com) and run \`ollama serve\`.
  No API key required.
- For Ollama Cloud: set baseUrl to your cloud endpoint and provide an apiKey.
- For LM Studio: start LM Studio's local server and set baseUrl to
  "http://localhost:1234". No API key required.
- The adapter uses the OpenAI-compatible chat completions API (/v1/chat/completions).
- Tool use (bash command execution) requires a model that supports function calling.
- The adapter dynamically fetches available models from /v1/models at the configured
  endpoint.
`;
