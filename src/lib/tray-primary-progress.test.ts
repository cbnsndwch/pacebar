import { describe, expect, it } from "vitest";

import { formatTrayCountText, getTrayPrimaryBars } from "@/lib/tray-primary-progress";

describe("formatTrayCountText", () => {
  it("abbreviates by magnitude", () => {
    expect(formatTrayCountText(0)).toBe("0");
    expect(formatTrayCountText(950)).toBe("950");
    expect(formatTrayCountText(12300)).toBe("12.3K");
    expect(formatTrayCountText(1234567)).toBe("1.2M");
    expect(formatTrayCountText(3_400_000_000)).toBe("3.4B");
  });

  it("handles non-finite input", () => {
    expect(formatTrayCountText(Number.NaN)).toBe("0");
    expect(formatTrayCountText(Number.POSITIVE_INFINITY)).toBe("0");
  });
});

describe("getTrayPrimaryBars", () => {
  it("returns empty when settings missing", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [],
      pluginSettings: null,
      pluginStates: {},
    });
    expect(bars).toEqual([]);
  });

  it("keeps plugin order, filters disabled, limits to 4", () => {
    const pluginsMeta = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      name: id.toUpperCase(),
      iconUrl: "",
      primaryCandidates: ["Usage"],
      lines: [],
      supportsAvatar: false,
    }));

    const bars = getTrayPrimaryBars({
      pluginsMeta,
      pluginSettings: { order: ["a", "b", "c", "d", "e"], disabled: ["c"] },
      pluginStates: {},
    });

    expect(bars.map((b) => b.id)).toEqual(["a", "b", "d", "e"]);
  });

  it("can target a specific plugin id for tray rendering", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Session"],
          lines: [],
          supportsAvatar: false,
        },
        {
          id: "b",
          name: "B",
          iconUrl: "",
          primaryCandidates: ["Session"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a", "b"], disabled: [] },
      pluginStates: {
        b: {
          data: {
            providerId: "b",
            displayName: "B",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Session",
                used: 25,
                limit: 100,
                format: { kind: "percent" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
      pluginId: "b",
    });

    expect(bars).toEqual([{ id: "b", fraction: 0.75 }]);
  });

  it("includes plugins with primary candidates even when no data (fraction undefined)", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Session"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: { a: { data: null, loading: false, error: null } },
    });
    expect(bars).toEqual([{ id: "a", fraction: undefined }]);
  });

  it("computes fraction from matching progress label and clamps 0..1", () => {
    const bars = getTrayPrimaryBars({
      displayMode: "used",
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Plan usage"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {
        a: {
          data: {
            providerId: "a",
            displayName: "A",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Plan usage",
                used: 150,
                limit: 100,
                format: { kind: "dollars" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });

    expect(bars).toEqual([{ id: "a", fraction: 1 }]);
  });

  it("does not compute fraction when limit is 0", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Plan usage"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {
        a: {
          data: {
            providerId: "a",
            displayName: "A",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Plan usage",
                used: 10,
                limit: 0,
                format: { kind: "percent" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });
    expect(bars).toEqual([{ id: "a", fraction: undefined }]);
  });

  it("respects displayMode=left", () => {
    const bars = getTrayPrimaryBars({
      displayMode: "left",
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Session"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {
        a: {
          data: {
            providerId: "a",
            displayName: "A",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Session",
                used: 25,
                limit: 100,
                format: { kind: "percent" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });
    expect(bars).toEqual([{ id: "a", fraction: 0.75 }]);
  });

  it("picks first available candidate from primaryCandidates", () => {
    const bars = getTrayPrimaryBars({
      displayMode: "used",
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Credits", "Plan usage"], // Credits first, Plan usage fallback
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {
        a: {
          data: {
            providerId: "a",
            displayName: "A",
            iconUrl: "",
            lines: [
              // Only Plan usage available, Credits missing
              {
                type: "progress",
                label: "Plan usage",
                used: 50,
                limit: 100,
                format: { kind: "dollars" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });
    expect(bars).toEqual([{ id: "a", fraction: 0.5 }]);
  });

  it("uses first candidate when both are available", () => {
    const bars = getTrayPrimaryBars({
      displayMode: "used",
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: ["Credits", "Plan usage"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {
        a: {
          data: {
            providerId: "a",
            displayName: "A",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Credits",
                used: 20,
                limit: 100,
                format: { kind: "dollars" },
              },
              {
                type: "progress",
                label: "Plan usage",
                used: 80,
                limit: 100,
                format: { kind: "dollars" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });
    // Should use Credits (20/100 = 0.2), not Plan usage (80/100 = 0.8)
    expect(bars).toEqual([{ id: "a", fraction: 0.2 }]);
  });

  it("skips plugins with empty primaryCandidates", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [
        {
          id: "a",
          name: "A",
          iconUrl: "",
          primaryCandidates: [],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["a"], disabled: [] },
      pluginStates: {},
    });
    expect(bars).toEqual([]);
  });

  it("derives abbreviated text (no fraction) for a capless count primary", () => {
    const bars = getTrayPrimaryBars({
      pluginsMeta: [
        {
          id: "cf",
          name: "Cloudflare",
          iconUrl: "",
          primaryCandidates: ["Tokens"],
          lines: [],
          supportsAvatar: false,
        },
      ],
      pluginSettings: { order: ["cf"], disabled: [] },
      pluginStates: {
        cf: {
          data: {
            providerId: "cf",
            displayName: "Cloudflare",
            iconUrl: "",
            lines: [
              {
                type: "progress",
                label: "Tokens",
                used: 1234567,
                limit: 0,
                format: { kind: "count", suffix: "tokens" },
              },
            ],
          },
          loading: false,
          error: null,
        },
      },
    });
    expect(bars).toEqual([{ id: "cf", fraction: undefined, text: "1.2M" }]);
  });
});
