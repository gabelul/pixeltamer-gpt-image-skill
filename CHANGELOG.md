# Changelog

All notable changes to pixeltamer get logged here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

## [0.3.0] - 2026-05-06

### Added

- **`scripts/pixeltamer_codex_oauth.py`** (~430 lines, stdlib-only Python) — codex-OAuth backend for `edit` and `compose` modes. POSTs directly to the Codex Responses API (`<chatgpt-base>/backend-api/codex/responses`) using ChatGPT OAuth credentials from `~/.codex/auth.json` instead of going through the `codex exec` CLI surface (which only exposes generation). Resolves the base URL from `~/.codex/config.toml` the way `codex exec` does, so users with local proxies / load balancers (e.g. `[model_providers.codex-lb]` pointing at 127.0.0.1) keep working. Supports `generate`, `edit`, and `compose` subcommands with the same flag surface as `pixeltamer_api.py`: `-p`, `-o`, `-i` (repeatable), `--size`, `--quality`, `--debug`. Token refresh is NOT implemented — proxy users get refresh from their proxy; direct-upstream users hit `token_expired` after ~1h and need to run `codex login` again (the error message says so). Closes [#2](https://github.com/gabelul/pixeltamer-gpt-image-skill/issues/2).
- **Dispatcher routing for codex-backend `edit` + `compose`** (`scripts/pixeltamer`) — `cmd_edit` and `cmd_compose` now route through the new `pixeltamer_codex_oauth.py` module when backend resolves to codex, instead of failing with "API only." `--mask` is detected in `cmd_edit` and still requires the API backend (the codex Responses API doesn't take a mask parameter). All other `edit` and `compose` calls work with no API key required.
- **`gallery/` entry #8** — codex-OAuth edit proof. Two-image set (AI image-generation models comparison source + dark-mode color edit) demonstrating byte-perfect text fidelity (zero drift across 30+ exact text values: model names, makers, year integers, max-resolution strings, access modes, best-for tag pills, title, footer). Both prompts inline plus wire-protocol notes for whoever wants to reproduce or build on the pattern.

### Changed

- **`README.md` / `SKILL.md` / `references/codex-backend.md` / `gallery/README.md`** — capability matrix and prose updated to reflect codex-OAuth edit + compose now shipping. Backend cheat sheet rows for "Edit (no mask)" and "Compose 2–16 references" both say "either backend." Mask-based inpainting remains the only mode flagged as API-only — the Responses API doesn't take a mask parameter, so that constraint is structural, not a wiring gap.
- **`scripts/pixeltamer` usage text** — subcommand descriptions updated: `edit` and `compose` no longer say "(API only)."

### Documented (honest carry-over)

- The codex-OAuth path inherits the codex Responses API's known instability — see liyoungc/hermes-plugin-gpt-image's three-stage prompt fallback for context. Pixeltamer's implementation does not yet do prompt-fallback handling; if a generation fails silently, raw SSE is saved next to the output path with a `.debug-response.txt` suffix for diagnosis.

## [0.2.0] - 2026-05-05

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

- **Codex backend normalizes prompts before calling gpt-image-2.** Ran a controlled A/B (UI mockup + comparison infographic, prose vs JSON-schema, same content) — both pairs collapsed to byte-identical PNGs (same MD5). Codex's image_gen reasoning loop appears to summarize the prompt into an internal call before invocation, making the codex backend a poor A/B testbed for prompt-construction patterns. Documented in `prompt-patterns.md` § 1 and `gallery/README.md` § 7. The patterns' input-side value (structural completeness, agent composability, scales to large prompts) still applies; the model-output delta isn't measurable through codex. Tracked in [#1](https://github.com/gabelul/pixeltamer-gpt-image-skill/issues/1).

## [0.1.0] - 2026-04-30

### Added

- Initial release.
- Two backends with auto-detect: OpenAI API (Python, zero-dep) and Codex CLI (bash, dual invocation pattern with fallback).
- Three modes: one-shot generation, multi-image batch with state-machine verification, multi-reference composition (up to 16 inputs via /images/edits).
- References folder covering prompting doctrine, both backends, multi-reference composition, post-processing, UI-mockup-specific patterns.
- Recipes for infographic, meta-ad, viral-linkedin, ui-mockup, editorial-cover, product-photo.
- SKILL.md for full-context environments and SKILL-OC.md token-optimized variant for OpenClaw.
- Multi-image batch verifier with state-machine `prompts.md` format and a 29-test node:test suite.

[Unreleased]: https://github.com/gabelul/pixeltamer-gpt-image-skill/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/gabelul/pixeltamer-gpt-image-skill/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/gabelul/pixeltamer-gpt-image-skill/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gabelul/pixeltamer-gpt-image-skill/releases/tag/v0.1.0
