# Releasing pixeltamer

Releases here are manual, on purpose. There used to be a release-please workflow — it never actually cut a release (ran for ~15s on every push, did nothing, left the Releases page empty for months), and the hand-written CHANGELOG is richer than anything it would auto-generate. So it's gone. We bump by hand. It's a handful of commands and it keeps the changelog worth reading.

## Versioning

SemVer. Pick the bump from what actually changed — the conventional-commit prefix is the hint, not a law:

| Change | Commit prefix | Bump | Example from this repo |
|---|---|---|---|
| New capability / flag / env var / output | `feat:` | minor `0.X.0` | timeout env vars + exit code 124 (0.5.0) |
| Bug fix, no new surface | `fix:` | patch `0.0.X` | the `+x` bash-invoke fix (0.5.1) |
| Breaking change | `BREAKING CHANGE:` | major `X.0.0` | removing a flag or changing its meaning |
| Docs, chore, refactor, tests, ci | `docs:` / `chore:` / … | patch, or fold into the next real release | README updates |

We're pre-1.0, so features land in the minor slot and nothing's promised stable yet. Use judgment over dogma: a one-line informational tweak to `doctor` is a patch even though it's technically a `feat`. The thing that bumped 0.5.1→0.5.2 was exactly that.

## The steps

1. Land your changes with conventional commits (`feat:`, `fix:`, etc.).
2. Move the `[Unreleased]` block in `CHANGELOG.md` into a new dated section, `## [X.Y.Z] - YYYY-MM-DD`. Write real prose — what changed, why, and the gotcha if there was one. That paragraph is the entire reason we do this by hand instead of letting a bot generate `* fix: thing (#123)` bullets.
3. Bump `"version"` in `package.json`.
4. Commit the bump on its own: `git commit -m "chore(release): X.Y.Z"`.
5. Tag it: `git tag -a vX.Y.Z -m "pixeltamer X.Y.Z — one-line summary"`.
6. Push both: `git push origin main && git push origin vX.Y.Z`.
7. Create the GitHub Release straight from the changelog section so the Releases page stays in sync:

```bash
ver=X.Y.Z
awk -v v="$ver" '$0 ~ "^## \\["v"\\]"{f=1;next} f&&/^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
gh release create "v$ver" --title "v$ver" --notes-file /tmp/notes.md --verify-tag
```

## Updating the installed copy

The skill is distributed through the Skills CLI (`npx skills update`), which strips execute bits when it copies files. After an update the dispatcher needs its bit back once — everything else self-heals:

```bash
chmod +x ~/.claude/skills/pixeltamer/scripts/pixeltamer   # then `pixeltamer doctor` fixes the siblings
```

That's an upstream installer bug ([vercel-labs/skills#1140](https://github.com/vercel-labs/skills/issues/1140)), not ours — tracked, fix proposed in [#1149](https://github.com/vercel-labs/skills/pull/1149), not merged yet. When it lands, delete this section and the `+x` notes in the README.
