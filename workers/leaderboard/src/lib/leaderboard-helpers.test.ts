import { describe, expect, it } from "vitest";

import {
  buildModelEntries,
  buildSnapshotModels,
  buildUserEntries,
  delta,
  modelKey,
} from "./leaderboard-helpers";

const aliceClaude = {
  provider_id: "claude",
  model_id: "total",
  model_name: "Claude",
  tokens_total: 550,
  tokens_in: 400,
  tokens_out: 150,
  dollars_spent: 4.25,
};

const bobClaude = {
  provider_id: "claude",
  model_id: "total",
  model_name: "Claude",
  tokens_total: 375,
  tokens_in: 250,
  tokens_out: 125,
  dollars_spent: 2.9,
};

describe("modelKey", () => {
  it("joins provider and model with a colon", () => {
    expect(modelKey("claude", "sonnet")).toBe("claude:sonnet");
  });
});

describe("delta", () => {
  it("returns the positive difference", () => {
    expect(delta(700, 150)).toBe(550);
  });

  it("clamps negative resets to zero", () => {
    expect(delta(100, 250)).toBe(0);
  });
});

describe("buildSnapshotModels", () => {
  it("normalizes a provided models array", () => {
    const result = buildSnapshotModels(
      [
        {
          providerId: "claude",
          modelId: "sonnet",
          tokensIn: 100,
          tokensOut: 50,
          dollarsSpent: 1.25,
        },
      ],
      [{ id: "claude", displayName: "Claude", tokensUsed: 150, dollarsSpent: 1.25 }],
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerId: "claude",
      modelId: "sonnet",
      tokensIn: 100,
      tokensOut: 50,
      tokensTotal: 150,
      dollarsSpent: 1.25,
    });
  });

  it("falls back to one aggregate model per provider", () => {
    const result = buildSnapshotModels(undefined, [
      { id: "claude", displayName: "Claude", tokensUsed: 100, dollarsSpent: 1 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      providerId: "claude",
      modelId: "total",
      tokensTotal: 100,
      dollarsSpent: 1,
    });
  });

  it("ignores garbage entries", () => {
    const result = buildSnapshotModels([null, { nope: true }], []);
    expect(result).toHaveLength(0);
  });
});

describe("buildUserEntries", () => {
  const usage = {
    byHandle: {
      bob: {
        handle: "bob",
        tokens_total: 100,
        dollars_spent: 1,
        providers_active: 1,
        score: 10,
        models: { "claude:total": bobClaude },
        tokens_in: 50,
        tokens_out: 50,
      },
      alice: {
        handle: "alice",
        tokens_total: 200,
        dollars_spent: 2,
        providers_active: 1,
        score: 20,
        models: { "claude:total": aliceClaude },
        tokens_in: 150,
        tokens_out: 50,
      },
    },
    byModel: {},
  };

  it("ranks users by tokens descending", () => {
    const entries = buildUserEntries(usage, "tokens");
    expect(entries.map((e) => e.handle)).toEqual(["alice", "bob"]);
    expect(entries[0].rank).toBe(1);
    expect(entries[1].rank).toBe(2);
  });

  it("ranks users by dollars when requested", () => {
    const entries = buildUserEntries(usage, "dollars");
    expect(entries.map((e) => e.handle)).toEqual(["alice", "bob"]);
  });
});

describe("buildModelEntries", () => {
  const usage = {
    byHandle: {},
    byModel: {
      "claude:total": {
        modelKey: "claude:total",
        provider_id: "claude",
        model_id: "total",
        model_name: "Claude",
        tokens_total: 550,
        dollars_spent: 4.25,
        users: 2,
        topHandle: "alice",
        topTokens: 550,
      },
      "codex:total": {
        modelKey: "codex:total",
        provider_id: "codex",
        model_id: "total",
        model_name: "Codex",
        tokens_total: 100,
        dollars_spent: 1,
        users: 1,
        topHandle: "alice",
        topTokens: 100,
      },
    },
  };

  it("ranks models by tokens", () => {
    const entries = buildModelEntries(usage, "tokens");
    expect(entries.map((e) => e.model_key)).toEqual(["claude:total", "codex:total"]);
  });

  it("ranks models by dollars when requested", () => {
    const entries = buildModelEntries(usage, "dollars");
    expect(entries.map((e) => e.model_key)).toEqual(["claude:total", "codex:total"]);
  });
});
