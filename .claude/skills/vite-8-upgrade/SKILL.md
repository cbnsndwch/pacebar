---
name: vite-8-upgrade
description: "Migrate a project (single-app or monorepo) from any Vite version (4, 5, 6, 7, or rolldown-vite) to Vite 8 with Rolldown/Oxc. Covers discovery, intermediate upgrades, dependency bumps, config migration, build verification, and cleanup."
---

# Migrate to Vite 8 with Rolldown

You are performing a migration to **Vite 8**, which replaces esbuild and Rollup with **Rolldown** (Rust bundler) and **Oxc** (Rust compiler/minifier). The project may be on Vite 4, 5, 6, 7, or `rolldown-vite`. This skill covers the full upgrade path from any starting version.

**Reference links** (fetch these if you need additional detail beyond what is summarised below):
- Vite 8 announcement: https://vite.dev/blog/announcing-vite8
- v7 → v8 migration guide: https://vite.dev/guide/migration
- v6 → v7 migration guide: https://v7.vite.dev/guide/migration
- v5 → v6 migration guide: https://v6.vite.dev/guide/migration
- v4 → v5 migration guide: https://v5.vite.dev/guide/migration

## Phase 0 — Discovery

Before making any changes, gather a complete picture of the workspace:

1. **Determine repo structure**: Identify whether this is a single-app repo or a monorepo (npm/yarn/pnpm workspaces, Nx, Turborepo, Lerna, etc.).
2. **Inventory every Vite app/package**: For monorepos, list every workspace that depends on `vite`, `rolldown-vite`, or any `@vitejs/*` plugin. Record each one's:
   - Package name and path
   - Current Vite version
   - Framework (React, Vue, Svelte, Solid, Astro, etc.)
   - Vite plugins in use (with versions)
   - Whether it uses SSR, library mode, or worker builds
3. **Check Node.js requirement**: Vite 8 requires **Node.js 20.19+ or 22.12+**. Verify the project's `.nvmrc`, `engines` field, CI config, and Dockerfiles. Update if necessary.
4. **Scan for esbuild/Rollup configuration surface**:
   - `esbuild` option in `vite.config.*`
   - `optimizeDeps.esbuildOptions` in `vite.config.*`
   - `build.rollupOptions` in `vite.config.*`
   - `worker.rollupOptions` in `vite.config.*`
   - `build.commonjsOptions` in `vite.config.*`
   - `build.dynamicImportVarsOptions` in `vite.config.*`
   - Direct imports of `esbuild` or `rollup` APIs in source or plugin code
   - Uses of `transformWithEsbuild` in custom plugins
   - Uses of `parseAst` / `parseAstAsync`
   - `manualChunks` (object or function form) in rollup output options
   - `build.rollupOptions.watch.chokidar`
   - `resolve.alias[].customResolver`

Present the discovery findings as a checklist table before proceeding.

## Phase 0.5 — Catch up from older Vite versions (if needed)

If any app/package is on a version older than Vite 7, you must apply the intermediate breaking changes before the v8 migration. **Do not skip versions** — each major has breaking changes that compound.

Identify the current version and follow the relevant sections below. In a monorepo, different workspaces may be on different versions — handle each independently.

### From Vite 4 → 5

Fetch the full migration guide: https://v5.vite.dev/guide/migration

Key changes:
- **Node.js 18+ required** (dropped 14, 16)
- **CJS Node API deprecated** — Vite is now ESM-first. Update `require('vite')` to `import('vite')` or `await import('vite')`. Update `vite.config.js` to ESM (rename to `.mjs` or set `"type": "module"` in `package.json`)
- **Reworked `define` and `import.meta.env.*` replacement** — string values for `define` must now be explicitly quoted (e.g., `'"string"'` not `'string'`)
- **SSR externalized modules**: CJS/ESM interop changes. Default import from CJS may differ
- **Removed deprecated APIs**: `import.meta.glob` legacy options, `ssr.format: 'cjs'`
- **`worker.plugins` is now a function**
- Deprecated: importing CSS as a string via default import (use `?inline` query instead)

Apply all relevant changes, run install, and verify the app builds and runs before moving on.

### From Vite 5 → 6

Fetch the full migration guide: https://v6.vite.dev/guide/migration

Key changes:
- **Environment API** (internal refactoring) — mostly transparent but may affect framework-level plugins
- **Vite Runtime API → Module Runner API** — if you used the experimental Runtime API from Vite 5.1, update to the Module Runner equivalent
- **`resolve.conditions` default changed** — Vite no longer adds `['module', 'browser', 'development|production']` internally. If you customised `resolve.conditions`, prepend the defaults: `[...defaultClientConditions, 'your-custom']`. Import `defaultClientConditions` / `defaultServerConditions` from `'vite'`
- **`json.stringify` default is now `'auto'`** — large JSON files are automatically stringified. Set `json.stringify: false` to disable
- **Sass modern API by default** — if using `sass` (not `sass-embedded`), the modern API is now default. Set `css.preprocessorOptions.scss.api: 'legacy'` temporarily if you hit issues, then migrate Sass code
- **postcss-load-config v6** — TypeScript postcss configs now need `tsx` or `jiti` instead of `ts-node`; YAML configs need the `yaml` package
- **CSS output filename in library mode** changed from `style.css` to `{name}.css`. Use `build.lib.cssFileName: 'style'` to keep old name
- **Extended HTML asset references** — more HTML elements are now processed. Add `vite-ignore` attribute to opt out
- **`build.cssMinify` now enabled for SSR** by default
- **`commonjsOptions.strictRequires` now `true`** by default (from `'auto'`)
- **tinyglobby replaces fast-glob** — range braces (`{01..03}`) and incremental braces (`{2..8..2}`) no longer supported in globs
- **dotenv-expand v12** — variables used in interpolation must be declared before the interpolation

Apply changes, install, and verify before proceeding.

### From Vite 6 → 7

Fetch the full migration guide: https://v7.vite.dev/guide/migration

Key changes:
- **Node.js 18 dropped** — requires Node.js 20.19+ or 22.12+ (same as Vite 8)
- **`build.target` default updated** — Chrome 87→107, Edge 88→107, Firefox 78→104, Safari 14→16. The default is now named `'baseline-widely-available'` (the old `'modules'` name is removed)
- **Sass legacy API support removed** — remove `css.preprocessorOptions.sass.api` / `scss.api` option entirely; Sass code must be compatible with the modern API
- **Removed deprecated features**:
  - `splitVendorChunkPlugin` (use `manualChunks` instead)
  - Hook-level `enforce` / `transform` for `transformIndexHtml` (use `order` / `handler`)
- **`legacy.proxySsrExternalModules`** removed (was already no-op)
- **`optimizeDeps.entries`** now always treated as globs, not literal paths
- **Server middlewares ordering** — some middlewares (CORS, etc.) now apply before `configureServer` hook. Verify custom middleware doesn't conflict

Apply changes, install, and verify before proceeding.

### Strategy for large version jumps

For a jump of 2+ major versions (e.g., v4 → v8):

1. **Do NOT jump directly to v8.** Upgrade one major at a time.
2. After each major bump, run `install` + `build` + `dev` to catch issues at the version boundary where they are documented.
3. In monorepos, you may upgrade all workspaces through one intermediate version before moving to the next (e.g., bring everything to v7 first, then do the v8 migration together).
4. Once all workspaces are on **Vite 7** (or `rolldown-vite`), proceed to Phase 1 below.

## Phase 1 — Upgrade dependencies (v7 → v8)

For **each** Vite app/package identified in Phase 0, do the following:

### 1.1 Upgrade Vite

If the package currently uses `rolldown-vite`:
```jsonc
// undo the npm alias and bump to v8
-  "vite": "npm:rolldown-vite@7.x"
+  "vite": "^8.0.0"
```

If the package currently uses standard `vite` v7:
```jsonc
-  "vite": "^7.x.x"
+  "vite": "^8.0.0"
```

### 1.2 Upgrade official plugins

Upgrade official `@vitejs/*` plugins to their Vite-8-compatible versions. Key ones:

| Plugin | Target version | Notes |
|--------|---------------|-------|
| `@vitejs/plugin-react` | `^6.0.0` | Now uses Oxc for React Refresh; Babel is no longer a dependency. v5 still works with Vite 8 if you prefer a staged upgrade. |
| `@vitejs/plugin-react-swc` | Check latest | Verify compatibility with Vite 8. |
| `@vitejs/plugin-vue` | Check latest | |
| `@vitejs/plugin-legacy` | **Does NOT support ES5** output with Rolldown. Flag this if in use. |

### 1.3 Check third-party plugin compatibility

For each third-party Vite plugin, check whether it is compatible with Vite 8. Look for:
- Plugins that use `transformWithEsbuild` (now deprecated; needs `esbuild` installed as devDep, or migrate to `transformWithOxc`)
- Plugins that use removed Rollup hooks: `shouldTransformCachedModule`, `resolveImportMeta`, `renderDynamicImport`, `resolveFileUrl`
- Plugins that assign to the `bundle` object in `generateBundle`/`writeBundle` (not supported; must use `this.emitFile()`)
- Plugins that use `structuredClone(bundle)` (must change to `structuredClone({ ...bundle })`)
- Plugins that return content from `load`/`transform` hooks for non-JS file types without specifying `moduleType: 'js'`

### 1.4 Remove esbuild if no longer needed

`esbuild` is now an **optional** dependency. Remove it unless:
- A plugin still calls `transformWithEsbuild`
- You explicitly set `build.minify: 'esbuild'` or `build.cssMinify: 'esbuild'`

### 1.5 Install and run

Run the package manager install (pnpm install / npm install / yarn) and verify lockfile updates cleanly. For monorepos, ensure all workspaces resolve consistently.

## Phase 2 — Migrate configuration

Apply these changes to every `vite.config.*` in the project:

### 2.1 `esbuild` option → `oxc`

The `esbuild` top-level option is **deprecated**. Vite auto-converts it, but you should migrate explicitly:

```ts
// Before
export default defineConfig({
  esbuild: {
    jsxInject: `import React from 'react'`,
    jsx: 'automatic',
    jsxImportSource: '@emotion/react',
    define: { __DEV__: 'true' },
  },
})

// After
export default defineConfig({
  oxc: {
    jsxInject: `import React from 'react'`,
    jsx: { runtime: 'automatic', importSource: '@emotion/react' },
    define: { __DEV__: 'true' },
  },
})
```

Full mapping:
- `esbuild.jsx: 'preserve'` → `oxc.jsx: 'preserve'`
- `esbuild.jsx: 'automatic'` → `oxc.jsx: { runtime: 'automatic' }`
  - `esbuild.jsxImportSource` → `oxc.jsx.importSource`
- `esbuild.jsx: 'transform'` → `oxc.jsx: { runtime: 'classic' }`
  - `esbuild.jsxFactory` → `oxc.jsx.pragma`
  - `esbuild.jsxFragment` → `oxc.jsx.pragmaFrag`
- `esbuild.jsxDev` → `oxc.jsx.development`
- `esbuild.jsxSideEffects` → `oxc.jsx.pure`
- `esbuild.define` → `oxc.define`
- `esbuild.jsxInject` → `oxc.jsxInject`
- `esbuild.include` → `oxc.include`
- `esbuild.exclude` → `oxc.exclude`
- `esbuild.banner` / `esbuild.footer` → custom plugin using `transform` hook
- `esbuild.supported` → **not supported by Oxc** (see oxc-project/oxc#15373)

### 2.2 `optimizeDeps.esbuildOptions` → `optimizeDeps.rolldownOptions`

```ts
// Before
optimizeDeps: {
  esbuildOptions: {
    define: { global: 'globalThis' },
    plugins: [myEsbuildPlugin],
    loader: { '.txt': 'text' },
  },
}

// After
optimizeDeps: {
  rolldownOptions: {
    transform: { define: { global: 'globalThis' } },
    plugins: [myRolldownPlugin],
    moduleTypes: { '.txt': 'text' },
  },
}
```

Full mapping:
- `esbuildOptions.minify` → `rolldownOptions.output.minify`
- `esbuildOptions.treeShaking` → `rolldownOptions.treeshake`
- `esbuildOptions.define` → `rolldownOptions.transform.define`
- `esbuildOptions.loader` → `rolldownOptions.moduleTypes`
- `esbuildOptions.preserveSymlinks` → `!rolldownOptions.resolve.symlinks`
- `esbuildOptions.resolveExtensions` → `rolldownOptions.resolve.extensions`
- `esbuildOptions.mainFields` → `rolldownOptions.resolve.mainFields`
- `esbuildOptions.conditions` → `rolldownOptions.resolve.conditionNames`
- `esbuildOptions.keepNames` → `rolldownOptions.output.keepNames`
- `esbuildOptions.platform` → `rolldownOptions.platform`
- `esbuildOptions.plugins` → `rolldownOptions.plugins` (partial support)

### 2.3 `build.rollupOptions` → `build.rolldownOptions`

Rename all occurrences:
```ts
// Before
build: { rollupOptions: { ... } }
worker: { rollupOptions: { ... } }

// After
build: { rolldownOptions: { ... } }
worker: { rolldownOptions: { ... } }
```

Within the rolldown options, handle these specific sub-options:

- **`output.manualChunks` (object form)**: **Removed**. Must rewrite using Rolldown's `codeSplitting` option.
- **`output.manualChunks` (function form)**: **Deprecated**. Migrate to `codeSplitting` (see https://rolldown.rs/in-depth/manual-code-splitting).
- **`watch.chokidar`**: **Removed**. Migrate to `build.rolldownOptions.watch.watcher`.
- **`output.format: 'system'` or `'amd'`**: **Not supported** by Rolldown. Must change format.

### 2.4 Remove or migrate deprecated options

- `build.commonjsOptions` → remove (now no-op)
- `build.dynamicImportVarsOptions.warnOnError` → remove (now no-op)
- `resolve.alias[].customResolver` → replace with a custom plugin using `resolveId` hook with `enforce: 'pre'`
- `build.minify: 'esbuild'` → remove to use default Oxc minifier, or keep temporarily (requires `esbuild` devDep)
- `build.cssMinify: 'esbuild'` → remove to use default Lightning CSS minifier, or keep temporarily

### 2.5 Minification options

If you were using `esbuild.minify*` or `esbuild.drop`:
```ts
// Before
esbuild: { drop: ['console', 'debugger'] }

// After
build: {
  rolldownOptions: {
    output: {
      minify: {
        compress: {
          // use Oxc drop options
          // see https://oxc.rs/docs/guide/usage/minifier/dead-code-elimination
        },
      },
    },
  },
}
```

**Note**: Property mangling (`mangleProps`, `reserveProps`, `mangleQuoted`, `mangleCache`) is **not supported** by Oxc.

### 2.6 Handle `require()` for externalized modules

`require()` calls for externalized modules are now preserved as-is (not converted to `import`). If the previous behavior is needed:
```ts
import { defineConfig, esmExternalRequirePlugin } from 'vite'

export default defineConfig({
  plugins: [
    esmExternalRequirePlugin({
      external: ['react', 'vue', /^node:/],
    }),
  ],
})
```

### 2.7 CJS interop

The `default` import from CJS modules changed behavior. If a CJS module's `module.exports.__esModule` is not `true`, the `default` import now returns `module.exports` (not `module.exports.default`) when the importer is ESM.

If this breaks imports, temporarily use `legacy.inconsistentCjsInterop: true` while fixing upstream packages.

### 2.8 `@vitejs/plugin-react` v6 (if applicable)

If upgrading to v6, note:
- Babel is no longer a dependency; React Refresh uses Oxc
- For React Compiler, use the `reactCompilerPreset` helper with `@rolldown/plugin-babel`

### 2.9 `parseAst` / `parseAstAsync` → `parseSync` / `parse`

If any custom plugin code uses the deprecated `parseAst` / `parseAstAsync`, migrate to the new `parseSync` / `parse` functions.

### 2.10 `import.meta.hot.accept` with URL

Passing a URL to `import.meta.hot.accept` is removed. Pass a module id instead.

## Phase 3 — Build, test, and fix

### 3.1 Dev server smoke test

Run `vite dev` (or the project's dev command) for each app. Verify:
- Dev server starts without errors
- HMR works
- No console warnings about deprecated options (if you migrated them all)

### 3.2 Production build

Run `vite build` (or the project's build command) for each app. Watch for:
- Build errors from unsupported Rollup hooks in plugins
- Bundle size changes (Lightning CSS minification may slightly increase CSS size)
- CJS interop issues (`default` import returning unexpected values)
- Minification differences between esbuild and Oxc (see Oxc Minifier assumptions: https://oxc.rs/docs/guide/usage/minifier.html#assumptions)

### 3.3 Run the test suite

Run all existing tests (unit, integration, e2e). Pay special attention to:
- Snapshot tests that capture bundle output or chunk names (may change with Rolldown)
- Tests that depend on specific chunk splitting behavior
- SSR tests

### 3.4 Fix issues

For each failing test or error:
1. Identify whether it's a Rolldown/Oxc behavioral difference or a config migration issue
2. Apply the appropriate fix from the migration guide
3. Re-run only the affected tests to confirm

## Phase 4 — Cleanup

1. **Remove all deprecated options** that you temporarily kept for compatibility
2. **Remove `esbuild` from devDependencies** if nothing references it anymore
3. **Remove `rollup` from devDependencies** if it was explicitly installed and nothing references it
4. **Delete old cache directories**: Remove `node_modules/.vite` to clear stale pre-bundle caches
5. **Update CI/CD**: Ensure CI uses Node.js 20.19+ or 22.12+
6. **Commit with a clear message**: e.g., `chore: migrate to Vite 8 with Rolldown/Oxc`

## Key gotchas to watch for

| Issue | Symptom | Fix |
|-------|---------|-----|
| Native decorators lowering | Decorator transform fails | Oxc doesn't support lowering native decorators yet; use workaround in migration guide |
| Extglobs in glob patterns | Pattern matching fails | Extglobs not supported yet (rolldown-vite#365) |
| `structuredClone(bundle)` | `DataCloneError` | Use `structuredClone({ ...bundle })` |
| `import.meta.url` in UMD/IIFE | Returns `undefined` | Use `define` + `build.rolldownOptions.output.intro` |
| Parallel Rollup hooks | Timing-dependent plugin logic breaks | All parallel hooks now run sequentially in Rolldown |
| `"use strict"` not injected | Strict-mode-dependent code fails | See Rolldown docs on directives |
| ES5 output with plugin-legacy | Build fails | ES5 not supported with Rolldown |
| Multiple same-browser versions in `build.target` | Build errors | Remove duplicate browser entries, keep only one version |
| `build.target` default changed | Slightly newer baseline browsers | Chrome 111, Edge 111, Firefox 114, Safari 16.4 — verify if you support older browsers |

## Monorepo-specific guidance

- **Process workspaces bottom-up**: Start with shared libraries/packages, then apps that consume them.
- **Shared Vite config**: If the monorepo has a shared base Vite config, migrate it first and verify all consumers.
- **Workspace protocol versions**: Ensure `vite` resolves to v8 in every workspace. Check for version conflicts with `pnpm why vite` / `npm ls vite` / `yarn why vite`.
- **Turborepo/Nx caches**: Clear build caches after migration (`turbo clean`, `nx reset`).
- **Apply changes per-workspace**: Don't try to migrate everything in a single commit if the monorepo is large. Migrate one workspace at a time, verify, then proceed.