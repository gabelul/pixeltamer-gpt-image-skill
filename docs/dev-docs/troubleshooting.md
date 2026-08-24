# Troubleshooting log

"We stepped on this landmine so you don't have to." Non-trivial bugs, their root
cause, and the fix. Check here first when something looks familiar.

---

## codex backend hangs forever when image_gen stalls (no timeout)

**Symptom:** A codex-backend generation never returns. An orphaned `codex exec`
sat at 0% CPU for 71 minutes. Killing the wrapper left codex running.

**Root cause:** `scripts/pixeltamer_codex.sh` ran `codex exec` with no time
bound, and codex is a Node launcher that spawns a child binary — so signalling
only the wrapper PID orphaned grandchildren. The trigger that day was a codex
v0.136 vs gpt-5.5 schema mismatch (`failed to decode models response: missing
field base_instructions`, fixed by upgrading codex to 0.139), but the script had
no guard, so any future stall would hang silently.

**Fix:** `run_with_watchdog` runs codex in its own process group (via a
`/usr/bin/perl` `setpgid(0,0)` wrapper — `setsid` is absent on macOS) and a
1s-polling watchdog SIGTERMs then SIGKILLs the whole group after
`PIXELTAMER_CODEX_TIMEOUT` seconds (default 360). Timeout returns a distinct
exit code 124 so the clean→forced prompt fallback skips retry on a timeout
(otherwise one stall became two, doubling the hang).

**Lesson:** Never shell out to an external agent CLI without a timeout AND a
process-group kill. The direct child is rarely the only process.

---

## Backgrounded command silently reads /dev/null instead of the prompt

**Symptom:** After moving codex behind the watchdog, codex received an EMPTY
prompt and produced no image — but only via the script; running codex by hand
worked.

**Root cause:** bash redirects an async (`&`) command's stdin from `/dev/null`
when job control is off (every non-interactive script) UNLESS the redirection is
explicit *on the backgrounded command itself*. The `<"$promptfile"` redirect sat
on the function call, not on the `"$@" &` inside it, so codex got `/dev/null`.

**Fix:** Launch the backgrounded command with an explicit `<&0` so it inherits
the function's already-redirected fd 0.

**Lesson:** `func args <file &` does NOT give the backgrounded command `file` on
stdin. Put the redirect on the `&` command, or forward fd 0 with `<&0`.

---

## "Orphan" processes that aren't — the zombie-reaping measurement window

**Symptom:** A stress test of the watchdog reported 8/8 runs leaving 2 orphaned
`sleep` processes each — looked like the group kill was broken.

**Root cause:** Measurement artifact. Right after a group SIGTERM/SIGKILL, the
children are zombies (or mid-reparent to launchd) for a sub-second window;
`ps -o command | grep -c` still lists their old command line during that window.
Also `grep 'sleep 987'` matched the *stub's command-line string* that literally
contained `sleep 987`, and macOS `pgrep` has no `-c` flag (it errored to empty,
which read as "0"). With a generous settle (~1s) and per-process PID tracking,
0/10 runs leak. The kill was correct the whole time.

**Lesson:** When counting "leaked" processes, wait out the reaping window and
match by PID or `comm`, not a `grep` over full command lines. macOS `ps`/`pgrep`
flags differ from GNU — verify the measurement before trusting a failure.

---

## `xargs` with empty input: GNU runs the command anyway, BSD doesn't

**Symptom:** The cache-recovery path (`find … -newer | xargs -0 ls -t`) could
publish an arbitrary file when `find` matched nothing — but only on Linux, never
on the macOS dev box, so local testing missed it.

**Root cause:** GNU `xargs` (Linux) runs the utility once even with empty stdin
unless given `-r`/`--no-run-if-empty`; BSD `xargs` (macOS) does not. So on Linux,
empty `find` output → `ls -t` with no args → a listing of the *current
directory*, which then got copied over a work temp and published.

**Fix:** Capture `find` output into a variable first and guard `[[ -n "$found" ]]`
before piping to `xargs`. Don't rely on the platform default. (`-r` is a GNU
extension and isn't portable to BSD, so the explicit guard is the right call.)

**Lesson:** `cmd | xargs util` is not safe on empty input across platforms. Guard
the empty case yourself.

---

## `grep "logged in"` accepts "Not logged in"

**Symptom:** The `codex login status` preflight passed even when codex was logged
out, then `codex exec` failed later with a confusing error.

**Root cause:** `grep -qi "logged in"` matches the substring inside "Not logged
in". Classic positive-match-on-a-negative-string.

**Fix:** Reject the negative explicitly:
`grep -qi "not logged in" || ! grep -qi "logged in"`.

**Lesson:** When a status string can be negated by a prefix, match the negative
form first — substring checks don't understand "not".

---

## `--format` was wired to the wrong API parameter, so output format was unreachable

**Symptom:** No way to ask gpt-image-2 for a specific file format. `--format` only
accepted `url` / `b64_json` and appeared to do nothing.

**Root cause:** `--format` was mapped to `response_format` — the DALL·E-era param
that chooses how the *response* carries the image. OpenAI's spec is explicit that
gpt-image models ignore it entirely; they always return base64. The param that
actually picks the file format is `output_format` (`png` / `jpeg` / `webp`), and it
was never wired.

This mattered more than it looked. Transparency requires png or webp, so
`--background transparent` was working only because png happens to be the server-side
default — a coincidence, not a contract.

**Fix:** Added `--output-format` → `output_format` and `--output-compression` →
`output_compression`. Kept `--format` → `response_format` untouched: pixeltamer
supports `OPENAI_IMAGE_BASE_URL` proxies (jmrai, ZenMux, OpenRouter) which may still
implement the older surface, and `_write_item` already handles both b64 and url
responses precisely because of them. Documented as legacy rather than removed.

**Files:** `scripts/pixeltamer_api.py`, `scripts/pixeltamer`, `references/api-backend.md`

**Lesson:** A flag that parses cleanly and sends successfully can still be aimed at
the wrong parameter. When a flag "seems to do nothing," check it against the
provider's generated types (`openai-python/src/openai/types/image_*_params.py`) —
those are generated from the OpenAPI spec, so they don't drift the way prose docs do.

---

## Codex refuses the `background` parameter but honours the transparency prompt

**Symptom:** `--background transparent` on the codex backend. `codex exec` dies with
`unknown arg: --background`. Routing it to the OAuth Responses transport instead —
which *does* declare a `background` field on its `image_generation` tool — fails a
round-trip later with:

```
"Transparent background is not supported for this model."
type=image_generation_user_error  code=invalid_value  param=tools
```

The obvious conclusion — "codex can't do transparency" — is wrong, and pixeltamer's
docs shipped it for exactly one commit.

**Root cause:** Two separate layers got collapsed into one claim.

- **Parameter layer:** the ChatGPT-subscription backend rejects `background` as an
  explicit tool parameter. Pinning `model: gpt-image-2` in the tool spec doesn't
  help — tried, same error.
- **Prompt layer:** codex's built-in `image_gen`, driven through `codex exec`,
  produces genuine alpha when the *prompt* asks for it. Measured across three live
  generations:

| Subject | Alpha channel | Fully transparent | Partial (soft edges) |
|---|---|---|---|
| Brass key (hard edges), prompt-only | RGBA | 78.0% | 1.8% |
| Brass key, prompt naming the tool params | RGBA | 73.6% | 1.1% |
| Smoke wisp (translucent) | RGBA | 79.9% | 19.0% |

Clean cutouts in all three, including the translucent case that should have been
hardest. Verified with two independent decoders and visual composites over magenta.

**Fix:** `--background` is handled in `pixeltamer_codex.sh`'s own arg parser: it
appends the transparency constraint block to the prompt, announces the rewrite on
stderr, and checks the resulting PNG's IHDR colour-type byte, warning loudly if
alpha is missing. Scoped to `generate` — `edit`/`compose` use the Responses
transport that refuses the param, and prompt-driven alpha through an edit is
untested, so the dispatcher refuses instead of guessing.

**Files:** `scripts/pixeltamer_codex.sh`, `scripts/pixeltamer`,
`references/transparency.md`

**Lesson:** A parameter rejection proves the parameter is unsupported. It says
nothing about the capability. Same backend, same model, same session: refused the
field, honoured the sentence. And this is the *second* time codex turned out more
capable than pixeltamer's docs assumed — the first was "edit is API only," fixed in
0.3.0 (see `gallery/README.md`). When codex appears not to support something,
assume the transport, not the model.

---

## Transparent PNGs carry ghost colour under the alpha

**Symptom:** A verified-transparent PNG looks correct in Preview and in any
alpha-aware tool, then shows a dark halo or a ghost of the original scene the moment
something flattens it — a naive compositor, a game engine importer, a print pipeline.

**Root cause:** Fully-transparent pixels still store RGB values. gpt-image-2 leaves
whatever it rendered there instead of zeroing it. Measured across four codex
generations, as a share of *fully-transparent* pixels: 62.4%, 68.3%, 87.5%, and
0.0%. So it's the norm rather than the exception, but not universal — which is
exactly what makes it easy to miss.

(An earlier version of this entry said "~50%". That number divided by *all* pixels
rather than transparent ones, which understated it. Denominators matter.)

This is what makes a "good" transparent asset look broken in one downstream tool and
fine in every other.

**Fix:** Scrub RGB where alpha is zero before delivering:

```bash
magick asset.png -channel RGB -fx 'a==0?0:u' scrubbed.png
```

Documented in `references/post-process.md` and step 2b of
`references/transparency.md`. Not automated — it's a delivery-time concern, and
folding it into generation would mean decoding and re-encoding every PNG.

**Files:** `references/post-process.md`, `references/transparency.md`

**Lesson:** "Has an alpha channel" and "is a clean transparent asset" are three
different checks apart: the channel exists, the alpha is actually used, and the RGB
under it is scrubbed. Only the first is a header read.
