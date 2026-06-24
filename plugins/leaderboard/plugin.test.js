import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "../test-helpers.js";

const loadPlugin = async () => {
  await import("./plugin.js");
  return globalThis.__pacebar_plugin;
};

const makeCache = (providers) => ({ snapshots: providers });

const prefsPath = "/tmp/pacebar-test/leaderboard-prefs.json";
const cachePath = "/tmp/pacebar-test/usage-api-cache.json";

function seedFiles(ctx, prefs, cache) {
  ctx.host.fs.writeText(prefsPath, JSON.stringify(prefs));
  if (cache) ctx.host.fs.writeText(cachePath, JSON.stringify(cache));
}

function httpMock(defaults = {}) {
  return vi.fn((opts) => {
    const url = String(opts.url);
    if (url.includes("/api/v1/report")) {
      return defaults.report ?? { status: 200, bodyText: '{"ok":true}' };
    }
    if (url.includes("/api/v1/hacknight/current")) {
      return defaults.current ?? { status: 200, bodyText: '{"active":false}' };
    }
    if (url.includes("/api/v1/leaderboard")) {
      return defaults.leaderboard ?? { status: 200, bodyText: '{"entries":[]}' };
    }
    return { status: 404, bodyText: "{}" };
  });
}

describe("leaderboard plugin", () => {
  beforeEach(() => {
    delete globalThis.__pacebar_plugin;
    if (vi.resetModules) vi.resetModules();
  });

  it("prompts for setup when not configured", async () => {
    const ctx = makeCtx();
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    const badge = result.lines.find((l) => l.type === "badge");
    expect(badge?.label).toBe("Setup needed");
  });

  it("shows participation off when opted out", async () => {
    const ctx = makeCtx();
    seedFiles(ctx, { handle: "alice", workerUrl: "https://w.test", optIn: false });
    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Leaderboard")?.value).toBe("Participation off");
  });

  it("reports aggregate provider usage and shows rank", async () => {
    const ctx = makeCtx();
    seedFiles(
      ctx,
      { handle: "alice", workerUrl: "https://w.test", token: "tok", optIn: true },
      makeCache({
        claude: {
          displayName: "Claude",
          lines: [{ type: "text", label: "Today", value: "$1.25 · 15K tokens" }],
        },
      }),
    );

    ctx.host.http.request = httpMock({
      current: {
        status: 200,
        bodyText: JSON.stringify({ active: true, hacknight: { number: 7, is_special: false } }),
      },
      leaderboard: {
        status: 200,
        bodyText: JSON.stringify({
          entries: [
            { rank: 1, handle: "bob", tokens_used: 30000 },
            { rank: 2, handle: "alice", tokens_used: 15000 },
          ],
        }),
      },
    });

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);

    const reportCall = ctx.host.http.request.mock.calls.find(([opts]) =>
      String(opts.url).includes("/api/v1/report"),
    );
    expect(reportCall).toBeTruthy();
    expect(JSON.parse(reportCall[0].bodyText).handle).toBe("alice");

    const rankLine = result.lines.find((l) => l.label === "Your Rank");
    expect(rankLine?.value).toContain("of 2");
    expect(rankLine?.value).toContain("15.0K");
    expect(result.lines.find((l) => l.label === "Top Token Burner")?.value).toContain("bob");
  });

  it("sends per-model snapshots when available", async () => {
    const ctx = makeCtx();
    seedFiles(
      ctx,
      { handle: "alice", workerUrl: "https://w.test", token: "tok", optIn: true },
      makeCache({
        claude: {
          displayName: "Claude",
          lines: [{ type: "text", label: "Today", value: "$1.25 · 15K tokens" }],
          modelUsage: {
            sonnet: {
              modelName: "Sonnet",
              tokensIn: 100,
              tokensOut: 50,
              dollarsSpent: 1.25,
            },
          },
        },
      }),
    );

    ctx.host.http.request = httpMock();
    const plugin = await loadPlugin();
    plugin.probe(ctx);

    const reportCall = ctx.host.http.request.mock.calls.find(([opts]) =>
      String(opts.url).includes("/api/v1/report"),
    );
    const body = JSON.parse(reportCall[0].bodyText);
    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      providerId: "claude",
      modelId: "sonnet",
      modelName: "Sonnet",
      tokensIn: 100,
      tokensOut: 50,
      dollarsSpent: 1.25,
    });
  });

  it("falls back to a total model when no modelUsage is provided", async () => {
    const ctx = makeCtx();
    seedFiles(
      ctx,
      { handle: "alice", workerUrl: "https://w.test", token: "tok", optIn: true },
      makeCache({
        claude: {
          displayName: "Claude",
          lines: [{ type: "text", label: "Today", value: "$2.00 · 10K tokens" }],
        },
      }),
    );

    ctx.host.http.request = httpMock();
    const plugin = await loadPlugin();
    plugin.probe(ctx);

    const reportCall = ctx.host.http.request.mock.calls.find(([opts]) =>
      String(opts.url).includes("/api/v1/report"),
    );
    const body = JSON.parse(reportCall[0].bodyText);
    expect(body.models).toHaveLength(1);
    expect(body.models[0]).toMatchObject({
      providerId: "claude",
      modelId: "total",
      tokensTotal: 10000,
      dollarsSpent: 2,
    });
  });

  it("skips the leaderboard provider entry", async () => {
    const ctx = makeCtx();
    seedFiles(
      ctx,
      { handle: "alice", workerUrl: "https://w.test", token: "tok", optIn: true },
      makeCache({
        leaderboard: {
          displayName: "Leaderboard",
          lines: [{ type: "text", label: "Today", value: "$5.00 · 50K tokens" }],
        },
      }),
    );

    ctx.host.http.request = httpMock();
    const plugin = await loadPlugin();
    plugin.probe(ctx);

    const reportCall = ctx.host.http.request.mock.calls.find(([opts]) =>
      String(opts.url).includes("/api/v1/report"),
    );
    const body = JSON.parse(reportCall[0].bodyText);
    expect(body.providers).toHaveLength(0);
  });

  it("shows a submitted line when the leaderboard has no entry for the user", async () => {
    const ctx = makeCtx();
    seedFiles(
      ctx,
      { handle: "alice", workerUrl: "https://w.test", token: "tok", optIn: true },
      makeCache({
        claude: {
          displayName: "Claude",
          lines: [{ type: "text", label: "Today", value: "$1.00 · 5K tokens" }],
        },
      }),
    );

    ctx.host.http.request = httpMock({
      leaderboard: {
        status: 200,
        bodyText: JSON.stringify({ entries: [{ rank: 1, handle: "bob", tokens_used: 9000 }] }),
      },
    });

    const plugin = await loadPlugin();
    const result = plugin.probe(ctx);
    expect(result.lines.find((l) => l.label === "Your Rank")?.value).toContain("Submitted");
    expect(result.lines.find((l) => l.label === "Your Rank")?.value).toContain("5.0K");
  });
});
