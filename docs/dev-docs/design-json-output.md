# Design review — structured (`--json`) output

**Status:** proposed, not built. Parked for 0.7.0.
**Reviewer:** codex (gpt-5.6), asked 2026-08-25 with the full cost picture.

## Why this exists

pixeltamer is invoked almost entirely by agents, not humans at a terminal. It
currently prints absolute paths on stdout and prose to stderr, so an agent that
wants to know anything about what it just made has to re-open the file. The idea
was a `--json` mode returning the result plus alpha diagnostics, since the
signature failure of transparent generation is silent — a valid RGBA file where
every pixel is opaque.

The review below pushed back on the shape hard enough to change it. Recorded
verbatim so the eventual implementation argues with the real thing rather than
my summary of it.

## The proposal that was reviewed

```json
{"ok": true, "path": "/abs/asset.png", "backend": "codex",
 "width": 1024, "height": 1024, "bytes": 217043,
 "alpha": {"present": true, "transparent_pct": 62.9, "partial_pct": 1.9}}
{"ok": false, "error": {"code": "invalid_size", "message": "..."}}
```

Cost: ~75 error-exit sites across four files in three languages. A
`--json-events` progress stream was deliberately excluded.

## What the review changed

- **`path` → `outputs: []`.** We support `-n` with auto-suffixed filenames, so a
  singular path breaks on the first multi-variant call. Verified: real.
- **`alpha.present` is ambiguous** in exactly the way that matters — an RGBA file
  with every pixel opaque would report `present: true`. Split into
  `channel_present` and `has_non_opaque_pixels`.
- **Exit codes are not 0/1**, which is what the brief claimed. The repo uses `2`
  for usage errors, `124` for timeouts, `127` for missing codex auth. Verified in
  `scripts/pixeltamer_codex.sh`. JSON `ok` and exit status must stay
  independently reliable.
- **`batch` produces images too.** Scoping to three commands leaves a fourth
  image-producing entry point emitting prose in JSON mode.
- **Transparency should be a postcondition, not a warning.** If
  `--background transparent` yields an all-opaque image, that's
  `output_validation_failed`, not `ok: true` with a note.
- **Highest-value missing field: `error.retryable`** (+ optional
  `retry_after_ms`). Also wants `schema_version`, `operation`, `attempts`,
  `duration_ms`. Calls `bytes` the weakest proposed field.
- **Don't hand-write 75 serializers.** One typed result/error layer per language
  boundary, with `internal_error` as a guaranteed fallback — because a
  half-typed surface is worse than prose if untyped failures can still escape.
- **Centralize image inspection.** Don't implement alpha semantics separately in
  bash, Python and Node.

Agreed with: excluding percent-progress, on the grounds that no honest
percentage exists for a 60–90s model call. Suggested `duration_ms` + `attempts`
in the final object instead.

---

## Full review, verbatim

1. `--json` on `generate`, `edit`, and `compose` is the right core scope, but it is not the whole CLI protocol.
   This repo also has `batch`, which produces images. Either give `batch --json` an aggregate result schema or reject it with a deterministic JSON error. Never let an agent accidentally get prose from one image-producing entry point.
   In JSON mode, every failure path must emit the envelope—including dispatcher failures, backend selection, capability checks, argument parsing, timeouts, write failures, and uncaught exceptions. A JSON mode with one stray `argparse` message is broken.
   Don’t hand-type 75 bespoke codes first. Add a result/error boundary in each language and use `internal_error` as the safe fallback. Refine common paths afterward.
2. Excluding percentage progress is right.
   There is no meaningful trustworthy percentage for a 60–90 second model call. Agents generally need the process to finish, not a fake progress bar.
   I would still leave room for an opt-in lifecycle stream later, with events such as `request_started`, `retry_scheduled`, and `output_saved`. No percent. The final object should include `duration_ms` and `attempts`, which covers most useful observability without creating a second protocol.
   If the host kills commands that produce no output for a long time, add a heartbeat separately. Don’t invent model progress to solve that problem.
3. The highest-value missing field is `error.retryable`, with optional `retry_after_ms`.
   An agent needs to know whether to retry without interpreting the message:
   - `invalid_size`: false
   - `moderation_refused`: false
   - `unsupported_on_backend`: false
   - `rate_limited`: true, with `retry_after_ms`
   - `timeout`: usually true
   - `upstream_error`: conditional; include provider status/details
   Also add `schema_version`. This is a protocol, not just a convenience flag.
   The proposed singular `path` is wrong because the CLI already supports `-n` and can produce multiple files. Use an `outputs` array in requested order:
   ```json
   {
     "schema_version": 1,
     "ok": true,
     "operation": "generate",
     "backend": "api",
     "attempts": 1,
     "duration_ms": 73421,
     "outputs": [
       {
         "path": "/abs/a.png",
         "format": "png",
         "width": 1024,
         "height": 1024,
         "bytes": 217043,
         "alpha": {
           "channel_present": true,
           "has_non_opaque_pixels": true,
           "transparent_pct": 62.9,
           "partial_pct": 1.9
         }
       }
     ]
   }
   ```
   `alpha.present` is dangerously ambiguous. If it means “the file has an alpha channel,” it will report success for an RGBA image whose every pixel is opaque—the exact failure you care about. Separate channel presence from effective transparency.
   `bytes` is the lowest-value listed field. It is useful for diagnostics but not much for agent decisions. Keep it nested under each output or omit it from v1. `format`, `outputs`, `retryable`, and explicit alpha semantics matter more.
4. The proposed error set is too small, but a giant taxonomy is also a mistake.
   Use a small stable set with a generic fallback:
   - `invalid_argument`
   - `input_not_found`
   - `auth_missing`
   - `unsupported_on_backend`
   - `moderation_refused`
   - `rate_limited`
   - `timeout`
   - `upstream_error`
   - `output_error`
   - `output_validation_failed`
   - `internal_error`
   `invalid_size` can remain a useful specific code if agents benefit from fixing it directly; otherwise use `invalid_argument` with `"details": {"field": "size"}`.
   The code is the stable contract. The message is for humans. Provider HTTP status, provider error code, retry-after, backend, and execution stage belong in optional `details`, not in hundreds of new top-level codes.
   A half-typed surface is worse than prose if untyped failures can still appear under `--json`. A typed envelope with `internal_error` is safe. An “exhaustive” code list that silently misses shell exits and parser errors is not.
5. I would change the proposal in four ways:
   - Make JSON a global output contract, accepted consistently by the dispatcher and all three subcommands.
   - Use `outputs: []`, not singular `path`, and define partial-failure behavior for `-n > 1`.
   - Add `schema_version`, `operation`, `attempts`, `duration_ms`, `error.retryable`, and optional `retry_after_ms`.
   - Treat requested transparency as a postcondition. If `--background transparent` produces an entirely opaque image, return `output_validation_failed` with the artifact and alpha diagnostics instead of `ok: true` plus a warning. The agent can then retry with a changed prompt or backend.
   Centralize image inspection across backends. The current Codex path checks whether the PNG format can carry alpha; that is not the same as proving that pixels are actually transparent. Do not implement separate alpha semantics in Bash, Python, and Node.
One concrete compatibility issue: this checkout does not actually have only exit codes `0/1`. The README and scripts use `2`, `124`, and `127` for usage errors, timeouts, and missing Codex authentication. Preserve those meanings or deliberately document a normalization change. JSON `ok` and process exit status should remain independently reliable.
