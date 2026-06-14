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
