#!/usr/bin/env node
// Pulls GitHub release download stats and reports adoption per OS.
// Uses the `gh` CLI (must be authenticated) so no token handling is needed.
//
// Usage:
//   bun run release:stats                      # report for cbnsndwch/pacebar
//   bun run release:stats -- --repo owner/name # report for another repo
//   bun run release:stats -- --csv stats.csv   # also dump raw per-asset CSV
//
// What GitHub can and can't tell us:
//   - Counts are cumulative integers, non-unique (one person = many downloads),
//     with no time dimension. For trends, snapshot daily and diff.
//   - Fresh installs (.dmg/.exe/.msi) vs auto-updates (.app.tar.gz) are separate
//     assets on macOS, so we can split them there. On Windows the updater re-runs
//     the -setup.exe, so .exe = fresh + updates merged (not separable).
//   - latest.json = anonymous updater polls (every 15 min per running app), not
//     installs and not version-tagged.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

// --- args ---
const args = process.argv.slice(2);
let repo = "cbnsndwch/pacebar";
let csvPath = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--repo") repo = args[++i];
  else if (args[i] === "--csv") csvPath = args[++i];
  else fail(`unknown argument "${args[i]}"`);
}
if (!repo || !/^[^/]+\/[^/]+$/.test(repo)) {
  fail(`invalid --repo "${repo}", expected owner/name`);
}

// --- fetch (newest release first) ---
let releases;
try {
  const json = execFileSync("gh", ["api", "--paginate", `/repos/${repo}/releases`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  // --paginate concatenates JSON arrays as separate documents; merge them.
  releases = json
    .replace(/\]\s*\[/g, ",")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => JSON.parse(line));
} catch (err) {
  fail(`failed to fetch releases via gh: ${err.message}`);
}
if (releases.length === 0) fail(`no releases found for ${repo}`);

// --- classify an asset name into { os, arch, kind } ---
//   kind: install (fresh installer) | update (mac auto-update payload)
//       | manifest (latest.json) | sig | other
function classify(name) {
  const n = name.toLowerCase();
  const arch = /aarch64|arm64/.test(n) ? "arm64" : /x64|x86_64|amd64/.test(n) ? "x64" : "—";
  if (n.endsWith(".sig")) return { os: "—", arch, kind: "sig" };
  if (n === "latest.json") return { os: "cross-platform", arch: "—", kind: "manifest" };
  if (n.endsWith(".app.tar.gz")) return { os: "macOS", arch, kind: "update" };
  if (n.endsWith(".dmg")) return { os: "macOS", arch, kind: "install" };
  if (n.endsWith(".msi")) return { os: "Windows", arch, kind: "install" };
  if (n.endsWith(".exe")) return { os: "Windows", arch, kind: "install" };
  if (/\.(appimage|deb|rpm)$/.test(n)) return { os: "Linux", arch, kind: "install" };
  return { os: "other", arch, kind: "other" };
}

// --- aggregate ---
const installByOs = {}; // os -> fresh-install downloads
const macFreshByArch = {}; // arch -> .dmg downloads
const macUpdateByArch = {}; // arch -> .app.tar.gz downloads
const rows = []; // raw rows for optional CSV
let manifestTotal = 0;

for (const rel of releases) {
  for (const a of rel.assets ?? []) {
    const c = classify(a.name);
    rows.push({
      date: new Date(rel.published_at).toLocaleDateString("en-US"),
      tag: rel.tag_name,
      name: rel.name ?? rel.tag_name,
      asset: a.name,
      downloads: a.download_count,
      size: a.size,
    });
    if (c.kind === "install") {
      installByOs[c.os] = (installByOs[c.os] ?? 0) + a.download_count;
      if (c.os === "macOS")
        macFreshByArch[c.arch] = (macFreshByArch[c.arch] ?? 0) + a.download_count;
    } else if (c.kind === "update") {
      macUpdateByArch[c.arch] = (macUpdateByArch[c.arch] ?? 0) + a.download_count;
    } else if (c.kind === "manifest") {
      manifestTotal += a.download_count;
    }
  }
}

// --- report ---
const num = (n) => n.toLocaleString("en-US");
const mb = (b) => `${(b / 1_048_576).toFixed(1)} MB`;
const sum = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);
const archLine = (obj) =>
  Object.entries(obj)
    .filter(([k]) => k !== "—")
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${num(v)}`)
    .join(" · ");

const latest = releases[0];
console.log(`\nAdoption report — ${repo}`);
console.log(`Releases: ${releases.length}  ·  Latest: ${latest.tag_name}\n`);

console.log("Fresh installs by OS:");
const osOrder = ["Windows", "macOS", "Linux"];
const extra = Object.keys(installByOs).filter((k) => !osOrder.includes(k));
let installTotal = 0;
for (const os of [...osOrder, ...extra]) {
  const v = installByOs[os] ?? 0;
  installTotal += v;
  const detail = os === "macOS" ? `   (${archLine(macFreshByArch) || "none"})` : "";
  console.log(`  ${os.padEnd(10)} ${num(v).padStart(8)}${detail}`);
}
console.log(`  ${"TOTAL".padEnd(10)} ${num(installTotal).padStart(8)}\n`);

console.log("macOS — fresh vs auto-update (separate assets):");
console.log(`  fresh (.dmg)        ${num(sum(macFreshByArch)).padStart(8)}`);
console.log(
  `  update (.app.tar.gz)${num(sum(macUpdateByArch)).padStart(8)}   (${archLine(macUpdateByArch) || "none"})`,
);
console.log("Windows — .exe count = fresh installs + auto-updates combined (not separable).\n");

console.log(`Latest release (${latest.tag_name}) bundle sizes:`);
for (const a of (latest.assets ?? []).filter(
  (a) => !["sig", "manifest"].includes(classify(a.name).kind),
)) {
  console.log(`  ${a.name.padEnd(38)} ${mb(a.size).padStart(9)}`);
}

console.log(`\nUpdate activity (latest.json polls): ${num(manifestTotal)}`);
console.log(
  "Note: anonymous updater checks (every 15 min per running app), not installs and not version-tagged.",
);

// --- optional CSV ---
if (csvPath) {
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = ["Release Date,Tag,Name,Asset,Downloads,Size"];
  for (const r of rows) {
    lines.push(
      [r.date, r.tag, r.name, r.asset, r.downloads, r.size].map((v) => esc(String(v))).join(","),
    );
  }
  writeFileSync(csvPath, lines.join("\n") + "\n");
  console.log(`\nWrote ${rows.length} rows to ${csvPath}`);
}
