# CLAUDE.md — pixeltamer

## What this is

A skill (markdown + small scripts) that generates, edits, and composes images via gpt-image-2. Works with Claude Code, Codex CLI, OpenCode, Cursor, and 40+ other agents via the Skills CLI.

## Architecture

`SKILL.md` is the orchestrator. It tells Claude (or whatever agent loaded the skill) what to do when an image-generation request comes in: identify the mode, pick the recipe, load the right reference doc, call the dispatcher, visually self-verify the result.

```
SKILL.md                             — entry point, mode routing, workflow, output format
SKILL-OC.md                          — token-optimized variant for OpenClaw
scripts/
  pixeltamer                         — bash dispatcher; auto-detects backend, first-run config
  pixeltamer_api.py                  — Python API client, zero deps (urllib only)
  pixeltamer_codex.sh                — codex CLI wrapper, two invocation patterns w/ fallback
  verify-images.mjs                  — multi-image batch verifier orchestrator
  lib/
    parse-prompts.mjs                — parser for prompts.md state-machine format
    verify-entry.mjs                 — per-entry checks: file exists, dimensions, size, format
    write-status.mjs                 — surgical status field updater for prompts.md
references/
  prompting.md                       — the doctrine. Canonical structure, what NOT to say.
  api-backend.md                     — API specifics, env vars, troubleshooting
  codex-backend.md                   — codex CLI specifics, both invocation patterns
  multi-reference.md                 — compose mode mastery, labeling patterns
  post-process.md                    — compress, resize, convert, alpha-extract one-liners
  ui-mockup-prompting.md             — UI dialect: analogy vs inventory, real data, asset rules
recipes/
  infographic.md
  meta-ad.md
  viral-linkedin.md
  ui-mockup.md
  editorial-cover.md
  product-photo.md
examples/                            — 4 curated demonstration PNGs
tests/                               — 29 unit tests covering parser, verifier, status writer
```

## How the skill works

1. Identify mode (generate / edit / compose / batch) from the request.
2. Pick a recipe if one fits (infographic, meta-ad, viral-linkedin, ui-mockup, editorial-cover, product-photo). Recipes are loaded on demand — they're not in the SKILL.md context by default.
3. Load the relevant reference docs on demand. `prompting.md` for any non-trivial prompt; `multi-reference.md` for compose; `ui-mockup-prompting.md` for UI work.
4. Resolve unspecified params: pick a sensible size (table in `prompting.md`), default `--quality high`, pick the backend (auto-detect API → codex).
5. Build the prompt using the canonical structure: Intent → Scene → Subject → Details → Text → Style → Constraints. Drop magic words. Quote every character that should appear. On edits, specify what to preserve.
6. Call the right `pixeltamer` subcommand. The script prints the absolute path on stdout.
7. Visually self-verify with the `Read` tool. Image generation is stochastic; "API succeeded" ≠ "image is correct." Check subject, text spelling, artifacts, framing, color.
8. Iterate one-dimension-at-a-time if wrong, or surface the path if right.

## The two backends

Both speak gpt-image-2 but via different transports:

**API backend** (`pixeltamer_api.py`):
- POSTs to `/images/generations` (text-to-image) or `/images/edits` (edit / compose).
- Auth via `OPENAI_IMAGE_API_KEY` or `OPENAI_API_KEY`.
- Custom hosts via `OPENAI_IMAGE_BASE_URL` (jmrai, ZenMux, OpenRouter, etc).
- Zero deps — urllib only. Runs on any Python 3.7+.
- Multi-reference: up to 16 images attached as `image[]` form fields.
- Parallel: `-n N` fires N independent calls via ThreadPoolExecutor (faster wall-clock, partial-failure tolerant).
- Retry: exponential backoff on 429/5xx, surface 4xx immediately.

**Codex backend** (`pixeltamer_codex.sh`):
- Shells out to `codex exec --skip-git-repo-check -s workspace-write` with a prompt that asks codex to use its built-in `image_gen` tool.
- Auth: `codex login` (ChatGPT subscription).
- Two invocation patterns, with fallback:
  1. **Clean task-list** (preferred): numbered instructions, lets codex's reasoning loop invoke image_gen naturally.
  2. **Augmented "force tool use"** (fallback): explicit "MUST call image_generation tool, do NOT fabricate a PNG" guardrails.
- Falls back from #1 to #2 only if #1 produces no PNG.
- Last-resort recovery: if codex saved to `~/.codex/generated_images/` but didn't copy to the requested path, scans the cache for the newest `ig_*.png` and copies it.
- Generation only — no edits, no compose. Codex's image_gen tool doesn't support those.

The dispatcher (`scripts/pixeltamer`) auto-detects which backend to use, honors `--backend api|codex|auto` and `PIXELTAMER_BACKEND` env, runs first-run config if neither backend is configured.

## The batch state machine

For projects that need 4+ related images generated together with verification, `pixeltamer batch <prompts.md>` runs a state-machine workflow:

1. **prompts.md** is a markdown file with one entry per image:
   - heading: `## N. <relative-target-path>`
   - fields: `- **Format:** PNG/JPG/PNG transparent`, `- **Native size:** WxH`, `- **Reference to attach:** path` (optional), `- **Status:** pending/verified/failed:reason`
   - prompt: `- **Prompt:**` followed by `> ...` quote-block lines
2. **Verify** with `verify-images.mjs`: parses, checks each `pending` or `failed` entry (file exists, dimensions match exactly, file size in [10 KB, 10 MB], extension matches format), writes status updates back into the file.
3. **Visual self-review** by Claude — `Read` each newly-verified PNG, judge subject/style/artifacts, demote to `failed:<reason>` if mismatched.
4. **Re-generate** only the failed entries.

The parser, verifier, and status writer are pure functions with dependency injection — that's why they have 29 tests.

## Backend tradeoffs

| Axis | API | Codex |
|---|---|---|
| Auth | API key | ChatGPT subscription |
| Marginal cost | per-image | included in subscription up to limits |
| Latency per image | ~10–20s | ~30–90s (reasoning loop) |
| Edit / inpaint | ✅ | ❌ |
| Multi-reference compose | ✅ (up to 16 refs) | ❌ |
| Mask / region edit | ✅ | ❌ |
| Custom base URL / proxy | ✅ | ❌ |
| Parallel `-n` | true parallel HTTP | sequential within codex |

## Testing

```bash
npm test
```

Runs the 29-test suite via Node's built-in `node:test`. Coverage:

- Parser: heading detection, field extraction, multi-line prompt parsing, CRLF normalization, invalid heading rejection.
- Verifier: PNG/JPG passes, file-not-found, size bounds, extension mismatch, dimension mismatch, dimension-read failure, format unrecognized, size unparseable.
- Status writer: single + multi-entry updates, prompt preservation, heading preservation, no-op on missing index, failed→verified demotion.

All tests use dependency injection — no real image files needed.

## What pixeltamer is NOT

- Not a video generator. gpt-image-2 is image only.
- Not a Photoshop replacement. It's the engine, not a layered editor.
- Not a brand-asset pipeline. Generates references, not final spec deliverables.
- Not free. Either API per-image cost or your ChatGPT subscription rate-limit budget.

