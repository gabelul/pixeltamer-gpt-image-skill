# Changelog

All notable changes to pixeltamer get logged here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning follows [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Documented

- **README — codex backend env vars + exit codes.** The setup section now documents `PIXELTAMER_CODEX_TIMEOUT` / `PIXELTAMER_CODEX_KILL_GRACE` and the full exit-code list (`124` timeout, `1` failure, `2` usage, `127` not installed/logged in) — previously only in the script header. The `+x` troubleshooting section is refreshed for 0.5.1: the dispatcher is now the only file that needs the execute bit, with both the `chmod` and `bash`-bootstrap recoveries.
- **README — `Permission denied` heads-up at first run.** Moved the `chmod` fix to the point of first contact (the "First run" section), so a user hitting the cryptic shim error sees the one-line fix immediately instead of having to dig into Troubleshooting. The shim error itself can't be improved from our side (it fires before our code runs), so discoverability is the lever.
- **README — `Updating` subsection.** New `### Updating` under Install spells out `npx skills update` and the one-line dispatcher bootstrap it requires (the CLI re-strips execute bits on every update), with both the `chmod` and `bash`-bootstrap forms.

## [0.5.1] - 2026-06-14

### Fixed

- **codex generation no longer breaks when the `skills` CLI strips a script's execute bit.** The CLI's file copy doesn't preserve POSIX mode bits, so every `npx skills add` / `update` left scripts at `0644`. The dispatcher already ran the Python/Node helpers via `python3`/`node` (so their `+x` never mattered), but `pixeltamer_codex.sh` was the one sibling exec'd *directly* — and a stripped bit there silently broke codex generation. It now runs via `bash` like the others, so **no sibling needs `+x` at all**. The `_self_heal_perms()` chmod is kept as belt-and-suspenders for any future direct-exec'd helper, and `pixeltamer doctor` still reports the repair count. The only file that genuinely still needs `+x` is the dispatcher entry point itself — it's launched by-path through the `~/.local/bin/pixeltamer` shim and can't restore its own bit, so a single `chmod +x scripts/pixeltamer` after install remains the one irreducible manual step until the upstream CLI preserves mode bits (or its generated shim switches to `exec bash <dispatcher>`).

### Documented

- **SKILL.md — permission-denied recovery.** Names the exact failure mode (`pixeltamer doctor` returns `permission denied` instead of backend status) and the bootstrap: run it once via `bash ~/.claude/skills/pixeltamer/scripts/pixeltamer doctor`, or `chmod +x` the dispatcher. Notes that the dispatcher is now the only file the bit can break.

## [0.5.0] - 2026-06-14

### Added

- **Per-invocation timeout on the codex backend — `PIXELTAMER_CODEX_TIMEOUT` (default 360s).** `scripts/pixeltamer_codex.sh` ran `codex exec` with no time bound, so a stalled `image_gen` call would hang at 0% CPU indefinitely — a real run left an orphaned `codex exec` wedged for 71 minutes. Every codex invocation now runs under a watchdog that kills it after the timeout. Companion `PIXELTAMER_CODEX_KILL_GRACE` (default 5s) tunes the SIGTERM→SIGKILL gap. Both reject non-integer values rather than silently coercing.
- **New exit code `124` — "codex timed out".** Distinct from `1` (generation failed) so callers, and the internal clean→forced prompt fallback, can tell a stall apart from an ordinary failure. Documented in the script header next to the existing codes.

### Fixed

- **codex backend no longer hangs forever on a stalled `image_gen`.** Root cause + the codex v0.136-vs-gpt-5.5 schema mismatch that triggered the original 71-minute orphan (`missing field base_instructions`, fixed upstream by codex 0.139) are written up in `docs/dev-docs/troubleshooting.md`. The script's own guard is the durable fix — any future stall is now bounded, not silent.
- **No more orphaned `codex` child when the wrapper is killed.** codex is a Node launcher that spawns a child binary and forwards SIGTERM but *cannot* forward SIGKILL, so signalling only the wrapper PID left grandchildren alive. The watchdog now runs codex in its own process group via a `/usr/bin/perl 'setpgid(0,0); exec'` wrapper (`setsid` is absent on macOS; bash `set -m` is shell-global state that misbehaves in scripts; perl needs no Homebrew) and signals the whole group, confirming `pgid == pid` first so it can never hit the caller's own group. bash 3.2 compatible. Verified: 10/10 stress runs kill the full tree (child + grandchildren) with zero survivors.
- **Race: concurrent generations to the same `-o` path clobbering each other.** The old pre-clean `rm -f "$target"` meant one run's cleanup could delete another run's just-written PNG, producing a false "ok" with no file on disk. Output now lands in a `$$`-tagged temp *in the same directory* as the target, then an atomic `mv` into place — same-dir rename, so no cross-volume copy+unlink (which matters because the output dir can be on a different volume than `TMPDIR`, where the rename would silently degrade to non-atomic).
- **A timeout no longer doubles into a 2× hang.** The clean→forced prompt fallback retried on any non-zero return; a stalled image tool won't un-stall for a pushier prompt, so a timeout (exit 124) now skips the retry instead of burning a second full budget.
- **Cache-recovery scan no longer steals a concurrent run's image.** The `~/.codex/generated_images` fallback filters by `-newer` a run-start marker instead of grabbing the newest file overall, and guards the empty-result case explicitly — GNU `xargs` (Linux) runs `ls` with *no args* on empty input, which would list the current directory and could publish an arbitrary file; BSD `xargs` (macOS) doesn't, and we no longer depend on the difference.
- **Login preflight hardened two ways.** `grep -qi "logged in"` wrongly accepted "Not logged in" (substring match), and a non-timeout non-zero exit from `codex login status` fell through to that string check. Now it trusts the exit code first (any non-zero, non-timeout failure → exit 127) and then rejects "not logged in" explicitly. The preflight itself also runs under a 30s watchdog so a wedged codex daemon can't hang it.
- **Work-temp cleanup + directory-target guard.** Partial temp files are swept on every timeout / codex-failure / missing-output / publish-failure path, so a killed codex can't leave litter in the output directory. An existing directory at the `-o` target is rejected up front (exit 2) and re-checked at publish, instead of `mv`-ing the PNG *into* it and then printing the directory as if it were the image. Every publish `mv` is now checked explicitly (errexit is disabled inside the function because it's called in an `|| rc=$?` context, so an unchecked failed `mv` would otherwise slip through to a false success).
- **`scripts/pixeltamer` — self-heal missing +x on sibling scripts after `npx skills add` / `npx skills update`.** The Skills CLI's file copy doesn't preserve POSIX mode bits, so every install leaves `pixeltamer_api.py`, `pixeltamer_codex.sh`, `pixeltamer_codex_oauth.py`, and `verify-images.mjs` non-executable. The dispatcher's exec of those siblings then failed with `Permission denied` — the most visible symptom was `pixeltamer batch` silently broken (because `verify-images.mjs` was the one most likely to escape an earlier manual chmod), but every codex / API call hit the same wall on a clean install. Fix: added `_self_heal_perms()` which the dispatcher now runs silently on every non-doctor invocation, fixing siblings before they're exec'd. `pixeltamer doctor` runs it loudly and reports the repair count: `perms self-heal: fixed +x on N script(s)`. The dispatcher itself can only fix its siblings (it has to already be +x to run at all), so the one remaining manual step on a truly broken install is `chmod +x ~/.claude/skills/pixeltamer/scripts/pixeltamer` — but most users hit only the sibling-perm flavor of this bug, where the shim execs into the dispatcher fine and self-heal handles the rest. **Upstream issue belongs in the `skills` CLI itself** — it should preserve `fs.statSync(src).mode` on copy, or chmod 0755 across `scripts/` directories post-install. Filed separately.
- **README — Troubleshooting section.** New section documents the chmod one-liner for the dispatcher-itself case, points users at `pixeltamer doctor` for the sibling-case auto-heal, and links the upstream Skills CLI issue.

### Documented

- **`docs/dev-docs/troubleshooting.md` (new).** Five landmines from this work, each with symptom / root cause / fix / lesson: the no-timeout codex hang, the backgrounded-`&`-command-reads-`/dev/null` stdin gotcha, the zombie-reaping window that made a working group-kill *look* broken in tests, the GNU-vs-BSD `xargs` empty-input divergence, and the `grep "logged in"` substring trap.
- **`scripts/pixeltamer_codex.sh` header — env vars + exit codes.** Documents `PIXELTAMER_CODEX_TIMEOUT`, `PIXELTAMER_CODEX_KILL_GRACE`, and the new exit code 124.

### Process (honest note)

- The timeout/orphan rework was reviewed by Codex **twice** — once on the plan, twice on the implementation. The first implementation review returned do-not-ship (5 confirmed bugs); the second caught one regression the *fixes themselves* introduced (a non-timeout `codex login status` failure bypassing validation). Both rounds were folded in before this release. The watchdog and publish paths are verified against a stub codex on macOS bash 3.2 — the Linux `xargs` path is reasoned and guarded, not yet run on actual Linux.

## [0.4.1] - 2026-05-14

### Fixed

- **`scripts/pixeltamer_codex_oauth.py` — retry on transient infra failures.** Wraps the urlopen + SSE-parse loop in `run_one()` with exponential backoff retry (~2s / 4s / 8s with ±25% jitter, default 2 retries = up to 3 total attempts). Triggers on HTTP 5xx, urllib `URLError` (DNS / TCP / TLS / read-timeout), and SSE `response.failed` events whose `error.code` is in `{websocket_error, server_error, rate_limit_exceeded, service_unavailable}`. These correspond to OpenAI / codex-lb-side blips where the internal WS to gpt-image-2 dropped mid-generation or the proxy hit a capacity ceiling — exactly the failure mode 0.3.0's changelog flagged as "documented honest carry-over" with no handling yet. Does NOT retry on HTTP 4xx (request-side problem, won't fix itself), `token_expired` (special-cased, surfaces the `codex login` hint immediately), or stream-completed-without-image-and-without-failure-event (model declined to call the tool — retrying the same prompt won't change its mind). Retry attempts log to stderr without `--debug` so the user sees what's happening: `pixeltamer_codex_oauth: response.failed code=websocket_error; retrying in 2.0s (attempt 2/3)`.

### Added

- **`--max-retries N` flag on `pixeltamer_codex_oauth.py`.** Configurable retry cap, default 2. Set `0` to disable retries entirely (matches pre-0.4.1 behavior for anyone who needs the old fail-fast semantics). Threaded through `generate`, `edit`, and `compose` subcommands.

### Investigated (honest carry-over)

- **A/B'd pixeltamer's minimal request shape vs hermes-editing's enriched shape** (`tool_choice: required`, `partial_images: 1`, non-empty `instructions`, per-image `input_text` labels). Triggered by a compose-failure debugging session that initially diagnosed the failure as request-shape-driven, then got a Codex second opinion that flagged my "WS-keepalive via partial_images" mechanism as speculation. Built `scratch/ab-test/compose-shape-ab.py` and fired 8 paired trials per arm against the same prompt + same two reference images. Result: **both arms 8/8 success, latencies overlapping** (minimal 57-146s, hermes-full 53-92s — the early latency gap from the N=3 light-prompt run did NOT replicate at N=5 with a heavy compose prompt). The shape-rewrite hypothesis is disconfirmed at this sample size. The actual observed failure (`websocket_error` mid-generation) is what the retry above handles. **Hermes-style shape NOT shipped** — no measured reliability or latency benefit, shipping it would be churn risking output regressions on prompts the A/B didn't cover.

## [0.4.0] - 2026-05-08

### Added

- **`playbook/` — curated remix corpus, distinct from `recipes/` methodology.** New top-level folder with the boundary rule "if you can swap the named subject and reuse the prompt verbatim → playbook; if it teaches method → recipe." Ships v1 with two files: `character-sheets.md` (10 prompts for multi-view sheets, expression sets, sticker packs, pose libraries) and `typography-posters.md` (10 prompts for type-led layouts including giant-letter, brutalist-grid, quote-led, manifesto, bilingual). Each prompt passes a discipline checklist: subject in first 50 words, no magic words ("8K UHD", "masterpiece", etc.), English-only unless the subject IS the script, source-cited, with "why this works" + "swap X for Y" notes. Sources mined from freestylefly, EvoLink, wuyoscar `gpt_image_2_skill`, and originals.
- **`playbook/BACKLOG.md` — staged plan for v2/v3/v4.** Documents ~18 future playbook files across three ralplan cycles: v2 (scientific-figures, isometric, brand-systems, architecture-renders, illustration-styles), v3 (anime-manga, pixel-art, app-icons, cinematic, photography-styles, data-viz), v4 (fashion-editorial, tattoo-design, gaming-assets, retro-cyberpunk, events-experience, screen-mockups, beauty-lifestyle). Per-file source list and effort estimates. "Niche audience" is NOT a skip filter — only redundancy is.
- **`playbook/BOUNDARY-AUDIT.md` — per-recipe disposition.** Records which existing recipe worked-examples STAY (canonical teaching), CANDIDATE (could migrate to playbook in v2 but won't in v1), or CLEAR (already correctly placed). No file moves in v1; documented exception.
- **`references/index.md` — central routing index.** Hand-written routing map covering all 6 recipes + 2 playbooks + 5 references. External-references section linking to OpenAI cookbook, fal.ai prompting guide, wuyoscar / freestylefly / EvoLink / Anil-matcha repos for questions our docs don't cover. Decision-tree fallbacks for ambiguous requests.
- **`recipes/mascot.md` (655 lines) — full mascot recipe with phased workflow.** Discovery → Concept Lock → Production → Maintenance phases, each with a different default format and discipline. Format A art-director brief stays primary; Format A.5 Codex labeled-prose pattern (`Subject:` / `Tone:` / `Style:` / `Palette:` / `Expression:` / `Pose:` / `Must keep:` / `Avoid:`) added as alternative for slot-fillable canon work and variant series. Anti-pattern table catches the Slack-blob default, vinyl-figure trap, cute-overload, and unscalable-detail failure modes. "Build your project's prompt pack" deliverable section teaches the canonical-prompt + variant-deltas + "do not restart from" pattern. Empirically validated: A/B harness on Pip canon (8 renders, 4 per format, codex backend) ties at 5/5 best-of-4 — Format A stays primary per Principle 3 (empirical wins over taste).
- **`tests/index-staleness.test.mjs` — bidirectional sync test.** Asserts every `.md` under `recipes/`, `playbook/`, `references/` appears in `references/index.md` by relative path, and every relative path in the index resolves to a real file. Wires into existing `npm test` suite. Catches drift the moment a new file lands without an index entry — proven during execution when it flagged `playbook/README.md` and `playbook/BOUNDARY-AUDIT.md` as missing on first run.
- **`tests/ab/` — A/B test harness for prompt-construction patterns** (carried from Unreleased). Methodology + bash runner + fixtures for validating doctrine claims like JSON-schema / role-opener / specific-negatives vs equivalent prose. Defaults to `--backend api` because codex normalizes prompts internally. Used during 0.4.0 to validate the Format A vs Format A.5 mascot-recipe choice.

### Changed

- **`SKILL.md` — Step 0 added to operating loop.** New first step: "Read `references/index.md` first; load the smallest useful slice; never write from scratch when a similar pattern exists." Existing steps renumbered 1–7. The single change that would have prevented the entire mascot-design detour through origami crane concepts during the upgrade session — if you check the index first, you don't restart from concepts the project already ruled out.
- **`SKILL-OC.md` slimmed by 18 lines.** Two routing tables ("References on demand" + "Recipes on demand", lines 134–153) replaced with a single one-sentence pointer to `references/index.md`. Net `wc -l` went from 159 to 141 — token-optimized variant stays optimized.
- **`references/prompting.md` — gpt-image-2-specific findings integrated.** Four new sections sourced from OpenAI cookbook + fal.ai prompting guide + wuyoscar craft.md: (1) JSON-vs-prose decision rule with empirical note that JSON does not beat well-structured prose for the same content, (2) Front-load-first-50-words rule because gpt-image-2 weights early tokens disproportionately, (3) Praise-language substitution table replacing nine common praise words ("cute" / "charming" / "stunning" / "professional" / "premium") with observable spec-language equivalents, (4) Context-to-anchor matrix for picking a style anchor based on where the image will live (mobile app icon vs SaaS marketing illustration vs designer collectible vs editorial mascot, etc.).

### Documented

- **`playbook/README.md` — discipline checklist + boundary rule.** The one-sentence test for whether content goes in `recipes/` (teaches method) vs `playbook/` (remixable subject). Source-citation format. English-enforcement policy (human review, no automated linter). v1 TODOs (downgraded from open questions): external URL public/private confirmation, Format A propagation policy, decay re-validation cadence.
- **Process journey (ralplan + ralph).** This release went through formal consensus planning before execution: Planner v1 → Architect STRENGTHEN → Critic ITERATE (6 changes) → Planner v2 (revisions integrated) → Architect APPROVE_AS_IS → Critic APPROVE-WITH-RESERVATIONS (4 small edits folded in) → ralph execution across 4 phases (boundary audit → mascot revision + A/B → playbook build → routing index) → verifier sign-off (61/61 acceptance criteria) → deslop pass (zero edits needed; content was clean from the start) → post-deslop regression (31/31 tests pass).

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
