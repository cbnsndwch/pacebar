// One-shot migration: repo /docs/*.md -> workers/docs/content/docs/**/*.mdx
// - Derives frontmatter title from the first `# H1` (then strips that H1).
// - Adds a curated `description` (used for search + SEO).
// - Rewrites internal `*.md` links (by basename) to docs routes.
//
// Run from workers/docs/:  bun scripts/migrate-docs.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const srcDir = join(repoRoot, "docs");
const outDir = resolve(import.meta.dirname, "../content/docs");

// source (relative to /docs) -> { dest (relative to content/docs), description }
const MAP = {
  "local-http-api.md": {
    dest: "features/local-http-api.mdx",
    description:
      "Read-only HTTP API on 127.0.0.1:6736 so other local apps can read your usage data.",
  },
  "proxy.md": {
    dest: "features/proxy.mdx",
    description: "Route provider and plugin HTTP requests through a SOCKS5 or HTTP proxy.",
  },
  "plugins/api.md": {
    dest: "plugins/api.mdx",
    description: "Host API reference for plugin probes (ctx.host.*).",
  },
  "plugins/schema.md": {
    dest: "plugins/schema.mdx",
    description: "Plugin structure, plugin.json manifest, output schema, and lifecycle.",
  },
  "app-state-architecture.md": {
    dest: "contributing/app-state-architecture.mdx",
    description: "How the front-end app state stores and derived values fit together.",
  },
  "capture-logs.md": {
    dest: "contributing/capture-logs.mdx",
    description: "How to capture logs for bug reports.",
  },
  "windows-store-distribution.md": {
    dest: "contributing/windows-store-distribution.mdx",
    description: "Notes on distributing PaceBar through the Windows ecosystem.",
  },
  "fork-branding.md": {
    dest: "contributing/fork-branding.mdx",
    description: "The OpenUsage -> PaceBar rebrand: identifiers, bundle ID, namespaces.",
  },
};

// Providers — one-liners adapted from the README.
const PROVIDERS = {
  amp: "Amp — free tier, bonus, credits.",
  antigravity: "Antigravity — usage across all models.",
  claude: "Claude Code — session, weekly, extra usage, local ccusage token usage; multi-profile.",
  "cloudflare-ai": "Cloudflare AI Gateway — self-hosted metering, spend, daily burn.",
  codex: "Codex — session, weekly, reviews, credits.",
  copilot: "GitHub Copilot — premium, chat, completions.",
  cursor: "Cursor — credits, total/auto/API usage, on-demand, CLI auth.",
  factory: "Factory / Droid — standard and premium tokens.",
  gemini: "Gemini — pro, flash, workspace/free/paid tier.",
  "jetbrains-ai-assistant": "JetBrains AI Assistant — quota, remaining.",
  kimi: "Kimi Code — session, weekly.",
  kiro: "Kiro — credits, bonus credits, overages.",
  minimax: "MiniMax — coding plan session.",
  "opencode-go": "OpenCode Go — 5h, weekly, monthly spend limits.",
  perplexity: "Perplexity — local cache-based auth.",
  synthetic: "Synthetic — usage tracking.",
  windsurf: "Windsurf — prompt credits, flex credits.",
  zai: "Z.ai — session, weekly, web searches.",
};
for (const [id, description] of Object.entries(PROVIDERS)) {
  MAP[`providers/${id}.md`] = { dest: `providers/${id}.mdx`, description };
}

// basename (without .md) -> docs route, for link rewriting.
const routeByBasename = {};
for (const [src, { dest }] of Object.entries(MAP)) {
  const base = src.split("/").pop().replace(/\.md$/, "");
  routeByBasename[base] = "/docs/" + dest.replace(/\.mdx$/, "");
}

function escapeFrontmatter(s) {
  return s.replace(/"/g, '\\"');
}

function convert(srcRel, { dest, description }) {
  const raw = readFileSync(join(srcDir, srcRel), "utf8");
  const lines = raw.split("\n");

  // Pull title from first `# H1`, strip it.
  let title = dest
    .split("/")
    .pop()
    .replace(/\.mdx$/, "");
  const h1Idx = lines.findIndex((l) => /^#\s+/.test(l));
  if (h1Idx !== -1) {
    title = lines[h1Idx].replace(/^#\s+/, "").trim();
    lines.splice(h1Idx, 1);
    if (lines[h1Idx] === "") lines.splice(h1Idx, 1); // drop the blank line after H1
  }

  let body = lines.join("\n").trimStart();

  // Rewrite internal *.md links by basename: ](./api.md#x) -> ](/docs/plugins/api#x)
  body = body.replace(/\]\(([^)]+?\.md)(#[^)]*)?\)/g, (m, target, anchor) => {
    const base = target.split("/").pop().replace(/\.md$/, "");
    const route = routeByBasename[base];
    return route ? `](${route}${anchor || ""})` : m;
  });

  const front = `---\ntitle: "${escapeFrontmatter(title)}"\ndescription: "${escapeFrontmatter(description)}"\n---\n\n`;
  const outPath = join(outDir, dest);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, front + body);
  return dest;
}

let n = 0;
for (const [src, cfg] of Object.entries(MAP)) {
  try {
    convert(src, cfg);
    n++;
  } catch (e) {
    console.error(`FAILED ${src}: ${e.message}`);
  }
}
console.log(`Migrated ${n}/${Object.keys(MAP).length} docs into ${outDir}`);
