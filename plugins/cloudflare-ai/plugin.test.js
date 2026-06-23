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

  it("returns a status line when gateway URL is not configured", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockReturnValue(null);
    ctx.host.fs.exists.mockReturnValue(false);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status).toBeTruthy();
    expect(status.text).toBe("Needs Gateway");
    expect(status.color).toBe("#f59e0b");
  });

  it("returns a status line when auth token is missing", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://cf-ai-gateway.flux-505.workers.dev";
      if (name === "CF_ROUTER_KEY") return null;
      return null;
    });
    ctx.host.fs.exists.mockReturnValue(false);
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status).toBeTruthy();
    expect(status.text).toBe("Auth needed");
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
        url: "https://my-gateway.example.com/api/stats?window=24h",
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
        url: "https://cf-ai-gateway.flux-505.workers.dev/api/stats?window=24h",
      }),
    );
  });

  it("reads auth token from ~/.config/opencode/opencode.json", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://cf-ai-gateway.flux-505.workers.dev"
      return null
    })
    ctx.host.fs.exists.mockImplementation((path) => {
      if (path.includes(".config/opencode/opencode.json")) return true
      return false
    })
    ctx.host.fs.readText.mockImplementation((path) => {
      if (path.includes(".config/opencode/opencode.json")) {
        return JSON.stringify({
          provider: {
            "cf-gateway": {
              options: {
                baseURL: "https://cf-ai-gateway.flux-505.workers.dev/v1",
                apiKey: "opencode-secret-key"
              }
            }
          }
        })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10, burn_per_day_usd: 1 }),
    })
    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer opencode-secret-key" }),
      })
    )
  })

  it("reads auth token from ~/cloudflare-ai/opencode.json", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://cf-ai-gateway.flux-505.workers.dev"
      return null
    })
    ctx.host.fs.exists.mockImplementation((path) => {
      if (path.includes("cloudflare-ai/opencode.json")) return true
      return false
    })
    ctx.host.fs.readText.mockImplementation((path) => {
      if (path.includes("cloudflare-ai/opencode.json")) {
        return JSON.stringify({
          provider: {
            "cf-gateway": {
              options: {
                baseURL: "https://cf-ai-gateway.flux-505.workers.dev/v1",
                apiKey: "cf-ai-secret-key"
              }
            }
          }
        })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10, burn_per_day_usd: 1 }),
    })
    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer cf-ai-secret-key" }),
      })
    )
  })

  it("resolves {env:...} placeholders in apiKey", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://cf-ai-gateway.flux-505.workers.dev"
      if (name === "MY_API_KEY") return "resolved-from-env"
      return null
    })
    ctx.host.fs.exists.mockImplementation((path) => {
      if (path.includes(".config/opencode/opencode.json")) return true
      return false
    })
    ctx.host.fs.readText.mockImplementation((path) => {
      if (path.includes(".config/opencode/opencode.json")) {
        return JSON.stringify({
          provider: {
            "cf-gateway": {
              options: {
                baseURL: "https://cf-ai-gateway.flux-505.workers.dev/v1",
                apiKey: "{env:MY_API_KEY}"
              }
            }
          }
        })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10, burn_per_day_usd: 1 }),
    })
    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer resolved-from-env" }),
      })
    )
  })

  it("reads gatewayUrl from plugin config.json", async () => {
    const ctx = makeCtx()
    ctx.host.env.get.mockReturnValue(null)
    ctx.host.fs.exists.mockImplementation((path) => path.endsWith("config.json"))
    ctx.host.fs.readText.mockImplementation((path) => {
      if (path.endsWith("config.json")) {
        return JSON.stringify({
          gatewayUrl: "https://configured-gateway.workers.dev",
          routerKey: "config-secret-key"
        })
      }
      return null
    })
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10, burn_per_day_usd: 1 }),
    })
    const plugin = await loadPlugin()
    plugin.probe(ctx)
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://configured-gateway.workers.dev/api/stats?window=24h",
        headers: expect.objectContaining({ Authorization: "Bearer config-secret-key" }),
      })
    )
  })

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
        url: "https://gateway.example.com/api/stats?window=24h",
      }),
    );
  });

  it("renders spend as a dollar text line by default", async () => {
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
    expect(spendLine.type).toBe("text");
    expect(spendLine.value).toBe("$1234.56");
  });

  it("reads gatewayUrl and routerKey from plugin config.json", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockReturnValue(null);
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({
        gatewayUrl: "https://configured-gateway.workers.dev",
        routerKey: "config-secret-key",
      }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10, burn_per_day_usd: 1 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://configured-gateway.workers.dev/api/stats?window=24h",
        headers: expect.objectContaining({ Authorization: "Bearer config-secret-key" }),
      }),
    );
  });

  it("applies the configured token window to the stats URL", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({ window: "7d" }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/api/stats?window=7d" }),
    );
  });

  it("falls back to the 24h window when the configured value is invalid", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({ window: "bogus" }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/api/stats?window=24h" }),
    );
  });

  it("emits a capless Tokens count line as the menu-bar primary", async () => {
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
        total_tokens_in: 1000000,
        total_tokens_out: 234567,
      }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const tokens = result.lines.find((l) => l.label === "Tokens");
    expect(tokens).toBeTruthy();
    expect(tokens.type).toBe("progress");
    expect(tokens.used).toBe(1234567);
    expect(tokens.limit).toBe(0);
    expect(tokens.format).toEqual({ kind: "count", suffix: "tokens" });
  });

  it("renders the remaining amount when display is 'remaining'", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({ display: "remaining" }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 50000, spent_usd: 1234.56, burn_per_day_usd: 42.5 }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const remainingLine = result.lines.find((l) => l.label === "Remaining");
    expect(remainingLine).toBeTruthy();
    expect(remainingLine.value).toBe("$48765.44");
  });

  it("appends the cap and honors capOverride when showLimit is set", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({ display: "spent", showLimit: true, capOverride: 1000 }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 50000, spent_usd: 250, burn_per_day_usd: 5 }),
    });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const spendLine = result.lines.find((l) => l.label === "Spend");
    expect(spendLine).toBeTruthy();
    expect(spendLine.value).toBe("$250.00 of $1000.00");
  });

  it("reads the router key from the config file when env is unset", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      return null;
    });
    ctx.host.fs.writeText(
      "/tmp/pacebar-test/plugin/config.json",
      JSON.stringify({ routerKey: "file-key" }),
    );
    ctx.host.http.request.mockReturnValue({
      status: 200,
      bodyText: JSON.stringify({ cap_usd: 100, spent_usd: 10 }),
    });
    const plugin = await loadPlugin();
    plugin.probe(ctx);
    expect(ctx.host.http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer file-key" }),
      }),
    );
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

  it("returns a status line on 401 auth error", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "bad-key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 401, bodyText: "" });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status.text).toBe("Auth failed");
    expect(status.color).toBe("#ef4444");
  });

  it("returns a status line on gateway error", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 500, bodyText: "Internal error" });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status.text).toBe("Error");
    const http = result.lines.find((l) => l.label === "HTTP");
    expect(http.value).toBe("500");
  });

  it("returns a status line on network failure", async () => {
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
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status.text).toBe("Offline");
  });

  it("returns a status line on invalid JSON response", async () => {
    const ctx = makeCtx();
    ctx.host.env.get.mockImplementation((name) => {
      if (name === "CF_GATEWAY_URL") return "https://example.com";
      if (name === "CF_ROUTER_KEY") return "key";
      return null;
    });
    ctx.host.http.request.mockReturnValue({ status: 200, bodyText: "not json" });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const status = result.lines.find((l) => l.label === "Status");
    expect(status.text).toBe("Invalid data");
  });
});
