import { describe, expect, it } from "vitest";
import { getHacknightUsage, type HacknightRow, type ModelUsageSnapshotRow } from "./db";

type D1Value = string | number | null;

class FakeD1 {
  constructor(private rows: ModelUsageSnapshotRow[]) {}

  prepare(sql: string) {
    const statement = sql.replace(/\s+/g, " ").trim();
    return {
      bind: (...params: D1Value[]) => ({
        all: async () => ({ results: this.query(statement, params) }),
        first: async () => this.query(statement, params)[0] ?? null,
        run: async () => ({ success: true }),
      }),
    };
  }

  private query(sql: string, params: D1Value[]): ModelUsageSnapshotRow[] {
    if (sql.includes("MAX(recorded_at)") && sql.includes("recorded_at <= ?")) {
      const cutoff = String(params[0]);
      return this.pick(
        this.rows.filter((r) => r.recorded_at <= cutoff),
        "max",
      );
    }

    if (
      sql.includes("MIN(recorded_at)") &&
      sql.includes("recorded_at >= ?") &&
      sql.includes("recorded_at < ?")
    ) {
      const [start, end] = [String(params[0]), String(params[1])];
      return this.pick(
        this.rows.filter((r) => r.recorded_at >= start && r.recorded_at < end),
        "min",
      );
    }

    if (
      sql.includes("MAX(recorded_at)") &&
      sql.includes("recorded_at >= ?") &&
      sql.includes("recorded_at < ?")
    ) {
      const [start, end] = [String(params[0]), String(params[1])];
      return this.pick(
        this.rows.filter((r) => r.recorded_at >= start && r.recorded_at < end),
        "max",
      );
    }

    return [];
  }

  private pick(rows: ModelUsageSnapshotRow[], mode: "min" | "max"): ModelUsageSnapshotRow[] {
    const groups = new Map<string, ModelUsageSnapshotRow>();
    for (const r of rows) {
      const key = `${r.handle}:${r.provider_id}:${r.model_id}`;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, r);
        continue;
      }
      if (mode === "max" && r.recorded_at > existing.recorded_at) groups.set(key, r);
      if (mode === "min" && r.recorded_at < existing.recorded_at) groups.set(key, r);
    }
    return Array.from(groups.values());
  }
}

function asD1(fake: FakeD1): Parameters<typeof getHacknightUsage>[0] {
  return fake as unknown as Parameters<typeof getHacknightUsage>[0];
}

const hacknight: HacknightRow = {
  id: 1,
  number: 7,
  title: "Hack Night #7",
  is_special: 0,
  starts_at: "2026-02-02T18:00:00.000Z",
  ends_at: "2026-02-02T22:00:00.000Z",
};

function modelRow(
  handle: string,
  providerId: string,
  modelId: string,
  recordedAt: string,
  total: number,
  extras: Partial<ModelUsageSnapshotRow> = {},
): ModelUsageSnapshotRow {
  return {
    id: 0,
    handle,
    provider_id: providerId,
    model_id: modelId,
    model_name: extras.model_name ?? modelId,
    recorded_at: recordedAt,
    tokens_in: extras.tokens_in ?? null,
    tokens_out: extras.tokens_out ?? null,
    tokens_total: total,
    dollars_spent: extras.dollars_spent ?? 0,
    raw_json: "{}",
    ...extras,
  };
}

describe("getHacknightUsage", () => {
  it("computes deltas from the pre-hacknight baseline", async () => {
    const fakeDb = new FakeD1([
      modelRow("alice", "claude", "sonnet", "2026-02-02T17:00:00.000Z", 100, {
        tokens_in: 60,
        tokens_out: 40,
      }),
      modelRow("alice", "codex", "total", "2026-02-02T17:00:00.000Z", 0, {
        dollars_spent: 1,
      }),
      modelRow("bob", "claude", "sonnet", "2026-02-02T17:00:00.000Z", 50, {
        tokens_in: 30,
        tokens_out: 20,
      }),

      modelRow("alice", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 550, {
        tokens_in: 400,
        tokens_out: 150,
      }),
      modelRow("alice", "codex", "total", "2026-02-02T19:30:00.000Z", 0, {
        dollars_spent: 3,
      }),
      modelRow("bob", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 400, {
        tokens_in: 250,
        tokens_out: 150,
      }),
    ]);

    const usage = await getHacknightUsage(asD1(fakeDb), hacknight);

    expect(usage.byHandle.alice.tokens_total).toBe(450);
    expect(usage.byHandle.bob.tokens_total).toBe(350);

    const claude = usage.byModel["claude:sonnet"];
    expect(claude.tokens_total).toBe(800);
    expect(claude.topHandle).toBe("alice");
    expect(claude.topTokens).toBe(450);
    expect(claude.users).toBe(2);

    expect(usage.byHandle.alice.providers_active).toBe(2);
    expect(usage.byHandle.bob.providers_active).toBe(1);
  });

  it("uses the first in-window snapshot as baseline when there is no pre-hacknight snapshot", async () => {
    const fakeDb = new FakeD1([
      modelRow("alice", "claude", "sonnet", "2026-02-02T18:10:00.000Z", 200, {
        tokens_in: 120,
        tokens_out: 80,
      }),
      modelRow("alice", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 500, {
        tokens_in: 300,
        tokens_out: 200,
      }),
    ]);

    const usage = await getHacknightUsage(asD1(fakeDb), hacknight);

    expect(usage.byHandle.alice.tokens_total).toBe(300);
    expect(usage.byHandle.alice.models["claude:sonnet"].tokens_in).toBe(180);
    expect(usage.byHandle.alice.models["claude:sonnet"].tokens_out).toBe(120);
  });

  it("clamps negative resets to zero", async () => {
    const fakeDb = new FakeD1([
      modelRow("alice", "claude", "sonnet", "2026-02-02T17:00:00.000Z", 1000),
      modelRow("alice", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 800),
    ]);

    const usage = await getHacknightUsage(asD1(fakeDb), hacknight);
    expect(usage.byHandle.alice.tokens_total).toBe(0);
    expect(usage.byModel["claude:sonnet"].users).toBe(0);
  });

  it("only counts active users per model", async () => {
    const fakeDb = new FakeD1([
      modelRow("alice", "claude", "sonnet", "2026-02-02T17:00:00.000Z", 100),
      modelRow("bob", "claude", "sonnet", "2026-02-02T17:00:00.000Z", 100),

      modelRow("alice", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 600),
      modelRow("bob", "claude", "sonnet", "2026-02-02T19:30:00.000Z", 100),
    ]);

    const usage = await getHacknightUsage(asD1(fakeDb), hacknight);
    expect(usage.byModel["claude:sonnet"].users).toBe(1);
    expect(usage.byModel["claude:sonnet"].topHandle).toBe("alice");
  });
});
