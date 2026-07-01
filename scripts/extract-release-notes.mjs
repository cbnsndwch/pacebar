#!/usr/bin/env node
// Extract a single version's section from CHANGELOG.md to use as a GitHub
// Release body, so the in-app "Release Notes" viewer (which reads the release
// body by tag) and the public release page match CHANGELOG.md exactly.
//
// Usage: node scripts/extract-release-notes.mjs <tag|version>   e.g. v0.15.0
import { readFileSync } from "node:fs";

const arg = process.argv[2] ?? process.env.RELEASE_TAG ?? "";
const version = arg.replace(/^v/i, "").trim();

if (!version) {
  console.error("Usage: extract-release-notes.mjs <version>  (e.g. v0.15.0)");
  process.exit(1);
}

const md = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const lines = md.split(/\r?\n/);
// Matches a version H2 like "## v0.15.0" or "## 0.6.11".
const heading = /^##\s+v?(\d+\.\d+\.\d+)/;

let start = -1;
let end = lines.length;
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(heading);
  if (!match) continue;
  if (start === -1 && match[1] === version) {
    start = i;
  } else if (start !== -1) {
    end = i;
    break;
  }
}

let body =
  start === -1
    ? ""
    : lines
        .slice(start + 1, end)
        .join("\n")
        .trim();

if (!body) {
  const repo = process.env.GITHUB_REPOSITORY ?? "cbnsndwch/pacebar";
  body = `Release ${version}. See the [changelog](https://github.com/${repo}/blob/v${version}/CHANGELOG.md).`;
}

process.stdout.write(`${body}\n`);
