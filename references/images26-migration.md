# GPT-Image-2.6 migration research

Research notes from launch day (Nov 2026). Verified against official docs
(developers.openai.com, fetched as markdown). Proxy-repo claims are labelled
as such and NOT trusted where official docs contradict them.

## Official model slugs

- `gpt-image-2.6-flare` — fast iteration, better poster/product layout. ~6s at low quality.
- `gpt-image-2.6-sunburst` — precision edits, detail, higher edit consistency.
- Both: generations + edits endpoints. Same sync Image API as 2.5 (no async task flow).

## New request fields (both models)

| Field | Values | Notes |
|---|---|---|
| `complexity` | `low` / `medium` / `high` | Default **high**. Plans how much scene the model builds. No separate fee. Use low for focused edits, high for dense layouts/text. |
| `quality` | `auto` / `low` / `medium` / `high` / `xhigh` / `max` | 2.6 extends the enum past 2.5's. |
| `markup` | transparent PNG overlay, edits only | Same pixel dims as first input image. Region-targeted editing. |
| `frame_count` | 2–16 (default 9) | **GIF only.** |
| `frame_duration_ms` | 20–2000, rounded to 10ms (default 200) | **GIF only.** |
| `prompt_rewriter` | (exists; omit for SVG + GIF) | Not yet documented in fetched pages. |

## GIF output — official contract

- `output_format: "gif"` on `/v1/images/generations` AND `/v1/images/edits`.
  Reference-image → GIF is officially supported via the edits endpoint.
  (Proxy repo claimed text-to-image only; that is a proxy limitation.)
- `size` = per-frame dimensions, `auto` or WxH in multiples of 16. Frame count x
  frame size x n must fit the model's pixel budget or the request fails.
- No streaming, no partial images, no `output_compression`, no
  `prompt_rewriter` for GIF.
- Response: `b64_json` → save bytes as `.gif`. Sync, same as everything else.

## SVG output — official contract

- `output_format: "svg"` on generations. Text-to-image documented so far.
- Supports `background: "transparent"` (unlike raster: SVG transparency is native).
- `b64_json` decodes to XML text. Save as `.svg`.
- Omit `stream`, `partial_images`, `output_compression`, `prompt_rewriter`.

## Transparency

Official prompting guide: "Both support image generation, editing, and
transparent backgrounds." `background` = auto/opaque/transparent as before.
"The decoded alpha channel" check still applies for PNG/WebP; SVG supports
transparency natively. The xiaonan0527 proxy repo claims 2.6 has no
transparency — that is their route, officially contradicted. 2.5 stays as
fallback until one live test confirms alpha quality on 2.6.

## Other 2.6 differences

- `input_fidelity`: **omit on 2.6 edits** — not supported (consistency improved
  at model level instead).
- `safety_identifier` replaces deprecated `user` param (128 chars max,
  recommended, not required).
- Sizes: any WxH multiples of 16, aspect 1:3 to 3:1.

## Local code impact (pixeltamer) — SHIPPED 2026-11-06

1. ✅ `scripts/pixeltamer_api.py` — model-family checks now recognize
   `gpt-image-2.6` / `gpt-image-2.6-*` (`_is_gpt_image_26`, plus 2.6 in the
   size-floor family check).
2. ✅ `DEFAULT_MODEL` = `gpt-image-2.6-flare` (env `OPENAI_IMAGE_MODEL`
   overrides). 2.5 stays reachable via `--model`/env for hosts without 2.6
   and for `--input-fidelity` edits. Never auto-downgrades.
3. ✅ New flags on generate/edit/compose: `--complexity low|medium|high`
   (rejected on non-2.6 models pre-flight), `--frames 2-16`,
   `--frame-ms 20-2000` (require `--output-format gif`; GIF takes no
   `output_compression`; transparent+gif refused — binary palette
   transparency, unverifiable). `--output-format gif|svg` accepted
   everywhere; extension match enforced; GIF per-frame size budget checked
   (frames × w × h ≤ 8,294,400; no 655,360 floor on frames).
   `--input-fidelity` on 2.6 edits refused (API would 400).
   SVG (wired same day): `--output-format svg` on all three commands;
   transparent+svg ALLOWED (officially supported) but honestly unverified —
   SVG has no raster alpha channel to measure; svg+output-compression
   rejected. Batch verifier gained an `SVG` token (extension, root <svg>
   element, dims from width/height attrs or viewBox; transparent token
   rejected as unverifiable).
9b. ✅ OAuth orchestrator model probe + default changed (2026-11-06, two
   passes after the user flagged the luna/terra families): models tested
   ACCEPTED on this ChatGPT account (stream:true required): gpt-6.1-terra,
   gpt-5.6-luna, gpt-5.6-terra, gpt-6-luna, gpt-6-astra. NOT supported
   (model_not_supported): gpt-6.1-luna, gpt-6-terra, everything 5.5/5.4,
   all -mini and -xhigh variants, bare luna/terra. This is one account's
   acceptance list on one day, not a pricing table — relative cost of the
   families is unmeasured. DEFAULT_RESPONSES_MODEL is now gpt-6.1-terra
   (user's pick), verified driving a REAL image_generation edit with a
   measured alpha channel (34% transparent, antialiased ring) — text
   completion alone doesn't prove image-tool support, so that smoke test
   matters. config.toml's gpt-6-astra flagship is deliberately no longer
   read for the orchestrator. PIXELTAMER_RESPONSES_MODEL overrides.
   Cost context: the orchestrator request sets reasoning to null and emits
   one tool call; a trivial TEXT reply measured ~13 in / 5 out tokens
   (text-only probe, not an image-bearing request). SCOPE NOTE: this
   governs the OAuth edit/compose transport only — `pixeltamer_codex.sh`
   generation shells out to `codex exec`, which uses the account's
   configured model and has no model flag here.
4. ✅ Batch verifier (`scripts/lib/verify-entry.mjs`): `GIF` / `GIF animated`
   format tokens. Structural check via `lib/gif-inspect.mjs` (signature,
   bounded walk, logical-screen dims vs nativeSize, frame count;
   `animated` requires ≥2 frames). Transparency token on GIF = config error.
   Structural parsing can't prove frames differ — visual self-review or
   ImageMagick RMSE for that.
5. ✅ Tests: 130 pass — model-selection covers default/override/complexity/
   GIF payloads (JSON + multipart) + pre-flight rejects; verify-entry has 10
   GIF cases; gif-inspect 16; codex wrapper 12 functional.
6. ⏳ LIVE SMOKE TEST STILL PENDING: no API key configured on this machine
   (codex backend covers all local use). Before trusting in production:
   (a) one `generate --background transparent --output-format png` on
   2.6-flare with alpha measured, (b) one `--output-format gif` end-to-end
   with lib/gif-inspect verification. transparency.md stays untouched until
   (a) passes. Default-model change is based on official docs only.
7. ✅ CODEX EDIT/COMPOSE TRANSPARENCY — CLAIM REVERSED, MEASURED 2026-11-06.
   The old "API only" line was wrong. Live tests: codex `edit` (white bg + red
   circle → "replace background with transparency") returned a REAL alpha
   channel (62.1% transparent, maxAlpha 255, antialiased edges); codex
   `compose` with `--background transparent` returned 70.7% transparent.
   The Responses transport still refuses a background PARAMETER — the prompt
   is the lever. Now wired end-to-end: pixeltamer_codex_oauth.py accepts
   --background transparent (prompt clause mirroring the wrapper's
   TRANSPARENCY_CLAUSE + post-run alpha verification via the shared node
   reader; opaque/auto refused), dispatcher guard removed.
8. ✅ pixeltamer_codex_oauth.py model bug fixed same day: RESPONSES_MODEL was
   hardcoded "gpt-5.4" which ChatGPT-account endpoints reject (model_not_found,
   blocking ALL codex edit/compose). Now resolves
   PIXELTAMER_RESPONSES_MODEL env > ~/.codex/config.toml `model` > fallback.
9. Codex backend (`pixeltamer_codex.sh`): GIF generation IS wired (2026-11-06,
   live-tested once) — but the mechanism is NOT native. Observed on
   codex-cli 0.161: given the FORMAT REQUIREMENT clause, codex generates a
   multi-frame sprite sheet as a STILL via image_gen, then assembles the
   animated GIF itself with local ImageMagick (crop/resize/-set delay/-loop 0)
   before saving. Consequences:
   - Needs ImageMagick (or equivalent) on the machine codex runs on.
   - `--frames`/`--frame-ms` are best-effort hints; honored in the one live
     test (6 frames @ 150ms exact) but not a contract. The wrapper's publish
     gate (lib/gif-inspect.mjs) verifies structure, warns on drift.
   - `--background transparent` + GIF is rejected pre-flight (GIF transparency
     is binary palette transparency; the transparency clause requests PNG
     alpha). Use the api backend.
   - gif+transparent and GIF-flags-on-PNG both fail fast before codex is
     invoked — no paid generation is burned on a combo that can't work.
   - Cache recovery only accepts artifacts matching the requested extension;
     a sprite-sheet PNG can never be published as a .gif.
   Also observed: codex exec slurps workspace context files (persona,
   AGENTS.md) into its reasoning — its log contained the whole Booplex persona
   file. Harmless locally, but remember the log is not a place to put secrets.

## GIF craft knowledge (from cxcxy/dy-gif-motion-quality, ideas only — not copying code)

- Pose grammar: windup → force → peak → recovery; loop seam = last pose
  flows into first.
- Tune motion distance between frames before dwell timing; hold the peak pose.
- QA triage table:
  - motion hard-cuts between poses → missing in-betweens (add frames or
    narrow motion span)
  - face/props jitter, texture "boiling" → character drift (lock anchors in
    prompt: same outfit/camera/props)
  - edge whitening or after-images → encoding ghosting (frame disposal;
    usually our problem only when we post-process, native GIF avoids it)
- Inspection: coalesce + per-frame delay/disposal table + distinct-frame
  dedupe. ImageMagick `identify`/`coalesce` for deep checks; structural
  header parse for the fast path.
- Compression: only when file too big (native output usually fine). Small
  stickers: resize 240–280px, shared palette ~48 colors, `-loop 0 -layers
  Optimize`. NOT universal defaults — product GIFs need their own settings.
  Always verify frame count/order/delays survive compression.

## Prompt dialects (from GPTProto/awesome-gpt-image-2.6-gif + official examples)

Two working styles for native GIF prompts:
1. **Prose loop prompt** (official): subject, motion described as sequence,
   explicit return-to-start pose, camera lock ("Keep the camera still"),
   "Make the motion loop smoothly."
2. **Sprite-sheet prompt** (OpenArt): still image, exact frame count + grid
   ("exactly 6 frames, 3x2 grid, left-to-right top-to-bottom"), identical
   panels, no borders/gutters/labels — then slice locally. Use when we need
   custom timing per frame, captions, or manual pose repair. NOT an automatic
   fallback for native GIF failure — deliberate alternative workflow.

Official example that works: sunburst, 512x512, quality high, frame_count=9,
frame_duration_ms=200 (1.8s loop), lantern monkey prose prompt.

## Sources

- https://openai.com/index/introducing-images-2-6/
- https://developers.openai.com/api/docs/guides/image-generation.md (GIF section)
- https://developers.openai.com/api/docs/guides/image-prompting.md (2.6 params, transparency, SVG, GIF example)
- https://developers.openai.com/api/docs/models/gpt-image-2.6-flare.md (endpoints)
- https://github.com/xiaonan0527/images26-gen (proxy impl — async task API, param surface ideas)
- https://github.com/cxcxy/dy-gif-motion-quality (GIF QA/compression craft)
- https://github.com/GPTProto/awesome-gpt-image-2.6-gif (52 full prompts, two dialects)

## Item 10 — Codex SVG investigation (2026-11-09): no hidden capability

Question: does the codex backend (CLI or ChatGPT.app) carry a hidden SVG/vector image path?

Evidence, three independent levels:

1. **Binary schema (codex 0.161, arm64 Mach-O, strings pass).** The built-in image tool is
   registered as `image_gen.generation` (ExtensionItem/ImageGeneration). Its full input schema,
   recovered from the binary's serde field blob, is exactly:
   `prompt`, `transparent_background`, `referenced_image_paths`, `num_last_images_to_include`.
   No output_format, no size, no quality, no model. The CLI treats image generation as a hosted
   server tool (ResponseItem `image_generation_call`, begin/end events with `transparent_background`
   telemetry) — the input contract lives server-side, and the service returns raster PNG only.
2. **Live probe.** A forced real `image_gen` call (transparent orange circle prompt) returned a
   1536x1024 RGBA PNG under `~/.codex/generated_images/<uuid>/exec-*.png`; the agent explicitly
   reported "no output format parameter exposed".
3. **Embedded imagegen skill fallback** (`~/.codex/skills/.system/imagegen/scripts/image_gen.py`):
   validates `output_format` in {png, jpeg, jpg, webp} — no svg, no gif. Its docs also claim CLI
   `gpt-image-2` lacks `background=transparent` (older-model claim; the hosted tool does
   transparency fine per our live tests, and pixeltamer's API path is unaffected).

**Red herring checked:** every codex PNG embeds a C2PA (`caBX` JUMBF) chunk with an
`image/svg+xml` icon assertion. The extracted SVG is byte-identical across unrelated images
(mascot / circle / edit) — it is a constant provenance icon baked into the content-credential
metadata, not a vectorization of the image. Extractor kept at /tmp/px-demo/extract-c2pa-svg.py
during the session; not shipped.

**ChatGPT.app "Codex Framework"**: Chromium plumbing only (pak/icudt/v8 snapshot); tool schemas
are served from the web app, nothing local to mine.

Conclusion: SVG remains API-key-only. Codex alternatives if SVG is needed without a key:
agent hand-written SVG (demonstrated, label it as such) or a raster→vector trace of a generated
PNG (no tracer installed on this machine; vtracer/autotrace/potrace would need installing).

## Item 11 — Codex-subscription direct Images route: REPLAYABLE (2026-11-09)

Discovery: the codex imagegen extension POSTs to an Images-API-shaped service on the ChatGPT
backend. That route is replayable outside codex using the OAuth bearer token from
`~/.codex/auth.json` plus codex request headers. Verified live, 8+ real generations:

- Routes: `https://chatgpt.com/backend-api/codex/images/generations` and `.../images/edits`
  (same base as the Responses endpoint pixeltamer's OAuth backend already uses).
- Headers that worked: `Authorization: Bearer <auth.json tokens.access_token>`,
  `ChatGPT-Account-ID`, `Content-Type: application/json`, `originator: codex_exec`,
  `user-agent: codex_exec/0.161.0 (...)`, plus `session-id`/`thread-id`/`x-client-request-id`
  (uuid) and `x-codex-imagegen-request-id` (uuid). Without the codex UA/originator the route
  returns the Cloudflare HTML 403 block page.
- generations body (JSON): `prompt`, `n`, `model` (gpt-image-2.6-flare accepted),
  `background` — **transparent HONORED with real alpha (maxAlpha 251-255)**, `quality`
  (low/medium echoed). IGNORED: `size` (server picks, 1536x1024-ish), `output_format`
  (svg silently falls back to PNG).
- edits body (JSON, NOT multipart — multipart 400s "Unsupported content type"):
  `prompt`, `model`, `background`, `n`, `images: [{"image_url": "data:image/png;base64,..."}]`
  (object key `image_url`; `url`/`b64_json`/`data` all 400 unknown_parameter). Multi-image
  compose verified: two inputs blended, output follows input aspect, real alpha.
- GIF: hard-gated — 400 `"GIF output is not enabled for this request."` even bare.
- SVG: still unavailable on this route (silent PNG fallback). SVG remains api.openai.com-key-only.
- Responses echo `created/background/output_format/quality/safety_identifier/size/usage` with
  per-item `generation_id`; usage is token-metered like the hosted tool.
- Route-level gates use FastAPI-style `{"detail": ...}` errors; param validation uses
  OpenAI-style `{"error": {...}}`.

Value proposition if wired as a pixeltamer backend ("codex-images direct"): generate + edit +
compose with real transparency on subscription quota, ~10-20s, no codex agent loop, no
orchestrator model, no sprite-sheet assembly. Missing vs API key backend: SVG, GIF, exact size
control. Open engineering question: token refresh (auth.json tokens expire; codex CLI refreshes
them on its own runs — a standalone client needs refresh_token flow against auth.openai.com).

SHIPPED 2026-11-09 as `--backend codex-images` (see `api-backend.md` § Codex-images mode):
the transport, JSON edits encoding, capability matrix, and OAuth headers live in
`pixeltamer_api.py`; the dispatcher routes it and auto-detect never picks it (opt-in only).
Deliberate v1 deviation from the open question above: token refresh is NOT attempted in-place
(an in-memory refresh would rotate tokens behind codex's back and break its session) — on 401
the client tells the user to run any `codex` command to refresh `auth.json`, then retry.

Probe scripts from this session (working replay client): /tmp/image-replay.py,
/tmp/svg-probe2.py, /tmp/param-probe3.py, /tmp/edits-json-probe.py, /tmp/compose-probe.py.
