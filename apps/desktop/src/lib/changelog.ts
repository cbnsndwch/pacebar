// The repo-root CHANGELOG.md is the single source of truth for release history.
// It is bundled into the app at build time (via Vite's `?raw` import) so the
// changelog and What's New surfaces work offline with no GitHub API dependency.
import changelogMarkdown from "../../../../CHANGELOG.md?raw";

export interface ChangelogEntry {
  /** Version without a leading "v", e.g. "0.15.0". */
  version: string;
  /** Heading text as written in CHANGELOG.md, e.g. "v0.15.0". */
  heading: string;
  /** Markdown body between this version's heading and the next one. */
  body: string;
}

// Matches a version H2 like "## v0.15.0" or "## 0.6.11" (older entries drop the
// "v" prefix). Deliberately does not match the "# Changelog" H1 or "### Section"
// H3 subheadings.
const VERSION_HEADING = /^##[ \t]+(v?\d+\.\d+\.\d+[^\n]*)$/gm;

/** Strip a leading "v" and surrounding whitespace from a version string. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

/**
 * Parse a CHANGELOG.md string into entries, newest-first (source order).
 * Each entry's body is the markdown between its version heading and the next.
 */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const matches = [...markdown.matchAll(VERSION_HEADING)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const heading = match[1].trim();
    const version = normalizeVersion(heading).split(/\s/)[0];
    const start = (match.index ?? 0) + match[0].length;
    const end =
      i + 1 < matches.length ? (matches[i + 1].index ?? markdown.length) : markdown.length;
    const body = markdown.slice(start, end).trim();
    entries.push({ version, heading, body });
  }

  return entries;
}

let cachedEntries: ChangelogEntry[] | null = null;

/** All changelog entries from the bundled CHANGELOG.md, newest-first. */
export function getChangelogEntries(): ChangelogEntry[] {
  if (cachedEntries === null) {
    cachedEntries = parseChangelog(changelogMarkdown);
  }
  return cachedEntries;
}

/**
 * Find the changelog entry for a specific version (v-prefix insensitive). Falls
 * back to the base version so prerelease builds (e.g. "0.15.0-rc.3") still
 * surface the release notes for their base version ("0.15.0").
 */
export function findChangelogEntry(version: string): ChangelogEntry | undefined {
  const target = normalizeVersion(version);
  const entries = getChangelogEntries();
  const exact = entries.find((entry) => entry.version === target);
  if (exact) return exact;
  const base = target.split("-")[0];
  return base === target ? undefined : entries.find((entry) => entry.version === base);
}
