---
name: do-commits
description: Commit changes in thematic groups with short messages that follow the repo's semantic conventions.
---

Great! Now let's commit these changes in thematic groups with short messages that follow the repo's semantic conventions.

## Commit Message Convention

Use the format: `type(scope): message`

**Types:**

- `feat`: New feature or component
- `fix`: Bug fix
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `build`: Changes to build system or dependencies (package.json, tsconfig, etc.)
- `chore`: Maintenance tasks (lockfile updates, etc.)
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `perf`: Performance improvements
- `style`: Code style changes (formatting, semicolons, etc.)

**Scope Examples:**

- Libs: `contracts`
- Tools: `oxlint-config`, `tsconfig`, `dep-version-map`
- Config: `deps`, `repo`, `ci`

**Message Guidelines:**

- Use imperative mood ("add" not "added", "migrate" not "migrated")
- Keep under 72 characters
- Be specific but concise
- No period at the end

**Grouping Strategy:**

1. **Feature additions** - New components/files created
2. **Refactors/Updates** - Exports, imports, structural changes
3. **Build changes** - Dependencies, package.json, build config
4. **Lockfile** - Always separate commit for pnpm-lock.yaml
5. **Documentation** - README, migration docs, comments

**Examples:**

```
feat(contracts): add new user interface
refactor(oxlint-config): update react rules
build(tsconfig): enable strict mode
chore(deps): update pnpm lockfile
docs: update README with setup instructions
```
