# API backend — direct OpenAI Images API

The default and most capable backend. Talks to `/images/generations` and `/images/edits` directly via HTTPS, written in Python with zero third-party dependencies (urllib only).

## When to use

- You have an OpenAI API key with GPT Image access.
- You need full feature parity: edits, masks, multi-reference composition, custom resolutions, parallel batches, quality tiers, transparent backgrounds.
- You want generation under ~15 seconds per image.

## When NOT to use

- You're paying for ChatGPT Plus/Team and want generation included in that — use the codex backend, or `--backend codex-images` if you don't want the codex agent in the loop.
- You're shipping pixeltamer to a teammate who doesn't have an API key — point them at codex too.

## Codex-images mode (subscription quota, no API key)

`--backend codex-images` reuses this same Python client but swaps the transport: requests go to `https://chatgpt.com/backend-api/codex/images/{generations,edits}` with the codex CLI's OAuth token from `~/.codex/auth.json` (headers: `Authorization: Bearer`, `ChatGPT-Account-ID`, `originator: codex_exec`, a codex-shaped user-agent). Multipart is refused by that route — edits/compose are sent as JSON with `images[].image_url` data URIs.

What works (probed live 2026-11-09; see `images26-migration.md` item 11 for the wire contract):

- `generate` / `edit` / `compose` on `gpt-image-2.6-flare`, PNG output
- `--background transparent` — real alpha, and the measured-alpha postcondition still runs
- `--quality`, `-n` (true parallel HTTP), `--model` passthrough (non-default models get an "unverified on this route" note)

What's refused before any network call, each with its own error: `--output-format` other than png, `--frames`/`--frame-ms`, `--mask`, `--complexity`, `--input-fidelity`, `--output-compression`, `--moderation`, `--user`. `--size` is dropped with a stderr note — the service picks the canvas.

Operational notes:

- 401 means the OAuth token expired. Run any `codex` command (it refreshes `auth.json`), then retry. Pixeltamer never refreshes in place — an in-memory refresh would rotate tokens behind codex's back and break its session.
- 403 usually means Cloudflare blocked the request before it reached the image service.
- The base URL is pinned and enforced: `PIXELTAMER_CODEX_IMAGES_BASE` is rejected unless it points at 127.0.0.1/localhost (a test capture server), `.env` files may not set `PIXELTAMER_*` keys at all, and cross-origin redirects are refused rather than followed — a 30x pointing at another host would otherwise carry the bearer token with it.
- Token path override for tests: `PIXELTAMER_CODEX_AUTH_JSON`.

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

Default: `gpt-image-2.6-flare` (as of the Images 2.6 rollout, 2026-11). Flare is the fast variant — roughly 6s at low quality — and does poster and product layouts well. Sunburst is the quality variant: better output and edit consistency at medium/high quality.

Use Sunburst when output quality or edit precision matters more than speed:

```bash
OPENAI_IMAGE_MODEL=gpt-image-2.6-sunburst pixeltamer generate -p "..." -o final.png
```

`OPENAI_IMAGE_MODEL` changes the default for every API subcommand. Per-call `--model` wins over the environment:

```bash
pixeltamer generate --model gpt-image-2.6-sunburst -p "..." -o final.png
```

Available OpenAI model IDs include:

- `gpt-image-2.6-flare` — default; fast everyday generation, poster/product layouts, GIF and SVG output.
- `gpt-image-2.6-sunburst` — best quality and edit consistency at medium/high quality; slower.
- `gpt-image-2.5-flare` / `gpt-image-2.5-sunburst` — previous generation; still the choice when a proxy hasn't shipped 2.6, or when you need `--input-fidelity` on edits (2.6 drops it).
- `gpt-image-2` — older model; useful as a migration baseline or rollback.
- `gpt-image-1.5`, `gpt-image-1`, `gpt-image-1-mini` — older compatibility choices.

Both 2.5 aliases currently point at dated `2026-09-08` snapshots. Use the undated alias for automatic upgrades, or the dated ID when repeatability matters.

### Images 2.6 extras

- `--complexity low|medium|high` — planning depth before rendering. Default high (server-side); lower is faster and suits focused edits. 2.6-only: passed with an older model, the client refuses instead of paying for a 400.
- `--output-format gif` — animated GIF on generations AND edits (reference-image → GIF works). Pair with `--frames 2-16` and `--frame-ms 20-2000` (API rounds to 10ms). Without the flags you get the server defaults (9 frames, 200ms). With a GIF target, `--size` is per-frame and the total pixel budget covers every frame.
- Transparent + GIF is refused: GIF transparency is binary palette transparency, not alpha, and pixeltamer can't verify it. Use png/webp for cutouts.
- `--input-fidelity` must be dropped on 2.6 edits — the API rejects requests that carry it. The client refuses up front and points at 2.5.
- `--output-format svg` — vector export on 2.6 models. Pairs with `--background transparent` (sent as requested, but SVG has no raster alpha channel — pixeltamer can't verify it and says so). SVG on `edit`/`compose` is not documented by OpenAI either way; if you hit a 400, fall back to PNG and vectorize.
- See `references/images26-migration.md` for the full contract and what's still unverified.

## Endpoints used

| Subcommand | HTTP | Endpoint | Purpose |
|---|---|---|---|
| `generate` | POST | `/images/generations` | text → image |
| `edit` | POST | `/images/edits` | 1 source image (+ optional mask) → modified image |
| `compose` | POST | `/images/edits` | 2–16 reference images → blended composition |

`compose` and `edit` hit the same endpoint; the difference is one source image vs. many.

## Sizes

Any WxH satisfying:
For GPT Image 2 and 2.5:

- max edge ≤ 3840px
- both edges multiples of 16
- long:short ratio ≤ 3:1
- total pixels from 655,360 through 8,294,400 (≈ 4K landscape at the upper bound)

Custom hosts keep their own minimum-size rules; pixeltamer only applies the 655,360-pixel floor to known GPT Image 2/2.5 model IDs.

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

`low | medium | high | xhigh | max | auto | standard | hd`

GPT Image 2.5 supports `low`, `medium`, `high`, `xhigh`, `max`, and `auto`. `high` remains pixeltamer's production default. `standard` and `hd` stay available for older models and compatible hosts. Pick the model first, then raise quality only if the result misses a concrete requirement.

## Parallel batches (`-n N`)

`-n 4 --concurrency 4` fires four independent single-image calls in parallel rather than asking the API for `n=4` in one request. Two reasons:

1. Faster wall-clock (concurrent network I/O).
2. Works against hosts that don't honor `n>1` in a single call.

Each parallel call is independent — partial failures don't take down the batch. You'll get N output files on disk if N succeeded.

## Retry / backoff

Built into `_send`. Retries 4 times on `429` (rate limit) and `5xx` errors with exponential backoff (1s, 2s, 4s, 8s + jitter). Surfaces `4xx` errors immediately — no point retrying a malformed request.

If a `403` comes back, pixeltamer adds a hint pointing at https://platform.openai.com/settings/organization/general — the most common cause is missing GPT Image organization verification.

## Transparency and output format

```bash
pixeltamer generate -p "<isolated subject>" --background transparent -o icon.png
pixeltamer generate -p "..." --output-format webp --output-compression 85 -o hero.webp
```

| Flag | Values | Notes |
|---|---|---|
| `--background` | `transparent` \| `opaque` \| `auto` | Supported by both GPT Image 2.5 models. Auto-pins `--output-format png` |
| `--output-format` | `png` \| `jpeg` \| `webp` | Maps to the API's `output_format`. gpt-image models only |
| `--output-compression` | `0`–`100` | jpeg / webp only; ignored for png |
| `--input-fidelity` | `high` \| `low` | edit / compose only. Optional fidelity control where supported; `high` preserves faces, logos, and texture |
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
| `HTTP 403` | Org not verified for GPT Image models | Verify at platform.openai.com |
| `HTTP 429` | Rate limit | Pixeltamer retries automatically; if it surfaces, your account hit a hard cap |
| `HTTP 400 — invalid size` | Out-of-range WxH | Stay under 3840px max edge, multiples of 16, ≤3:1 ratio |
| Empty `data` array | Content moderation rejected | Rephrase and drop the element that tripped it. `--moderation low` is the escape hatch where your account allows it — it loosens filtering, it doesn't disable it |
| Opaque PNG despite `--background transparent` | Prompt described a backdrop / scene / cast shadow — prompt text outranks the flag | Strip environment words, add the constraint block from `references/transparency.md` |
| Faces or logos come back "similar but wrong" on a GPT Image 2.5 edit | Model drift despite high-fidelity input processing | Put the critical reference first; use Sunburst; restate exact identity/geometry constraints |
| `HTTP 400` mentioning `background` | Compatible host or selected older model doesn't support transparency | Use a GPT Image 2.5 model, or fall back to chroma-key + `post-process.md` |
| Timeout (10 min default) | Very large size + high quality | Drop to `--quality medium` while iterating |

## Env file loading

At startup, pixeltamer's API backend looks for `.env` files in (first match wins, doesn't override existing env):

1. `./.env` (current working directory)
2. `~/.config/pixeltamer/.env`
3. `~/.claude/.env`
4. The script's directory and its parent

So you can drop credentials in any of these without exporting in your shell profile.
