# Changelog

All notable changes to pixeltamer get logged here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-05-05)


### Features

* **assets:** add raster brand kit (mascot, hero, social, mode trio) ([1ebdd04](https://github.com/gabelul/pixeltamer-gpt-image-skill/commit/1ebdd044243a310ed3cc52c77242e774df96595b))
* initial release ([61bbe04](https://github.com/gabelul/pixeltamer-gpt-image-skill/commit/61bbe0406c2aa921de79ceb8a8c91b8ce7d65ec4))


### Bug Fixes

* **codex:** detect login via stderr and add -i/--image references ([e624357](https://github.com/gabelul/pixeltamer-gpt-image-skill/commit/e624357b63f265f500c80f16f850011611023a5a))
* **codex:** expand image_args safely under set -u on bash 3.2 ([e56acb7](https://github.com/gabelul/pixeltamer-gpt-image-skill/commit/e56acb7b832df65cb675943edfaab1773a92caf0))
* read codex login status from stderr in detection check ([28939a8](https://github.com/gabelul/pixeltamer-gpt-image-skill/commit/28939a88a17b8312cd3e2c46220028f69837071a))

## [Unreleased]

### Added

- **Raster brand kit in `.github/assets/`** — 8 production PNGs generated through pixeltamer itself: mascot (1024×1024), social-preview-with-text and art-only (1280×640), hero-with-text and art-only (1536×640), mode-generate / mode-edit / mode-compose (1024×1024 each). README hero swapped from the SVG banner to `hero-with-text.png`; mode trio inlined as a 3-column table under "Three modes". The existing `banner.svg` and `social-preview.svg` are kept untouched as vector alternatives.
- **`references/prompt-patterns.md`** — 338-line advanced-prompt-construction doctrine distilled from mining the freestylefly-awesome and EvoLink awesome-gpt-image-2 galleries (~14k lines of curated prompts) plus the gpt_image_2_skill craft doctrine. Documents six patterns the existing `prompting.md` didn't teach: JSON-config schema (with worked UI + e-commerce examples), role-based opener (3-component formula with 4 worked examples), specific-negative blocks (4 worked failure-mode lists per style, all translated from the original Chinese into English), phase-based structure for brand series, auto-deduce closure, and signature integration. Cross-linked from `prompting.md` (escalation pointer + negatives upgrade) and `SKILL.md` (workflow steps 2 and 4).
- **`-i, --image FILE` flag on the codex backend** (`scripts/pixeltamer_codex.sh`) — repeatable, validates files exist upfront, forwards to `codex exec -i path` per file. Lets the codex backend attach reference images for character/style consistency across generations (previously API-backend-only). Prompt builders now mention attached references when present so the model knows to use them as visual anchor.
- **`gallery/` folder** — copy-paste-ready prompt cookbook with 7 worked examples (mascot, social preview with text, hero with text, mode trio, comparison infographic). Each entry: image, one-line goal, metadata strip tagging which doctrine patterns it uses (`exact-typography`, `JSON-schema`, `role-opener`, `specific-negatives`, `-i mascot.png`), and the verbatim prompt in a `<details>` block. Doubles as a worked-example index for `prompt-patterns.md`. Format borrowed from awesome-gpt-image-2 / freestylefly-awesome.

### Changed

- **`references/prompting.md`** — negatives section gains a "what a strong list actually looks like" subsection (8–15 named failure modes per image, not vague adjectives), with a cross-link to `prompt-patterns.md` § 3 for worked blocks per style. New "When to escalate beyond this file" section pointing at the advanced patterns.
- **`SKILL.md` workflow** — step 2 (read references) and step 4 (build the prompt) both updated to load `prompt-patterns.md` when the request hits the doctrine categories (UI / infographic / brand identity / e-commerce hero / architectural render / scientific atlas / typography poster) or when Claude is composing the prompt programmatically.
- **`scripts/pixeltamer_codex.sh` runner** — switched `codex exec` invocation to feed the prompt via stdin instead of as a positional arg. Required to make the new `-i/--image` flag work, because `codex exec`'s `-i FILE...` parser is greedy and was eating prompt-as-positional as another image path. Inline comment documents the why.

### Fixed

- **Codex login-status detection** (both `scripts/pixeltamer` and `scripts/pixeltamer_codex.sh`) — recent codex CLI versions write the "Logged in" string to stderr, but the preflight checks piped `2>/dev/null | grep`, dropping the match string before grep ever saw it. Switched all four occurrences to `2>&1 | grep`. Without this fix every codex invocation bailed with "codex is not logged in" even when logged in.
- **Codex backend crash on `set -u` with empty `image_args` array** (`scripts/pixeltamer_codex.sh`) — when the new `-i/--image` flag was NOT passed, the array expansion `"${image_args[@]}"` errored as "unbound variable" under macOS bash 3.2 (which is strict about empty array expansion under `set -euo pipefail`). Switched to the bash-3.2-safe idiom `${image_args[@]+"${image_args[@]}"}` which expands to nothing when empty and to the elements when set.
- **Stale GitHub comparison URL in this changelog** — pointed at `gabelul/pixeltamer`, the actual repo is `gabelul/pixeltamer-gpt-image-skill`.

### Documented (honest findings)

- **Codex backend normalizes prompts before calling gpt-image-2.** Ran a controlled A/B (UI mockup + comparison infographic, prose vs JSON-schema, same content) — both pairs collapsed to byte-identical PNGs (same MD5). Codex's image_gen reasoning loop appears to summarize the prompt into an internal call before invocation, making the codex backend a poor A/B testbed for prompt-construction patterns. Documented in `prompt-patterns.md` § 1 and `gallery/README.md` § 7. The patterns' input-side value (structural completeness, agent composability, scales to large prompts) still applies; the model-output delta isn't measurable through codex.

[Unreleased]: https://github.com/gabelul/pixeltamer-gpt-image-skill/compare/v0.1.0...HEAD
