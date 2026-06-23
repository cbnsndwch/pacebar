import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "../test-helpers.js";

const loadPlugin = async () => {
  await import("./plugin.js");
  return globalThis.__pacebar_plugin;
};

describe("cloudflare-ai plugin", () => {
  beforeEach(() => {
    delete globalThis.__pacebar_plugin;
    vi.resetModules();
  });

  it("throws when gateway URL is not configured", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockReturnValue(null);
    ctx.host.fs.exists.mockReturnValue(false);
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Gateway URL not configured");
  });

  it("throws when auth token is missing", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://cf-ai-gateway.flux-505.workers.dev";
      if (name === "CF_ROUTER_KEY") return null;
      return null;
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Auth key missing");
  });

  it("uses env var for gateway URL", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://my-gateway.example.com";
      if (name === "CF_ROUTER_KEY") return "secret-key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 25, burn_per_day_usd: 5 }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://my-gateway.example.com/api/stats",
        headers: expect.objectContaining({ Authorization: "Bearer secret-key" }),
      }),
    );
    expect(result.lines.find((l) => l.label === "Spend")).toBeTruthy();
  });

  it("falls back to opencode.json for gateway URL", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_ROUTER_KEY") return "secret-key";
      return null;
    });
    ctx.host.fs.exists.mockImplementation((path) => path.includes("opencode.json"));
    ctx.host.fs.readText.mockReturnValue(
      JSON.stringify({
        provider: {
          "cf-gateway": {
            options: { baseURL: "https://cf-ai-gateway.flux-505.workers.dev/v1" },
          },
        },
      }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 50000, spent_usd: 1234.56, burn_per_day_usd: 42.5 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://cf-ai-gateway.flux-505.workers.dev/api/stats",
      }),
    );
  });

  it("strips trailing /v1 from opencode.json baseURL", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_ROUTER_KEY") return "secret-key";
      return null;
    });
    ctx.host.fs.exists.mockImplementation((path) => path.includes("opencode.json"));
    ctx.host.fs.readText.mockReturnValue(
      JSON.stringify({
        provider: {
          "cf-gateway": {
            options: { baseURL: "https://gateway.example.com/v1" },
          },
        },
      }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://gateway.example.com/api/stats",
      }),
    );
  });

  it("renders spend progress correctly", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        cap_usd: 50000,
        spent_usd: 1234.56,
        remaining_usd: 48765.44,
        burn_per_day_usd: 42.5,
        total_requests: 1500,
        total_tokens_in: 5000000,
        total_tokens_out: 2000000,
        hosted_only_ok: true,
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const spendLine = result.lines.find((l) => l.label === "Spend");
    expect(spendLine).toBeTruthy();
    expect(spendLine.used).toBe(1234.56);
    expect(spendLine.limit).toBe(50000);
    expect(spendLine.format).toEqual({ kind: "dollars" });
  });

  it("renders hosted-only badge when true", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        cap_usd: 100,
        spent_usd: 10,
        burn_per_day_usd: 1,
        hosted_only_ok: true,
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const badge = result.lines.find((l) => l.label === "Models");
    expect(badge).toBeTruthy();
    expect(badge.text).toBe("Hosted-only");
    expect(badge.color).toBe("#22c55e");
  });

  it("renders mixed badge when not hosted-only", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        cap_usd: 100,
        spent_usd: 10,
        burn_per_day_usd: 1,
        hosted_only_ok: false,
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const badge = result.lines.find((l) => l.label === "Models");
    expect(badge).toBeTruthy();
    expect(badge.text).toBe("Mixed");
    expect(badge.color).toBe("#ef4444");
  });

  it("renders request count with tokens", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({
        cap_usd: 100,
        spent_usd: 10,
        burn_per_day_usd: 1,
        total_requests: 1500,
        total_tokens_in: 5000000,
        total_tokens_out: 2000000,
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const reqLine = result.lines.find((l) => l.label === "Requests");
    expect(reqLine).toBeTruthy();
    expect(reqLine.value).toBe("1500 · 7.0M tokens");
  });

  it("throws on 401 auth error", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "bad-key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Auth failed");
  });

  it("throws on gateway error", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "Internal error" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Gateway error");
  });

  it("throws on network failure", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockImplementation(() => {
      throw new Error("connection refused");
    });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Connection failed");
  });

  it("throws on invalid JSON response", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not json" });
    const plugin = await loadPlugin();
    expect(() => plugin.probe(ctx)).toThrow("Invalid response");
  });
});
