---
name: release-stats
description: Use this skill when the user wants a download/adoption report for PaceBar releases — totals per operating system, per release, or a raw CSV of GitHub release download counts.
---

Pull live GitHub release download stats and report adoption per OS. Backed by `scripts/release-stats.mjs`, which fetches data via the authenticated `gh` CLI (no token needed).

Run from the repo root:

```
bun run release:stats                        # report for cbnsndwch/pacebar
bun run release:stats -- --repo owner/name   # another repo
bun run release:stats -- --csv stats.csv     # also dump raw per-asset CSV
```

The report shows:
- **Fresh installs by OS** — the real adoption number, with macOS arm64/x64 split. `.dmg`/`.exe`/`.msi` → installs; `.AppImage`/`.deb`/`.rpm` → Linux.
- **macOS fresh vs auto-update** — `.dmg` (fresh) and `.app.tar.gz` (auto-update) are separate assets, so they split cleanly. On Windows the updater re-runs `-setup.exe`, so `.exe` = fresh + updates merged (not separable).
- **Latest release bundle sizes** per asset.
- **Update activity** — `latest.json` poll count = anonymous updater checks (every 15 min per running app), NOT installs and not version-tagged.

When reporting to the user, lead with fresh installs per OS. Always call out that `latest.json` is updater polling, not adoption.

Limits to remember: GitHub counts are cumulative, non-unique, and have no time dimension — for trends you must snapshot daily and diff.

Requires `gh` to be authenticated (`gh auth status`). If it isn't, tell the user to run `gh auth login`.

For ad-hoc breakdowns (per-version, date ranges, charts) beyond what the script prints, run with `--csv` and analyze the CSV directly.
