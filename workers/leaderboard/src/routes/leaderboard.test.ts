import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleLeaderboard } from "./leaderboard";
import {
  getHacknightByNumber,
  getHacknightUsage,
  getLeaderboard,
  hasHacknightWinners,
  recordHacknightWinner,
} from "../lib/db";

vi.mock("../lib/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/db")>();
  return {
    ...original,
    getHacknightByNumber: vi.fn(),
    getHacknightUsage: vi.fn(),
    getLeaderboard: vi.fn(),
    hasHacknightWinners: vi.fn(),
    recordHacknightWinner: vi.fn(),
  };
});

type D1Value = string | number | null;

class FakeD1 {
  constructor(private reports: Array<Record<string, D1Value>> = []) {}

  prepare(sql: string) {
    const statement = sql.replace(/\s+/g, " ").trim();
    return {
      bind: (...params: D1Value[]) => ({
        all: async () => ({ results: this.query(statement, params) }),
        first: async () => this.query(statement, params)[0] ?? null,
        run: async () => ({ success: true }),
      }),
      all: async () => ({ results: this.query(statement, []) }),
      first: async () => this.query(statement, [])[0] ?? null,
      run: async () => ({ success: true }),
    };
  }

  private query(sql: string): Record<string, D1Value>[] {
    if (sql.includes("FROM reports") && sql.includes("h.number")) {
      return this.reports.map((r) => ({ number: r.number }));
    }
    return [];
  }
}

const mockedGetHacknightByNumber = vi.mocked(getHacknightByNumber);
const mockedGetHacknightUsage = vi.mocked(getHacknightUsage);
const mockedGetLeaderboard = vi.mocked(getLeaderboard);
const mockedHasHacknightWinners = vi.mocked(hasHacknightWinners);
const mockedRecordHacknightWinner = vi.mocked(recordHacknightWinner);

describe("handleLeaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetLeaderboard.mockResolvedValue([]);
    mockedGetHacknightByNumber.mockResolvedValue(null);
    mockedGetHacknightUsage.mockResolvedValue({ byHandle: {}, byModel: {} });
    mockedHasHacknightWinners.mockResolvedValue(false);
  });

  it("returns a daily leaderboard from reports", async () => {
    mockedGetLeaderboard.mockResolvedValue([
      {
        rank: 1,
        handle: "alice",
        tokens_used: 1000,
        dollars_spent: 1,
        providers_active: 1,
        score: 100,
      },
    ]);

    const res = await handleLeaderboard(
      new Request("https://worker.test/api/v1/leaderboard?window=daily"),
      new FakeD1() as never,
    );
    const body = await res.json();

    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].handle).toBe("alice");
    expect(mockedGetLeaderboard).toHaveBeenCalled();
  });

  it("looks up the latest hack night by published number, not by report id", async () => {
    const fakeDb = new FakeD1([
      { hacknight_id: 1, number: 7, submitted_at: "2026-02-02T19:00:00.000Z" },
    ]);

    mockedGetHacknightByNumber.mockImplementation(async (_db, number) => {
      if (number === 7) {
        return {
          id: 7,
          number: 7,
          title: "Hack Night #7",
          is_special: 0,
          starts_at: "2026-02-02T18:00:00.000Z",
          ends_at: "2026-02-02T22:00:00.000Z",
        };
      }
      return null;
    });

    mockedGetHacknightUsage.mockResolvedValue({
      byHandle: {
        alice: {
          handle: "alice",
          tokens_total: 500,
          tokens_in: 300,
          tokens_out: 200,
          dollars_spent: 0,
          providers_active: 1,
          score: 0.0005,
          models: {},
        },
      },
      byModel: {},
    });

    const res = await handleLeaderboard(
      new Request("https://worker.test/api/v1/leaderboard?window=hacknight"),
      fakeDb as never,
    );
    const body = await res.json();

    expect(mockedGetHacknightByNumber).toHaveBeenCalledWith(expect.anything(), 7);
    expect(body.windowKey).toBe("hn-7");
    expect(body.entries[0].handle).toBe("alice");
  });

  it("archives overall winners when a hack night has ended and has usage", async () => {
    mockedGetHacknightByNumber.mockResolvedValue({
      id: 1,
      number: 5,
      title: "Hack Night #5",
      is_special: 0,
      starts_at: "2026-02-01T18:00:00.000Z",
      ends_at: "2026-02-01T22:00:00.000Z",
    });

    mockedGetHacknightUsage.mockResolvedValue({
      byHandle: {
        alice: {
          handle: "alice",
          tokens_total: 1000,
          tokens_in: null,
          tokens_out: null,
          dollars_spent: 5,
          providers_active: 2,
          score: 500.001,
          models: {},
        },
      },
      byModel: {},
    });

    await handleLeaderboard(
      new Request("https://worker.test/api/v1/leaderboard?window=hacknight&n=5"),
      new FakeD1() as never,
    );

    expect(mockedRecordHacknightWinner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "overall", metric: "tokens", handle: "alice" }),
    );
    expect(mockedRecordHacknightWinner).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ category: "overall", metric: "dollars", handle: "alice" }),
    );
  });
});
