# Codex backend — generate via the codex CLI's `image_gen` tool

Use this backend when you'd rather pay your existing ChatGPT Plus/Team/Enterprise subscription than top up an OpenAI API account. No API key needed — codex's OAuth-managed session handles auth for you.

## When to use

- You have ChatGPT Plus/Team/Enterprise.
- You don't want to manage an OpenAI API key (or your org won't verify yet).
- You're okay with slower generation (codex's reasoning loop adds latency).
- You only need one-shot generation — edits and multi-reference composition need the API backend.

## When NOT to use

- You need **mask-based inpainting** — the codex Responses API doesn't take a mask parameter, so `--mask` requires the API backend. Other edit and compose modes work fine on codex via the OAuth Responses API path (since 0.3.0); see [gallery #8](../gallery/README.md#8-ai-image-models-comparison--codex-oauth-edit-proof) for proof of text fidelity on a dense infographic.
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
codex reasons, calls its built-in image_gen tool (image model selected by the service)
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
Use your image_generation tool to create <N> image(s).

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

The script logs which pattern won (`pixeltamer_codex.sh: ok (pattern: clean)` or `(pattern: forced)`) so you can spot drift over time. Codex selects the image model for this consumer transport; `OPENAI_IMAGE_MODEL` and `--model` only affect the direct API backend.

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

## `--size` is only honoured for `generate`

The Responses API takes `size` for text-to-image and drops it the moment there's an input image.
`edit` and `compose` come back at the **input's aspect ratio**, at whatever resolution the model
picks — around 850px on the short edge, measured on portrait inputs:

| mode | requested | returned |
|---|---|---|
| `generate` | 1024x1536 | 1024x1536 ✅ |
| `edit` | 2160x3840 | 852x1846 (input aspect) ❌ |
| `compose` | 2160x3840 | 853x1844 (input aspect) ❌ |

pixeltamer does send the value — this is the API's behaviour, not a dropped flag. Both subcommands
now warn on stderr when you pass a `--size` they can't deliver.

What this means in practice: **don't size a downstream crop off the number you asked for.** Read the
actual output dimensions, or resize yourself afterwards. If you need a guaranteed output size for an
edit, use `--backend api` — `/v1/images/edits` accepts `size` properly.

Corollary worth knowing if you're building a pipeline: because edits come back small, anything you
upscale afterwards gets softer. Text especially. If you already own the text (you composited it in
before the edit), composite it back on *after* the upscale rather than round-tripping it through the
model — image models re-render text rather than preserving it.

## Caveats

- This uses the consumer ChatGPT subscription endpoint via `codex exec`. Programmatic use of consumer subscriptions sits in a grey area of OpenAI's terms; check before scripting heavy automated batches.
- Output file path parsing depends on codex printing the path. If a future codex version changes its stdout format, the recovery fallback (scanning `~/.codex/generated_images/` for the newest PNG) still gets you the file.

## Token expiry on the OAuth path

`generate` goes through the `codex` CLI, which manages its own auth — nothing to
think about.

`edit` and `compose` go through `pixeltamer_codex_oauth.py`, which reads the
access token out of `~/.codex/auth.json`. What happens when that token expires
depends on **who owns the auth**, and that's decided by where the request is
going:

| Endpoint | On `401 token_expired` |
|---|---|
| Upstream `chatgpt.com` | One refresh, one retry. Recovers silently. |
| A proxy / load balancer | Surfaced, with a pointer at the proxy. We don't refresh. |

The proxy case is the interesting one. If you run something like
`[model_providers.codex-lb]` with a local `base_url`, that thing owns auth,
rotation and multi-account fallback. Our copy of the token isn't necessarily even
the account it wants in play, so minting a fresh one and retrying would fight it.
A 401 from a proxy means check the proxy, not check your login.

Two deliberate limits on the upstream path:

- **The refresh is in-memory only.** `auth.json` belongs to the codex CLI, and
  rotating the token underneath it risks breaking a login we don't own. The cost
  is one extra refresh next invocation; the alternative risks your session.
- **One refresh per run.** A second 401 after refreshing is something other than
  expiry, and looping would burn quota. The refreshed retry is granted on top of
  the `--max-retries` budget rather than deducted from it, so `--max-retries 0`
  still gets its one recovery.

## `unknown arg` on a flag the docs describe

Stale install, nearly always — not a wrong command. The skill you run is a copy,
not a link to the repo. See the "documented flag doesn't exist" entry in
`docs/dev-docs/troubleshooting.md` before changing anything about the call.
