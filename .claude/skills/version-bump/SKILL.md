---
name: version-bump
description: Use this skill when cutting a release — bumping or setting the PaceBar app version across all source-of-truth files (package.json, Cargo, tauri.conf, worker).
---

The app version lives in 5 files. Keep them in sync with one command — never hand-edit.

Run from the repo root:

```
bun run version:bump -- <x.y.z>
```

(e.g. `bun run version:bump -- 0.10.0`)

It sets the version in:
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.lock` (the `pacebar` package entry)
- `workers/leaderboard/package.json` (the leaderboard worker tracks the app version)

The script fails loud if any file's version can't be found, so a partial bump can't slip through. It only validates `x.y.z` format — it does not compute the next version for you, so pass the exact target.

Not this skill: `bun run ccusage:bump` bumps the bundled ccusage **dependency** pin (`host_api.rs` + docs), which is unrelated to the app release version.

After bumping:
- Sanity-check the diff: `git diff -- package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json src-tauri/Cargo.lock workers/leaderboard/package.json`
- Commit (e.g. `chore(release): v0.10.0`), then tag/build per the release flow.
