(function () {
  const CONFIG_PATH = "~/cloudflare-ai/opencode.json";
  const USAGE_PATH = "/api/stats";

  function getGatewayUrl(ctx) {
    // Preference 1: explicit env override (broadly useful)
    let url = null;
    try {
      url = ctx.host.env.get("CF_GATEWAY_URL");
    } catch (e) {
      ctx.host.log.warn("env get failed: " + String(e));
    }

    if (url) {
      url = String(url).trim();
      if (url) return url.replace(/\/+$/, "");
    }

    // Preference 2: local opencode.json (your specific setup)
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
          // Remove trailing /v1 if present since we want the gateway root
          if (base.endsWith("/v1")) {
            base = base.slice(0, -3);
          }
          if (base) return base;
        }
      }
    } catch (e) {
      ctx.host.log.warn("opencode.json read failed: " + String(e));
    }

    return null;
  }

  function getAuthToken(ctx) {
    let token = null;
    try {
      token = ctx.host.env.get("CF_ROUTER_KEY");
    } catch (e) {
      ctx.host.log.warn("env get failed: " + String(e));
    }
    if (token) return String(token).trim();
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

  globalThis.__pacebar_plugin = {
    id: "cloudflare-ai",
    probe: function (ctx) {
      const gatewayUrl = getGatewayUrl(ctx);
      if (!gatewayUrl) {
        throw "Gateway URL not configured. Set CF_GATEWAY_URL or create ~/cloudflare-ai/opencode.json.";
      }

      const token = getAuthToken(ctx);
      if (!token) {
        throw "Auth key missing. Set CF_ROUTER_KEY environment variable.";
      }

      const statsUrl = gatewayUrl + USAGE_PATH;
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
        ctx.host.log.error("stats request failed: " + String(e));
        throw "Connection failed. Check your gateway and network.";
      }

      if (resp.status === 401 || resp.status === 403) {
        throw "Auth failed. Check your CF_ROUTER_KEY.";
      }

      if (resp.status < 200 || resp.status >= 300) {
        throw "Gateway error (HTTP " + resp.status + "). Try again later.";
      }

      const data = ctx.util.tryParseJson(resp.bodyText);
      if (!data) {
        throw "Invalid response from gateway.";
      }

      const lines = [];

      // Primary: spend progress
      const cap = Number(data.cap_usd) || 0;
      const spent = Number(data.spent_usd) || 0;
      if (cap > 0) {
        lines.push(
          ctx.line.progress({
            label: "Spend",
            used: spent,
            limit: cap,
            format: { kind: "dollars" },
          }),
        );
      }

      // Daily burn rate
      const burn = Number(data.burn_per_day_usd) || 0;
      lines.push(
        ctx.line.text({
          label: "Daily burn",
          value: fmtDollars(burn) + "/day",
          subtitle: "7-day average",
        }),
      );

      // Remaining
      const remaining = Number(data.remaining_usd);
      if (Number.isFinite(remaining)) {
        lines.push(
          ctx.line.text({
            label: "Remaining",
            value: fmtDollars(remaining),
          }),
        );
      }

      // Model hosting status
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

      // Request count
      const reqs = Number(data.total_requests);
      if (Number.isFinite(reqs) && reqs > 0) {
        const tin = Number(data.total_tokens_in) || 0;
        const tout = Number(data.total_tokens_out) || 0;
        lines.push(
          ctx.line.text({
            label: "Requests",
            value: String(reqs) + " · " + fmtTokens(tin + tout) + " tokens",
          }),
        );
      }

      return { lines };
    },
  };
})();
