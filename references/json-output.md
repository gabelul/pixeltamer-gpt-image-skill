# `--json` — structured output for agents

pixeltamer is driven by agents far more than by people at a terminal. `--json`
gives them a result they can branch on instead of a path they have to re-open a
file to understand.

```bash
pixeltamer generate -p "..." --background transparent --json -o asset.png
```

## The one guarantee

**In `--json` mode, stdout carries exactly one JSON object. Always.** Success,
bad flag, missing auth, upstream 500, an unhandled exception in our own code —
one object, every time. A caller writes `JSON.parse(stdout)` and it does not
have an unlucky branch.

Everything human — warnings, retry notices, progress — stays on stderr, where it
always was. The two streams never mix.

Available on `generate`, `edit` and `compose`. `batch` refuses the flag *in the
contract's own shape* (`unsupported_on_backend`) rather than ignoring it and
printing prose, because silently answering a JSON request with text is the one
failure this design exists to prevent.

## Success

```json
{
  "schema_version": 1,
  "ok": true,
  "command": "generate",
  "backend": "codex",
  "duration_ms": 61234,
  "outputs": [
    {
      "path": "/abs/asset.png",
      "bytes": 217043,
      "format": "png",
      "width": 1024,
      "height": 1024,
      "alpha": {
        "present": true,
        "measured": true,
        "transparent_pct": 62.9,
        "partial_pct": 1.4
      }
    }
  ]
}
```

`outputs` is an array because `-n` exists. It is an array even when there is one
file, so callers never need two code paths.

## Failure

```json
{
  "schema_version": 1,
  "ok": false,
  "command": "generate",
  "backend": "api",
  "duration_ms": 412,
  "outputs": [],
  "error": {
    "code": "invalid_size",
    "message": "both edges must be divisible by 16 (width=1000, height=1000). Nearest valid: 992x992",
    "retryable": "no",
    "field": "size"
  }
}
```

`outputs` is still present on failure, and it is not always empty — a partial
`-n` run reports the files that did land. They exist and they cost money;
pretending the run produced nothing would be a lie the caller pays for.

## `alpha` — and why `measured` matters

The signature failure of transparent generation is silent: a valid RGBA file
where every pixel is opaque, because the prompt described a backdrop. Reading
the header cannot see it. So the numbers here come from decoding pixels.

| Field | Meaning |
|---|---|
| `present` | the file carries alpha at all (channel, or palette + `tRNS`) |
| `measured` | whether we actually decoded pixels to get the percentages |
| `transparent_pct` | share of fully transparent pixels, or `null` if unmeasured |
| `partial_pct` | share of partial alpha — soft edges, glass, smoke |

**`measured: false` gives you `null`, never `0`.** Zero would read as "definitely
opaque" when the truth is "we could not tell". Those are different, and only one
of them justifies a retry.

## The transparency postcondition

Asking for `--background transparent` and receiving an opaque image is a
**failure**, not a success with a caveat:

```json
{"ok": false,
 "error": {"code": "alpha_not_observed", "retryable": "no",
           "opaque_outputs": ["/abs/asset.png"]}}
```

`ok: true` means the asset contract was met, not that bytes reached the disk.
The file is still written and still listed in `outputs` — it cost a generation —
but the exit status and the envelope both say what happened. The fix is almost
always the prompt: see `transparency.md`.

## Error codes

Stable identifiers. Branch on `code`; `message` is for humans and may be
reworded at any time.

| Code | Meaning | `retryable` |
|---|---|---|
| `invalid_size` | size violated a documented constraint | `no` |
| `invalid_argument` | bad flag, bad combination, argparse rejection | `no` |
| `input_not_found` | a `-i`/`--mask` file doesn't exist | `no` |
| `auth_missing` | no API key or codex login | `no` |
| `unsupported_on_backend` | the flag is real but this backend can't honour it | `no` |
| `moderation_refused` | the provider declined the prompt | `no` |
| `rate_limited` | slow down | `yes` |
| `upstream_error` | provider failed in a way we can't classify | `unknown` |
| `response_invalid` | provider returned something unusable | `unknown` |
| `partial_failure` | `-n` produced fewer than requested | `unknown` |
| `alpha_not_observed` | transparency requested, opaque result | `no` |
| `internal_error` | anything unclassified — the guaranteed fallback | `unknown` |

`internal_error` is why the surface is safe to type incrementally. An
exhaustive-looking list that silently misses a shell exit is worse than prose,
because callers trust it. Every failure gets a code; unknown ones get this one.

### `retryable` is three-valued, not a boolean

`"yes" | "no" | "unknown"`.

`unknown` is the one that earns its place. A timeout *after the request was
sent* may well have produced an image on the provider's side. Reporting that as
retryable invites a duplicate generation the caller pays for twice; reporting it
as non-retryable strands a request that only needed a moment. Say you don't
know.

## Exit codes are unchanged

`--json` adds a body, it does not renumber anything. `0` success, `1` failure,
`2` usage error, `124` timeout, `127` codex not authenticated. `ok` and the exit
status agree, and both remain independently reliable — check whichever suits
your harness.

## Reserved

Not implemented, named here so v2 doesn't collide: `--json-events` (a sparse
JSONL lifecycle stream on stderr — `request_started`, `retry_scheduled`,
`output_saved` — with a heartbeat for long calls, no percentages), plus
`operation_id` and `attempts` in the envelope. The argument for the stream is
not progress bars; it is that a silent 60–90 second call invites a caller to
time out and retry something that is still running.
