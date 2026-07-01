import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared backing store so the test can inspect what the module persists.
const { storeData, invokeMock } = vi.hoisted(() => ({
  storeData: new Map<string, unknown>(),
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    async get(key: string) {
      return storeData.get(key);
    }
    async set(key: string, value: unknown) {
      storeData.set(key, value);
    }
    async save() {}
    async delete(key: string) {
      storeData.delete(key);
    }
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import {
  disableTelemetry,
  enableTelemetry,
  hasTelemetryBeenConfigured,
  loadLastSeenVersion,
  loadTelemetryNoticeAcknowledged,
  loadTelemetryOptIn,
  saveLastSeenVersion,
  saveTelemetryNoticeAcknowledged,
} from "@/lib/settings";

const ANON_ID_KEY = "telemetry.anonId";

describe("telemetry opt-in id lifecycle", () => {
  beforeEach(() => {
    storeData.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it("generates an id on first opt-in and pings", async () => {
    await enableTelemetry();
    const id = storeData.get(ANON_ID_KEY);
    expect(typeof id).toBe("string");
    expect((id as string).length).toBeGreaterThan(0);
    expect(await loadTelemetryOptIn()).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("telemetry_ping_now");
  });

  it("keeps the id on opt-out and reuses it on re-opt-in (no count inflation)", async () => {
    await enableTelemetry();
    const original = storeData.get(ANON_ID_KEY);

    await disableTelemetry();
    expect(await loadTelemetryOptIn()).toBe(false);
    // The id must survive opt-out — deleting it would mint a new one next time.
    expect(storeData.get(ANON_ID_KEY)).toBe(original);

    await enableTelemetry();
    // Same identity reused, not regenerated.
    expect(storeData.get(ANON_ID_KEY)).toBe(original);
  });
});

describe("what's-new + telemetry notice persistence", () => {
  beforeEach(() => {
    storeData.clear();
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it("round-trips the last seen version (null by default)", async () => {
    expect(await loadLastSeenVersion()).toBeNull();
    await saveLastSeenVersion("0.15.0");
    expect(await loadLastSeenVersion()).toBe("0.15.0");
  });

  it("round-trips the telemetry notice acknowledgement (false by default)", async () => {
    expect(await loadTelemetryNoticeAcknowledged()).toBe(false);
    await saveTelemetryNoticeAcknowledged();
    expect(await loadTelemetryNoticeAcknowledged()).toBe(true);
  });

  it("reports telemetry as configured only once an anon id exists", async () => {
    expect(await hasTelemetryBeenConfigured()).toBe(false);
    await enableTelemetry();
    expect(await hasTelemetryBeenConfigured()).toBe(true);
  });
});
