# API backend — direct OpenAI Images API

The default and most capable backend. Talks to `/images/generations` and `/images/edits` directly via HTTPS, written in Python with zero third-party dependencies (urllib only).

## When to use

- You have an OpenAI API key with gpt-image-2 access.
- You need full feature parity: edits, masks, multi-reference composition, custom resolutions, parallel batches, quality tiers, transparent backgrounds.
- You want generation under ~15 seconds per image.

## When NOT to use

- You're paying for ChatGPT Plus/Team and want generation included in that — use the codex backend instead.
- You're shipping pixeltamer to a teammate who doesn't have an API key — point them at codex too.

## Auth

Pixeltamer reads (in order):

1. `OPENAI_IMAGE_API_KEY` — preferred, image-specific
2. `OPENAI_API_KEY` — fallback

Set whichever you prefer. The image-specific one exists so you can route image traffic through a different account/proxy than your text traffic.

## Base URL

Defaults to `https://api.openai.com/v1`. Override with:

- `OPENAI_IMAGE_BASE_URL` — preferred
- `OPENAI_BASE_URL` — fallback

This is how you point pixeltamer at proxies and OpenAI-compatible hosts (jmrai.net, ZenMux, OpenRouter image endpoints, etc.). The wire protocol is the same; only the URL changes.

## Model

`OPENAI_IMAGE_MODEL` overrides the default `gpt-image-2`. Other supported models on the OpenAI host: `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini`. Drop down for speed/cost on iteration loops, swap back to `gpt-image-2` for final renders.

## Endpoints used

| Subcommand | HTTP | Endpoint | Purpose |
|---|---|---|---|
| `generate` | POST | `/images/generations` | text → image |
| `edit` | POST | `/images/edits` | 1 source image (+ optional mask) → modified image |
| `compose` | POST | `/images/edits` | 2–16 reference images → blended composition |

`compose` and `edit` hit the same endpoint; the difference is one source image vs. many.

## Sizes

Any WxH satisfying:
- max edge ≤ 3840px
- both edges multiples of 16
- long:short ratio ≤ 3:1
- total pixels ≤ 8,294,400 (≈ 4K landscape)

Common picks:
- `1024x1024` (square, default)
- `1024x1536` (2:3 portrait)
- `1536x1024` (3:2 landscape)
- `2048x2048` (high-res square)
- `3840x2160` (4K landscape)
- `2160x3840` (4K portrait)
- `auto` (let the model pick)

`pixeltamer_api.py` validates dimensions before the API call so a bad size fails fast instead of after a 60-second roundtrip.

## Quality tiers

`low | medium | high | auto | standard | hd`

`auto` lets the model pick. `high` is the production default — it's only meaningfully more expensive than `low` on official OpenAI billing; many compatible hosts charge the same across tiers.

## Parallel batches (`-n N`)

`-n 4 --concurrency 4` fires four independent single-image calls in parallel rather than asking the API for `n=4` in one request. Two reasons:

1. Faster wall-clock (concurrent network I/O).
2. Works against hosts that don't honor `n>1` in a single call.

Each parallel call is independent — partial failures don't take down the batch. You'll get N output files on disk if N succeeded.

## Retry / backoff

Built into `_send`. Retries 4 times on `429` (rate limit) and `5xx` errors with exponential backoff (1s, 2s, 4s, 8s + jitter). Surfaces `4xx` errors immediately — no point retrying a malformed request.

If a `403` comes back, pixeltamer adds a hint pointing at https://platform.openai.com/settings/organization/general — the most common cause is "your org isn't verified for gpt-image-2 yet."

## Output

Pixeltamer prints **absolute paths**, one per line, on stdout. Errors go to stderr. So you can pipe:

```bash
pixeltamer generate -p "..." | xargs open  # macOS open every output
pixeltamer generate -p "..." -n 4 | head -1  # grab the first
```

## Common errors and fixes

| Error | Likely cause | Fix |
|---|---|---|
| `HTTP 401` | Bad / missing API key | Re-check `OPENAI_IMAGE_API_KEY` |
| `HTTP 403` | Org not verified for gpt-image-2 | Verify at platform.openai.com |
| `HTTP 429` | Rate limit | Pixeltamer retries automatically; if it surfaces, your account hit a hard cap |
| `HTTP 400 — invalid size` | Out-of-range WxH | Stay under 3840px max edge, multiples of 16, ≤3:1 ratio |
| Empty `data` array | Content moderation rejected | Rephrase, drop sensitive elements |
| Timeout (10 min default) | Very large size + high quality | Drop to `--quality medium` while iterating |

## Env file loading

At startup, pixeltamer's API backend looks for `.env` files in (first match wins, doesn't override existing env):

1. `./.env` (current working directory)
2. `~/.config/pixeltamer/.env`
3. `~/.claude/.env`
4. The script's directory and its parent

So you can drop credentials in any of these without exporting in your shell profile.
