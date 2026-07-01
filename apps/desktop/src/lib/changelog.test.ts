import { describe, expect, it } from "vitest";
import {
  findChangelogEntry,
  getChangelogEntries,
  normalizeVersion,
  parseChangelog,
} from "@/lib/changelog";

describe("normalizeVersion", () => {
  it("strips a leading v and trims", () => {
    expect(normalizeVersion("v1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("1.2.3")).toBe("1.2.3");
    expect(normalizeVersion("  v0.15.0  ")).toBe("0.15.0");
  });
});

describe("parseChangelog", () => {
  const sample = [
    "# Changelog",
    "",
    "## v0.15.0",
    "",
    "### Features",
    "- Opt-in telemetry",
    "",
    "---",
    "",
    "**Full Changelog**: [v0.14.1...v0.15.0](https://example.com)",
    "",
    "## v0.14.1",
    "",
    "### Bug Fixes",
    "- Fix a thing",
    "",
    "## 0.6.11",
    "",
    "- Older entry without a v prefix",
    "",
  ].join("\n");

  it("splits entries newest-first and captures bodies", () => {
    const entries = parseChangelog(sample);
    expect(entries.map((e) => e.version)).toEqual(["0.15.0", "0.14.1", "0.6.11"]);
    expect(entries[0].heading).toBe("v0.15.0");
    expect(entries[0].body).toContain("Opt-in telemetry");
    expect(entries[0].body).toContain("Full Changelog");
    expect(entries[1].body).toContain("Fix a thing");
  });

  it("does not treat the H1 or ### subheadings as version boundaries", () => {
    expect(parseChangelog(sample)).toHaveLength(3);
  });

  it("returns an empty array when there are no version headings", () => {
    expect(parseChangelog("# Changelog\n\nnothing here")).toEqual([]);
  });
});

describe("bundled CHANGELOG.md", () => {
  it("parses the real file into multiple entries", () => {
    const entries = getChangelogEntries();
    expect(entries.length).toBeGreaterThan(5);
  });

  it("includes the v0.15.0 entry mentioning telemetry", () => {
    const entry = findChangelogEntry("0.15.0");
    expect(entry).toBeDefined();
    expect(entry?.body.toLowerCase()).toContain("telemetry");
  });

  it("finds entries regardless of a v prefix", () => {
    expect(findChangelogEntry("v0.8.0")).toBeDefined();
    expect(findChangelogEntry("0.8.0")).toBeDefined();
  });

  it("falls back to the base version for prerelease builds", () => {
    expect(findChangelogEntry("0.15.0-rc.3")?.version).toBe("0.15.0");
    expect(findChangelogEntry("v0.15.0-rc.3")?.version).toBe("0.15.0");
  });
});
