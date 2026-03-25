import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { testEnvironment } from "@paperclipai/adapter-ollama-local/server";

describe("ollama_local environment diagnostics", () => {
  it("fails with an error when baseUrl is not a valid URL", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: { baseUrl: "not-a-url" },
    });

    expect(result.status).toBe("fail");
    expect(result.checks.some((c) => c.code === "ollama_invalid_base_url")).toBe(true);
  });

  it("reports a valid http URL as valid", async () => {
    // We don't expect connectivity here — just URL validation
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: {
        // Use a port that should be refused quickly
        baseUrl: "http://127.0.0.1:19999",
      },
    });

    expect(result.checks.some((c) => c.code === "ollama_base_url_valid")).toBe(true);
    // Connectivity should fail but URL check should pass
    expect(result.checks.some((c) => c.code === "ollama_invalid_base_url")).toBe(false);
  });

  it("warns about missing API key for non-local URLs", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: {
        baseUrl: "https://cloud.example-ollama.com",
        // no apiKey
      },
    });

    expect(result.checks.some((c) => c.code === "ollama_api_key_missing")).toBe(true);
  });

  it("does not warn about missing API key for local URLs", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: {
        baseUrl: "http://localhost:19999",
        // no apiKey — should be fine for local
      },
    });

    expect(result.checks.some((c) => c.code === "ollama_api_key_missing")).toBe(false);
    expect(result.checks.some((c) => c.code === "ollama_local_no_key")).toBe(true);
  });

  it("creates a missing working directory", async () => {
    const cwd = path.join(
      os.tmpdir(),
      `paperclip-ollama-cwd-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      "workspace",
    );

    await fs.rm(path.dirname(cwd), { recursive: true, force: true });

    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: {
        baseUrl: "http://127.0.0.1:19999",
        cwd,
      },
    });

    expect(result.checks.some((c) => c.code === "ollama_cwd_valid")).toBe(true);
    const stats = await fs.stat(cwd);
    expect(stats.isDirectory()).toBe(true);
    await fs.rm(path.dirname(cwd), { recursive: true, force: true });
  });

  it("reports API key present when configured in adapter config", async () => {
    const result = await testEnvironment({
      companyId: "company-1",
      adapterType: "ollama_local",
      config: {
        baseUrl: "https://cloud.example-ollama.com",
        apiKey: "my-secret-key",
      },
    });

    expect(result.checks.some((c) => c.code === "ollama_api_key_present")).toBe(true);
    expect(result.checks.some((c) => c.code === "ollama_api_key_missing")).toBe(false);
  });
});
