#!/usr/bin/env node
// Sets the app version across every source-of-truth file in one shot.
// Usage: bun run version:bump -- <x.y.z>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const version = process.argv[2];
if (!version) {
  fail("missing version argument. Usage: bun run version:bump -- <x.y.z>");
}
if (!VERSION_RE.test(version)) {
  fail(`invalid version "${version}", expected x.y.z`);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

// Each target: the file + the regex locating the version, capturing it in group 1.
// Order is documentation only; all are required and must match exactly once.
const targets = [
  {
    file: "apps/desktop/package.json",
    regex: /("version":\s*")(\d+\.\d+\.\d+)(")/,
  },
  {
    file: "apps/desktop/src-tauri/Cargo.toml",
    regex: /(^version = ")(\d+\.\d+\.\d+)(")/m,
  },
  {
    file: "apps/desktop/src-tauri/tauri.conf.json",
    regex: /("version":\s*")(\d+\.\d+\.\d+)(")/,
  },
  {
    file: "apps/desktop/src-tauri/Cargo.lock",
    regex: /(name = "pacebar"\nversion = ")(\d+\.\d+\.\d+)(")/,
  },
  {
    file: "workers/leaderboard/package.json",
    regex: /("version":\s*")(\d+\.\d+\.\d+)(")/,
  },
  {
    file: "workers/updates/package.json",
    regex: /("version":\s*")(\d+\.\d+\.\d+)(")/,
  },
];

const updated = [];
for (const { file, regex } of targets) {
  const abs = path.join(repoRoot, file);
  const source = readFileSync(abs, "utf8");
  const match = source.match(regex);
  if (!match) {
    fail(`could not find version in ${file}`);
  }
  const old = match[2];
  writeFileSync(abs, source.replace(regex, `$1${version}$3`));
  updated.push({ file, old });
}

console.log(`Set version to ${version}`);
for (const { file, old } of updated) {
  console.log(`- ${file} (${old} -> ${version})`);
}
