(function() {
  const CONFIG_PATH = "~/cloudflare-ai/opencode.json"
  const USAGE_PATH = "/api/stats"

  function getGatewayUrl(ctx) {
    // Preference 1: explicit env
    let url = null
    try {
      url = ctx.host.env.get("CF_GATEWAY_URL")
    } catch (e) {}
    if (url) {
      url = String(url).trim()
      if (url) return url.replace(/\/+$/, "")
    }

    // Preference 2: local opencode.json
    try {
      if (ctx.host.fs.exists(CONFIG_PATH)) {
        const raw = ctx.host.fs.readText(CONFIG_PATH)
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

    return null
  }

  function getAuthToken(ctx) {
    // Preference 1: env var
    let token = null
    try {
      token = ctx.host.env.get("CF_ROUTER_KEY")
    } catch (e) {}
    if (token) return String(token).trim()

    // Preference 2: plugin data dir config
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json"
      if (ctx.host.fs.exists(configPath)) {
        const raw = ctx.host.fs.readText(configPath)
        const config = ctx.util.tryParseJson(raw)
        if (config && config.routerKey) {
          return String(config.routerKey).trim()
        }
      }
    } catch (e) {}

    return null
  }

  function fmtDollars(n) {
    if (n === null || n === undefined) return "$0.00"
    const val = Number(n)
    if (!Number.isFinite(val)) return "$0.00"
    return "$" + val.toFixed(2)
  }

  function fmtTokens(n) {
    if (n === null || n === undefined) return "0"
    const val = Number(n)
    if (!Number.isFinite(val)) return "0"
    if (val >= 1e9) return (val / 1e9).toFixed(1) + "B"
    if (val >= 1e6) return (val / 1e6).toFixed(1) + "M"
    if (val >= 1e3) return (val / 1e3).toFixed(1) + "K"
    return String(Math.round(val))
  }

  function ensureTemplateConfig(ctx) {
    try {
      const configPath = ctx.app.pluginDataDir + "/config.json"
      if (!ctx.host.fs.exists(configPath)) {
        const template = JSON.stringify({
          routerKey: "your-router-secret-here",
          gatewayUrl: "https://your-gateway.workers.dev"
        }, null, 2)
        ctx.host.fs.writeText(configPath, template)
        ctx.host.log.info("Created template config: " + configPath)
      }
    } catch (e) {
      ctx.host.log.warn("Failed to create template config: " + String(e))
    }
  }

  globalThis.__pacebar_plugin = {
    id: "cloudflare-ai",
    probe: function(ctx) {
      const gatewayUrl = getGatewayUrl(ctx)
      const token = getAuthToken(ctx)

      // Show setup UI if not configured
      if (!gatewayUrl) {
        ensureTemplateConfig(ctx)
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Needs Gateway",
              color: "#f59e0b"
            }),
            ctx.line.text({
              label: "Gateway URL",
              value: "Not configured",
              subtitle: "Requires self-hosted Worker with /api/stats"
            }),
            ctx.line.text({
              label: "Setup",
              value: "Set CF_GATEWAY_URL or edit config file"
            }),
            ctx.line.text({
              label: "See docs",
              value: "docs/providers/cloudflare-ai.md"
            })
          ]
        }
      }

      if (!token) {
        ensureTemplateConfig(ctx)
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Auth needed",
              color: "#f59e0b"
            }),
            ctx.line.text({
              label: "Router key",
              value: "Missing",
              subtitle: "Set CF_ROUTER_KEY env or edit config file"
            }),
            ctx.line.text({
              label: "Config file",
              value: ctx.app.pluginDataDir.replace(/^.*\//, ".../") + "/config.json"
            })
          ]
        }
      }

      const statsUrl = gatewayUrl + USAGE_PATH
      let resp
      try {
        resp = ctx.host.http.request({
          method: "GET",
          url: statsUrl,
          headers: {
            "Authorization": "Bearer " + token,
            "Accept": "application/json"
          },
          timeoutMs: 10000
        })
      } catch (e) {
        ctx.host.log.error("stats request failed: " + String(e))
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Offline",
              color: "#ef4444"
            }),
            ctx.line.text({
              label: "Error",
              value: "Connection failed",
              subtitle: "Check gateway URL and network"
            })
          ]
        }
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Auth failed",
              color: "#ef4444"
            }),
            ctx.line.text({
              label: "Error",
              value: "Invalid router key",
              subtitle: "Check CF_ROUTER_KEY or config file"
            })
          ]
        }
      }

      if (resp.status < 200 || resp.status >= 300) {
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Error",
              color: "#ef4444"
            }),
            ctx.line.text({
              label: "HTTP",
              value: String(resp.status),
              subtitle: "Gateway returned error"
            })
          ]
        }
      }

      const data = ctx.util.tryParseJson(resp.bodyText)
      if (!data) {
        return {
          lines: [
            ctx.line.badge({
              label: "Status",
              text: "Invalid data",
              color: "#ef4444"
            })
          ]
        }
      }

      const lines = []

      // Primary: spend progress
      const cap = Number(data.cap_usd) || 0
      const spent = Number(data.spent_usd) || 0
      if (cap > 0) {
        lines.push(ctx.line.progress({
          label: "Spend",
          used: spent,
          limit: cap,
          format: { kind: "dollars" }
        }))
      }

      // Daily burn rate
      const burn = Number(data.burn_per_day_usd) || 0
      lines.push(ctx.line.text({
        label: "Daily burn",
        value: fmtDollars(burn) + "/day",
        subtitle: "7-day average"
      }))

      // Remaining
      const remaining = Number(data.remaining_usd)
      if (Number.isFinite(remaining)) {
        lines.push(ctx.line.text({
          label: "Remaining",
          value: fmtDollars(remaining)
        }))
      }

      // Model hosting status
      if (data.hosted_only_ok === true) {
        lines.push(ctx.line.badge({
          label: "Models",
          text: "Hosted-only",
          color: "#22c55e"
        }))
      } else if (data.hosted_only_ok === false) {
        lines.push(ctx.line.badge({
          label: "Models",
          text: "Mixed",
          color: "#ef4444"
        }))
      }

      // Request count
      const reqs = Number(data.total_requests)
      if (Number.isFinite(reqs) && reqs > 0) {
        const tin = Number(data.total_tokens_in) || 0
        const tout = Number(data.total_tokens_out) || 0
        lines.push(ctx.line.text({
          label: "Requests",
          value: String(reqs) + " \u00b7 " + fmtTokens(tin + tout) + " tokens"
        }))
      }

      return { lines }
    }
  }
})()