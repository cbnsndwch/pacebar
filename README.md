# PaceBar — Track all your AI coding subscriptions in one place

See your usage at a glance from your menu bar. No digging through dashboards.

> **Disclaimer:** PaceBar is an independent fork of [OpenUsage](https://github.com/robinebers/openusage) by Robin Ebers — not endorsed by or affiliated with the upstream project.

![PaceBar Screenshot](screenshot.png)

## Download

[**Download the latest release**](https://github.com/cbnsndwch/pacebar/releases/latest) (macOS — Apple Silicon & Intel; Windows — x64)

The app auto-updates. Install once and you're set.

## What It Does

PaceBar lives in your menu bar and shows you how much of your AI coding subscriptions you've used. Progress bars, badges, and clear labels. No mental math required.

- **One glance.** All your AI tools, one panel.
- **Always up-to-date.** Refreshes automatically on a schedule you pick.
- **Global shortcut.** Toggle the panel from anywhere with a customizable keyboard shortcut.
- **Lightweight.** Opens instantly, stays out of your way.
- **Plugin-based.** New providers get added without updating the whole app.
- **[Local HTTP API](docs/local-http-api.md).** Other apps can read your usage data from `127.0.0.1:6736`.
- **[Proxy support](docs/proxy.md).** Route provider HTTP requests through a SOCKS5 or HTTP proxy.

## Supported Providers

- [**Amp**](docs/providers/amp.md) / free tier, bonus, credits
- [**Antigravity**](docs/providers/antigravity.md) / all models
- [**Claude**](docs/providers/claude.md) / session, weekly, extra usage, local token usage (ccusage); multi-profile via [claude-code-profiles](https://github.com/quinnjr/claude-code-profiles)
- [**Codex**](docs/providers/codex.md) / session, weekly, reviews, credits
- [**Copilot**](docs/providers/copilot.md) / premium, chat, completions
- [**Cursor**](docs/providers/cursor.md) / credits, total usage, auto usage, API usage, on-demand, CLI auth
- [**Factory / Droid**](docs/providers/factory.md) / standard, premium tokens
- [**Gemini**](docs/providers/gemini.md) / pro, flash, workspace/free/paid tier
- [**JetBrains AI Assistant**](docs/providers/jetbrains-ai-assistant.md) / quota, remaining
- [**Kiro**](docs/providers/kiro.md) / credits, bonus credits, overages
- [**Kimi Code**](docs/providers/kimi.md) / session, weekly
- [**MiniMax**](docs/providers/minimax.md) / coding plan session
- [**OpenCode Go**](docs/providers/opencode-go.md) / 5h, weekly, monthly spend limits
- [**Windsurf**](docs/providers/windsurf.md) / prompt credits, flex credits
- [**Z.ai**](docs/providers/zai.md) / session, weekly, web searches

Community contributions welcome.

Want a provider that's not listed? [Open an issue.](https://github.com/cbnsndwch/pacebar/issues/new)

## Maintained By

PaceBar is maintained by [@cbnsndwch](https://github.com/cbnsndwch). The project is open source and community-driven — issues, pull requests, and new provider plugins are all welcome.

Plugins are currently bundled as the API stabilizes; they will become loadable from outside the app once that work lands.

<a href="https://www.star-history.com/?repos=cbnsndwch%2Fpacebar&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=cbnsndwch/pacebar&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=cbnsndwch/pacebar&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=cbnsndwch/pacebar&type=date&legend=top-left" />
 </picture>
</a>

### How to Contribute

- **Add a provider.** Each one is just a plugin. See the [Plugin API](docs/plugins/api.md).
- **Fix a bug.** PRs welcome. Provide before/after screenshots.
- **Request a feature.** [Open an issue](https://github.com/cbnsndwch/pacebar/issues/new) and make your case.

Keep it simple. No feature creep, test your changes.

## Credits

Inspired by [CodexBar](https://github.com/steipete/CodexBar) by [@steipete](https://github.com/steipete). Same idea, very different approach.

Originally based on [OpenUsage](https://github.com/robinebers/openusage) by Robin Ebers.

## License

[MIT](LICENSE)

---

<details>
<summary><strong>Build from source</strong></summary>

> **Warning**: The `main` branch may not be stable. It is merged directly without staging, so users are advised to use tagged versions for stable builds. Tagged versions are fully tested while `main` may contain unreleased features.

### Stack

Tauri v2 (Rust + React + TypeScript), Vite, Tailwind v4, Bun.

### Prerequisites

- **Both:** [Rust stable](https://rustup.rs) (1.88+), [Bun](https://bun.sh).
- **macOS:** Xcode Command Line Tools.
- **Windows:** "Desktop development with C++" workload from Visual Studio Build Tools (provides MSVC). [WebView2 runtime](https://developer.microsoft.com/microsoft-edge/webview2/) is preinstalled on Windows 11.

### Run locally

```sh
bun install
bun run tauri dev
```

### Build a release locally

```sh
bun run tauri build
```

Artifacts land under `src-tauri/target/release/bundle/` (`.dmg`/`.app` on macOS; `.msi` and NSIS `.exe` on Windows).

</details>
