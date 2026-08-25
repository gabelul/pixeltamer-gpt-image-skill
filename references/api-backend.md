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

## Transparency and output format

```bash
pixeltamer generate -p "<isolated subject>" --background transparent -o icon.png
pixeltamer generate -p "..." --output-format webp --output-compression 85 -o hero.webp
```

| Flag | Values | Notes |
|---|---|---|
| `--background` | `transparent` \| `opaque` \| `auto` | Preview status on gpt-image-2. Auto-pins `--output-format png` |
| `--output-format` | `png` \| `jpeg` \| `webp` | Maps to the API's `output_format`. gpt-image models only |
| `--output-compression` | `0`–`100` | jpeg / webp only; ignored for png |
| `--input-fidelity` | `high` \| `low` | edit / compose only. `high` preserves faces, logos, texture. Only the FIRST `-i` gets the extra texture richness |
| `--format` | `url` \| `b64_json` | **Legacy.** Maps to `response_format`, which gpt-image models ignore — they always return base64. Kept only because OpenAI-compatible proxies may still honour it |

`--background transparent --output-format jpeg` is rejected up front rather than
sent: JPEG has no alpha channel, so the API would happily return an opaque image
and no error. Same guard fires if `-o` ends in `.jpg` while the format is PNG.

See `references/transparency.md` for the prompt rules — the flag alone doesn't
guarantee alpha, since prompt text describing a backdrop overrides it.

## Output

Pixeltamer prints **absolute paths**, one per line, on stdout. Errors go to stderr. So you can pipe:

Two guarantees worth relying on with `-n N`:

- **Nothing reaches stdout until every call has settled.** You will never see a
  half-finished run that then exits non-zero.
- **Paths come out in request order**, not completion order, so `-n 4 | head -1`
  is meaningful.

`-n` is partial-failure tolerant: one call failing doesn't discard the images the
others produced (and you paid for). Exit status carries completeness — `0` when
all N landed, `1` when fewer did, with the specific failures named on stderr.
Every path on stdout is a real file either way.


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
| Empty `data` array | Content moderation rejected | Rephrase and drop the element that tripped it. `--moderation low` is the escape hatch where your account allows it — it loosens filtering, it doesn't disable it |
| Opaque PNG despite `--background transparent` | Prompt described a backdrop / scene / cast shadow — prompt text outranks the flag | Strip environment words, add the constraint block from `references/transparency.md` |
| Faces or logos come back "similar but wrong" on an edit | `input_fidelity` defaults to `low` | Pass `--input-fidelity high`; put the critical reference first |
| `HTTP 400` mentioning `background` | Org or model doesn't have transparency enabled (it's preview on gpt-image-2) | Fall back to chroma-key + `post-process.md` |
| Timeout (10 min default) | Very large size + high quality | Drop to `--quality medium` while iterating |

## Env file loading

At startup, pixeltamer's API backend looks for `.env` files in (first match wins, doesn't override existing env):

1. `./.env` (current working directory)
2. `~/.config/pixeltamer/.env`
3. `~/.claude/.env`
4. The script's directory and its parent

So you can drop credentials in any of these without exporting in your shell profile.
