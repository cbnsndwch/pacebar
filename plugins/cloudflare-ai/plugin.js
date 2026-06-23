(function () {
  const CONFIG_PATH = "~/cloudflare-ai/opencode.json";
  const USAGE_PATH = "/api/stats";

  const WINDOWS = { "1h": "last hour", "24h": "last 24h", "7d": "last 7 days" };

  function normalizeWindow(value) {
    const w = String(value || "").trim();
    return WINDOWS[w] ? w : "24h";
  }

  function getConfig(ctx) {
    const defaults = {
      display: "spent", // "spent" | "remaining" | "burn" | "percent"
      showLimit: false, // show "of $X" suffix?
      capOverride: null, // override gateway's cap_usd
      window: "24h", // token window: "1h" | "24h" | "7d"
    };
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json";
      if (ctx.host.fs.exists(configPath)) {
        const raw = ctx.host.fs.readText(configPath);
        const user = ctx.util.tryParseJson(raw) || {};
        return Object.assign({}, defaults, user);
      }
    } catch (e) {}
    return defaults;
  }

  function saveConfig(ctx, cfg) {
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json";
      ctx.host.fs.writeText(configPath, JSON.stringify(cfg, null, 2));
    } catch (e) {
      ctx.host.log.warn("Failed to save config: " + String(e));
    }
  }

  function getGatewayUrl(ctx) {
    let url = null;
    try {
      url = ctx.host.env.get("CF_GATEWAY_URL");
    } catch (e) {}
    if (url) {
      url = String(url).trim();
      if (url) return url.replace(/\/+$/, "");
    }

    // Check plugin config.json (set via Pacebar settings UI)
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json"
      if (ctx.host.fs.exists(configPath)) {
        const raw = ctx.host.fs.readText(configPath)
        const config = ctx.util.tryParseJson(raw)
        if (config && config.gatewayUrl) {
          const base = String(config.gatewayUrl).trim().replace(/\/+$/, "")
          if (base) return base
        }
      }
    } catch (e) {}

    // Try ~/.config/opencode/opencode.json first
    try {
      if (ctx.host.fs.exists("~/.config/opencode/opencode.json")) {
        const raw = ctx.host.fs.readText("~/.config/opencode/opencode.json")
        const config = ctx.util.tryParseJson(raw)
        if (config && config.provider && config.provider["cf-gateway"] &&
            config.provider["cf-gateway"].options && config.provider["cf-gateway"].options.baseURL) {
          let base = String(config.provider["cf-gateway"].options.baseURL).trim()
          base = base.replace(/\/+$/, "")
          if (base.endsWith("/v1")) base = base.slice(0, -3)
          if (base) return base
        }
      }
    } catch (e) {}

    // Fallback to ~/cloudflare-ai/opencode.json
    try {
      if (ctx.host.fs.exists(CONFIG_PATH)) {
        const raw = ctx.host.fs.readText(CONFIG_PATH);
        const config = ctx.util.tryParseJson(raw);
        if (
          config &&
          config.provider &&
          config.provider["cf-gateway"] &&
          config.provider["cf-gateway"].options &&
          config.provider["cf-gateway"].options.baseURL
        ) {
          let base = String(config.provider["cf-gateway"].options.baseURL).trim();
          base = base.replace(/\/+$/, "");
          if (base.endsWith("/v1")) base = base.slice(0, -3);
          if (base) return base;
        }
      }
    } catch (e) {}

    return null;
  }

  function resolveEnvPlaceholders(ctx, str) {
    // Handle opencode's {env:VARNAME} syntax
    if (str && typeof str === "string") {
      const m = str.match(/^\{env:(.+)}$/)
      if (m) {
        try { return String(ctx.host.env.get(m[1]) || "").trim() } catch (e) { return "" }
      }
    }
    return str
  }

  function readOpenCodeApiKey(ctx, configPath) {
    try {
      if (ctx.host.fs.exists(configPath)) {
        const raw = ctx.host.fs.readText(configPath)
        const config = ctx.util.tryParseJson(raw)
        if (config && config.provider && config.provider["cf-gateway"] &&
            config.provider["cf-gateway"].options && config.provider["cf-gateway"].options.apiKey) {
          const key = String(config.provider["cf-gateway"].options.apiKey).trim()
          return resolveEnvPlaceholders(ctx, key)
        }
      }
    } catch (e) {}
    return null
  }

  function getAuthToken(ctx) {
    let token = null;
    try {
      token = ctx.host.env.get("CF_ROUTER_KEY");
    } catch (e) {}
    if (token) return String(token).trim();

    token = readOpenCodeApiKey(ctx, "~/.config/opencode/opencode.json")
    if (token) return token

    token = readOpenCodeApiKey(ctx, "~/cloudflare-ai/opencode.json")
    if (token) return token

    try {
      const configPath = ctx.app.pluginDataDir + "/config.json";
      if (ctx.host.fs.exists(configPath)) {
        const raw = ctx.host.fs.readText(configPath);
        const config = ctx.util.tryParseJson(raw);
        if (config && config.routerKey) {
          return String(config.routerKey).trim();
        }
      }
    } catch (e) {}

    return null;
  }

  function fmtDollars(n) {
    if (n === null || n === undefined) return "$0.00";
    const val = Number(n);
    if (!Number.isFinite(val)) return "$0.00";
    return "$" + val.toFixed(2);
  }

  function fmtTokens(n) {
    if (n === null || n === undefined) return "0";
    const val = Number(n);
    if (!Number.isFinite(val)) return "0";
    if (val >= 1e9) return (val / 1e9).toFixed(1) + "B";
    if (val >= 1e6) return (val / 1e6).toFixed(1) + "M";
    if (val >= 1e3) return (val / 1e3).toFixed(1) + "K";
    return String(Math.round(val));
  }

  function ensureTemplateConfig(ctx) {
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json";
      if (!ctx.host.fs.exists(configPath)) {
        const template = {
          routerKey: "your-router-secret-here",
          gatewayUrl: "https://your-gateway.workers.dev",
          display: "spent",
          showLimit: false,
          capOverride: null,
          window: "24h",
        };
        ctx.host.fs.writeText(configPath, JSON.stringify(template, null, 2));
        ctx.host.log.info("Created template config: " + configPath);
      }
    } catch (e) {
      ctx.host.log.warn("Failed to create template config: " + String(e));
    }
  }

  globalThis.__pacebar_plugin = {
    id: "cloudflare-ai",
    probe: function (ctx) {
      const cfg = getConfig(ctx);
      const gatewayUrl = getGatewayUrl(ctx);
      const token = getAuthToken(ctx);

      if (!gatewayUrl) {
        ensureTemplateConfig(ctx);
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Needs Gateway",
              color: "#f59e0b",
            }),
            ctx.line.text({
              label: "Gateway URL",
              value: "Not configured",
              subtitle: "Requires self-hosted Worker with /api/stats",
            }),
          ],
        };
      }

      if (!token) {
        ensureTemplateConfig(ctx);
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Auth needed",
              color: "#f59e0b",
            }),
            ctx.line.text({
              label: "Router key",
              value: "Missing",
              subtitle: "Set CF_ROUTER_KEY or edit config",
            }),
          ],
        };
      }

      const window = normalizeWindow(cfg.window);
      const statsUrl = gatewayUrl + USAGE_PATH + "?window=" + window;
      let resp;
      try {
        resp = ctx.host.http.request({
          method: "GET",
          url: statsUrl,
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
          },
          timeoutMs: 10000,
        });
      } catch (e) {
        return {
          lines: [
            ctx.line.badge({ label: "Status", text: "Offline", color: "#ef4444" }),
            ctx.line.text({
              label: "Error",
              value: "Connection failed",
              subtitle: "Check gateway URL",
            }),
          ],
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          lines: [
            ctx.line.badge({ label: "Status", text: "Auth failed", color: "#ef4444" }),
            ctx.line.text({
              label: "Error",
              value: "Invalid key",
              subtitle: "Check CF_ROUTER_KEY",
            }),
          ],
        };
      }

      if (resp.status < 200 || resp.status >= 300) {
        return {
          lines: [
            ctx.line.badge({ label: "Status", text: "Error", color: "#ef4444" }),
            ctx.line.text({ label: "HTTP", value: String(resp.status) }),
          ],
        };
      }

      const data = ctx.util.tryParseJson(resp.bodyText);
      if (!data) {
        return {
          lines: [ctx.line.badge({ label: "Status", text: "Invalid data", color: "#ef4444" })],
        };
      }

      const lines = [];
      const cap = cfg.capOverride !== null ? Number(cfg.capOverride) : Number(data.cap_usd) || 0;
      const spent = Number(data.spent_usd) || 0;
      const remaining = cap - spent;
      const burn = Number(data.burn_per_day_usd) || 0;
      const pct = cap > 0 ? (spent / cap) * 100 : 0;
      const windowLabel = WINDOWS[window];
      const tin = Number(data.total_tokens_in) || 0;
      const tout = Number(data.total_tokens_out) || 0;
      const totalTokens = tin + tout;

      // Primary metric (drives the menu bar): windowed token count.
      // Capless count line -> rendered as a plain value row, not a progress bar.
      lines.push(
        ctx.line.progress({
          label: "Tokens",
          used: totalTokens,
          limit: 0,
          format: { kind: "count", suffix: "tokens" },
        }),
      );

      // Main display line (configurable)
      let mainLabel = "Spend";
      let mainValue = fmtDollars(spent);
      let mainSubtitle = null;

      if (cfg.display === "remaining") {
        mainLabel = "Remaining";
        mainValue = fmtDollars(remaining);
      } else if (cfg.display === "burn") {
        mainLabel = "Daily burn";
        mainValue = fmtDollars(burn) + "/day";
        mainSubtitle = "7-day average";
      } else if (cfg.display === "percent") {
        mainLabel = "Used";
        mainValue = pct.toFixed(1) + "%";
      }

      if (cfg.showLimit && cfg.display !== "burn") {
        mainValue += " of " + fmtDollars(cap);
      }

      lines.push(
        ctx.line.text({
          label: mainLabel,
          value: mainValue,
          subtitle: mainSubtitle,
        }),
      );

      // Details
      if (cfg.display !== "burn") {
        lines.push(
          ctx.line.text({
            label: "Daily burn",
            value: fmtDollars(burn) + "/day",
            subtitle: "7-day average",
          }),
        );
      }

      if (cfg.display !== "remaining") {
        lines.push(
          ctx.line.text({
            label: "Remaining",
            value: fmtDollars(remaining),
          }),
        );
      }

      if (data.hosted_only_ok === true) {
        lines.push(
          ctx.line.badge({
            label: "Models",
            text: "Hosted-only",
            color: "#22c55e",
          }),
        );
      } else if (data.hosted_only_ok === false) {
        lines.push(
          ctx.line.badge({
            label: "Models",
            text: "Mixed",
            color: "#ef4444",
          }),
        );
      }

      const reqs = Number(data.total_requests);
      if (Number.isFinite(reqs) && reqs > 0) {
        lines.push(
          ctx.line.text({
            label: "Requests",
            value: String(reqs) + " \u00b7 " + fmtTokens(totalTokens) + " tokens",
            subtitle: windowLabel,
          }),
        );
      }

      return { lines };
    },
  };
})();
