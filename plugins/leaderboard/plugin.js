// PaceBar — Hack Night Leaderboard Plugin
// Reads the local usage-api-cache.json, reports aggregate data to the
// Cloudflare Worker, and returns current standings as metric lines.

const PREFS_FILE = "leaderboard-prefs.json";
const CACHE_FILE = "usage-api-cache.json";

// ─── Prefs ───────────────────────────────────────────────────────────────────

function loadPrefs(ctx) {
  try {
    const raw = ctx.host.fs.readText(ctx.app.appDataDir + "/" + PREFS_FILE);
    return ctx.util.tryParseJson(raw) || {};
  } catch {
    return {};
  }
}

// ─── Cache reader ─────────────────────────────────────────────────────────────

function loadCache(ctx) {
  try {
    const raw = ctx.host.fs.readText(ctx.app.appDataDir + "/" + CACHE_FILE);
    const parsed = ctx.util.tryParseJson(raw);
    if (!parsed || !parsed.snapshots) return {};
    return parsed.snapshots;
  } catch {
    return {};
  }
}

// ─── Token extraction ─────────────────────────────────────────────────────────
// Lines from usage-api-cache.json look like:
//   { type: "text", label: "Today", value: "$5.84 · 15M tokens", ... }
//   { type: "progress", label: "Session", used: 57, limit: 100, ... }
//
// We extract tokens from "Today" text lines (format: "$X.XX · NNN[K|M] tokens")
// and dollars from the same line.

function parseTokensFromLine(line) {
  if (line.type !== "text") return null;
  const m = (line.value || "").match(/\$([\d.]+)\s*·\s*([\d.]+)\s*(K|M|B)?\s*tokens/i);
  if (!m) return null;
  const dollars = parseFloat(m[1]) || 0;
  const raw = parseFloat(m[2]) || 0;
  const mult = m[3] === "B" ? 1e9 : m[3] === "M" ? 1e6 : m[3] === "K" ? 1e3 : 1;
  return { dollars, tokens: Math.round(raw * mult) };
}

function extractProviderUsage(snapshot) {
  let tokens = 0;
  let dollars = 0;

  if (!snapshot || !Array.isArray(snapshot.lines)) return { tokens, dollars };

  for (const line of snapshot.lines) {
    // Prefer "Today" line for daily totals
    if (line.type === "text" && line.label === "Today") {
      const parsed = parseTokensFromLine(line);
      if (parsed) {
        tokens += parsed.tokens;
        dollars += parsed.dollars;
      }
    }
  }

  return { tokens, dollars };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function apiFetch(ctx, workerUrl, token, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["X-Invite-Token"] = token;
  return ctx.host.http.request({
    url: workerUrl.replace(/\/$/, "") + path,
    method: method,
    headers,
    bodyText: body ? JSON.stringify(body) : undefined,
    timeoutMs: 8000,
  });
}

// ─── Rank text ────────────────────────────────────────────────────────────────

function rankEmoji(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

function formatTokens(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

// ─── Main probe ───────────────────────────────────────────────────────────────

globalThis.__pacebar_plugin = {
  id: "leaderboard",

  probe(ctx) {
    const prefs = loadPrefs(ctx);

    // Not configured → guide the user
    if (!prefs.handle || !prefs.workerUrl) {
      return {
        plan: null,
        lines: [
          ctx.line.badge({
            label: "Setup needed",
            text: "Open Settings → Leaderboard",
            color: "#f59e0b",
          }),
        ],
      };
    }

    if (!prefs.optIn) {
      return {
        plan: null,
        lines: [
          ctx.line.text({ label: "Leaderboard", value: "Participation off" }),
          ctx.line.text({ label: "Tip", value: "Enable in Settings → Leaderboard" }),
        ],
      };
    }

    // ── Build provider payload from local cache ──
    const snapshots = loadCache(ctx);
    const shareList = Array.isArray(prefs.shareList) ? new Set(prefs.shareList) : null;

    const providers = [];
    let totalTokens = 0;
    let totalDollars = 0;

    for (const [id, snap] of Object.entries(snapshots)) {
      if (shareList && !shareList.has(id)) continue;
      const { tokens, dollars } = extractProviderUsage(snap);
      totalTokens += tokens;
      totalDollars += dollars;
      if (tokens > 0 || dollars > 0) {
        providers.push({
          id,
          displayName: snap.displayName || id,
          plan: snap.plan || null,
          tokensUsed: tokens,
          dollarsSpent: dollars,
        });
      }
    }

    // ── Report to CF Worker ──
    let reportOk = false;
    try {
      const resp = apiFetch(ctx, prefs.workerUrl, prefs.token, "POST", "/api/v1/report", {
        handle: prefs.handle,
        submittedAt: ctx.nowIso,
        providers,
      });
      reportOk = resp.status >= 200 && resp.status < 300;
    } catch (err) {
      ctx.host.log.warn("leaderboard: report failed: " + String(err));
    }

    // ── Fetch current hack night info ──
    let hacknightLabel = "Not in session";
    let hacknightId = null;
    try {
      const hnResp = apiFetch(
        ctx,
        prefs.workerUrl,
        prefs.token,
        "GET",
        "/api/v1/hacknight/current",
        null,
      );
      if (hnResp.status === 200) {
        const hnData = ctx.util.tryParseJson(hnResp.bodyText);
        if (hnData && hnData.active && hnData.hacknight) {
          const hn = hnData.hacknight;
          hacknightId = hn.number;
          const special = hn.is_special ? " · Special Edition 🏆" : "";
          hacknightLabel = `Hack Night #${hn.number}${special}`;
        } else if (hnData && !hnData.active && hnData.upcoming) {
          hacknightLabel = `Next: #${hnData.upcoming.number}`;
        }
      }
    } catch (err) {
      ctx.host.log.warn("leaderboard: hacknight fetch failed: " + String(err));
    }

    // ── Fetch leaderboard rankings ──
    let rankLine = "Reporting…";
    let topLine = null;
    let myRank = null;

    try {
      const window = hacknightId != null ? `hacknight&n=${hacknightId}` : "daily";
      const lbResp = apiFetch(
        ctx,
        prefs.workerUrl,
        prefs.token,
        "GET",
        `/api/v1/leaderboard?window=${window}&metric=tokens`,
        null,
      );
      if (lbResp.status === 200) {
        const lb = ctx.util.tryParseJson(lbResp.bodyText);
        if (lb && Array.isArray(lb.entries)) {
          const total = lb.entries.length;
          const mine = lb.entries.find((e) => e.handle === prefs.handle);
          if (mine) {
            myRank = mine.rank;
            rankLine = `${rankEmoji(mine.rank)} of ${total}  ·  ${formatTokens(mine.tokens_used)} tokens`;
          } else if (reportOk) {
            rankLine = `Submitted · ${formatTokens(totalTokens)} tokens`;
          }
          if (lb.entries[0] && lb.entries[0].handle !== prefs.handle) {
            topLine = `${lb.entries[0].handle}  ${formatTokens(lb.entries[0].tokens_used)}t`;
          }
        }
      }
    } catch (err) {
      ctx.host.log.warn("leaderboard: leaderboard fetch failed: " + String(err));
    }

    const now = new Date(ctx.nowIso);
    const lastReported = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const lines = [
      ctx.line.text({ label: "Hack Night", value: hacknightLabel }),
      ctx.line.text({ label: "Your Rank", value: rankLine }),
    ];

    if (topLine) {
      lines.push(ctx.line.text({ label: "Top Token Burner", value: topLine }));
    }

    lines.push(
      ctx.line.text({
        label: "Last Reported",
        value: reportOk ? lastReported : "⚠ " + lastReported,
        subtitle: reportOk ? null : "Report failed — check connection",
      }),
    );

    return { plan: myRank != null ? `#${myRank}` : null, lines };
  },
};
