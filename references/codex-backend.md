# Codex backend — generate via the codex CLI's `image_gen` tool

Use this backend when you'd rather pay your existing ChatGPT Plus/Team/Enterprise subscription than top up an OpenAI API account. No API key needed — codex's OAuth-managed session handles auth for you.

## When to use

- You have ChatGPT Plus/Team/Enterprise.
- You don't want to manage an OpenAI API key (or your org won't verify yet).
- You're okay with slower generation (codex's reasoning loop adds latency).
- You only need one-shot generation — edits and multi-reference composition need the API backend.

## When NOT to use

- You need `edit` or `compose` modes — codex's built-in `image_gen` tool is generation-only.
- You need batch generation under tight wall-clock — codex is noticeably slower than the API.
- You're running automation that might trip ChatGPT consumer-tier rate limits.
- You can't install Node / npm to get codex.

## Setup

```bash
npm install -g @openai/codex     # or: brew install codex
codex login                       # opens browser for OAuth
codex login status                # confirms you're logged in
```

Pixeltamer's `doctor` subcommand verifies all of the above:

```bash
pixeltamer doctor
```

## How it works

```
pixeltamer generate -p "<prompt>" -o out.png
   ↓
pixeltamer_codex.sh
   ↓
codex exec --skip-git-repo-check -s workspace-write
   "<augmented prompt instructing codex to use image_gen>"
   ↓
codex reasons, calls its built-in image_gen tool (gpt-image-2)
   ↓
PNG saved to ~/.codex/generated_images/<session>/ig_*.png
   ↓
pixeltamer either reads the path codex prints, or grabs the
newest ig_*.png from the cache and copies it to your output path
```

## Two invocation patterns, with fallback

Codex versions vary in how reliably they invoke the `image_gen` tool from a clean prompt. Pixeltamer tries the cleaner pattern first and falls back to the more aggressive one if no PNG lands. The fallback's stderr line tells you which pattern won so you can spot drift over time.

### Pattern 1 — clean numbered task list

The default. Codex's reasoning loop tends to handle this naturally:

```
Perform the following tasks:
1. Use the built-in image_gen tool to generate <N> image(s).
2. Prompt: <user prompt>
3. Size: <size>
4. Quality: <quality>
5. Count: <N>
6. Save the image(s) to: <absolute path(s)>
7. After saving, print only the absolute file path(s), one per line.
```

### Pattern 2 — augmented "force tool use"

Used as fallback when pattern 1 produces no PNG. Adds explicit guardrails so codex doesn't fabricate a PNG via Python or curl:

```
Use your image_generation tool (gpt-image-2) to create <N> image(s).

PROMPT: <prompt>
SIZE: <size>
QUALITY: <quality>
COUNT: <N>

Requirements:
- You MUST call the image_generation tool. This is non-negotiable.
- Do NOT write a Python script, shell out to curl, or fabricate a PNG any other way.
- Save the image(s) to: <absolute path(s)>
- Reply with only the absolute path(s) of the saved PNG(s), one per line. Nothing else.
```

The script logs which pattern won (`pixeltamer_codex.sh: ok (pattern: clean)` or `(pattern: forced)`) so you can spot drift over time.

## Recovery: scanning the cache

If codex saves the image to its own cache directory but doesn't copy it to your requested path (which happens occasionally), pixeltamer's last-resort fallback scans `~/.codex/generated_images/` for the newest `ig_*.png` and copies it to your output. You'll see a successful exit even though codex flubbed the copy step.

## Reasoning effort

Default `medium`. Override with `--reasoning low|medium|high`.

- `low` — fastest, cheapest in subscription token budget. Good for layout iteration.
- `medium` — default. Reasonable quality and speed.
- `high` — codex spends more reasoning tokens before invoking image_gen. Sometimes produces noticeably better prompt understanding for complex scenes.

This is a separate axis from image quality — it controls how much codex thinks, not how the model renders.

## Tradeoffs vs. the API backend

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
| Failure mode | clear HTTP errors | codex stdout parsing, occasionally fragile |

## Common issues

**`pixeltamer_codex.sh: codex CLI not found on PATH`**
Install: `npm install -g @openai/codex` or `brew install codex`.

**`pixeltamer_codex.sh: codex is not logged in`**
Run `codex login`. Re-run `codex login status` to confirm.

**`codex finished but expected PNG(s) not found`**
Run with `--debug` to keep the codex log around. Usually means codex understood the task but the `image_gen` tool isn't available on your codex version (`npm update -g @openai/codex`) or your subscription tier doesn't include image generation access.

**Hangs > 2 minutes**
Codex's reasoning loop can be slow on `--reasoning high` with complex prompts. Drop to `medium` or `low`. If it consistently hangs, you may be hitting a ChatGPT rate limit — wait or switch to the API backend.

## Caveats

- This uses the consumer ChatGPT subscription endpoint via `codex exec`. Programmatic use of consumer subscriptions sits in a grey area of OpenAI's terms; check before scripting heavy automated batches.
- Output file path parsing depends on codex printing the path. If a future codex version changes its stdout format, the recovery fallback (scanning `~/.codex/generated_images/` for the newest PNG) still gets you the file.
