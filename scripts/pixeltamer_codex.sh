#!/usr/bin/env bash
# pixeltamer_codex.sh — generate images via the codex CLI's built-in image_gen tool.
#
# Uses your logged-in ChatGPT subscription instead of an OpenAI API key.
#
# Two invocation patterns are tried in sequence:
#   1. Clean numbered task list  (codex's reasoning loop tends to handle this well)
#   2. Augmented "force tool use" prompt as a fallback if pattern 1 doesn't
#      produce an image (some codex versions need the explicit nudge)
#
# Usage:
#   pixeltamer_codex.sh -p "<prompt>" -o <output.png> [--size WxH] [--quality low|medium|high|auto] [-n N]
#
# Exit codes: 0 success, 2 bad usage, 127 codex not installed/wedged,
#             124 codex timed out, 1 generation failed.
#
# env:
#   PIXELTAMER_CODEX_TIMEOUT     per-invocation timeout in seconds (default 360)
#   PIXELTAMER_CODEX_KILL_GRACE  seconds between SIGTERM and SIGKILL (default 5)

set -euo pipefail

prog="$(basename "$0")"

usage() {
  cat >&2 <<EOF
usage: $prog -p "<prompt>" -o <output.png> [--size WxH] [--quality Q] [-n N] [-i FILE]... [--reasoning E] [--debug]

required:
  -p, --prompt PROMPT     image description (quote it)
  -o, --out PATH          where to save the PNG; auto-suffixed -01, -02 when n>1

optional:
  --size WxH              e.g. 1024x1024, 1536x1024, 1024x1536, auto (default: auto)
  --quality Q             low | medium | high | auto (default: auto)
  -n, --count N           number of images, 1-10 (default: 1)
  -i, --image FILE        reference image to attach for character/style consistency.
                          Pass once per file; codex's image_gen will use them as
                          visual context. Repeatable (use -i twice for two images).
  --reasoning E           codex reasoning effort: low | medium | high (default: medium)
  --debug                 keep codex log on success and print its path

env:
  CODEX_BIN               override the codex executable (default: codex)
EOF
  exit 2
}

# --- arg parsing -------------------------------------------------------------

prompt=""
out=""
size="auto"
quality="auto"
count=1
reasoning="medium"
debug=0
images=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -p|--prompt)    prompt="${2:-}"; shift 2 ;;
    -o|--out)       out="${2:-}"; shift 2 ;;
    --size)         size="${2:-}"; shift 2 ;;
    --quality)      quality="${2:-}"; shift 2 ;;
    -n|--count)     count="${2:-}"; shift 2 ;;
    -i|--image)     images+=("${2:-}"); shift 2 ;;
    --reasoning)    reasoning="${2:-}"; shift 2 ;;
    --debug)        debug=1; shift ;;
    -h|--help)      usage ;;
    *)              echo "$prog: unknown arg: $1" >&2; usage ;;
  esac
done

[[ -z "$prompt" ]] && { echo "$prog: --prompt required" >&2; usage; }
[[ -z "$out" ]] && { echo "$prog: --out required" >&2; usage; }
[[ "$count" =~ ^[0-9]+$ ]] || { echo "$prog: -n must be a positive integer" >&2; usage; }
(( count >= 1 && count <= 10 )) || { echo "$prog: -n must be 1-10" >&2; usage; }

# Validate every reference image exists and resolve to absolute paths so codex
# can find them regardless of where it cd's into. Bail fast on a missing file
# rather than discovering it 60s into a codex run.
image_args=()
if (( ${#images[@]} > 0 )); then
  for img in "${images[@]}"; do
    [[ -z "$img" ]] && { echo "$prog: -i/--image given an empty path" >&2; exit 2; }
    [[ -f "$img" ]] || { echo "$prog: reference image not found: $img" >&2; exit 2; }
    abs_img="$(cd "$(dirname "$img")" && pwd)/$(basename "$img")"
    image_args+=(-i "$abs_img")
  done
fi

# --- preflight: codex installed and logged in -------------------------------

CODEX="${CODEX_BIN:-codex}"

if ! command -v "$CODEX" >/dev/null 2>&1; then
  cat >&2 <<EOF
$prog: codex CLI not found on PATH.
  install: npm install -g @openai/codex   (or brew install codex on macOS)
  then:    codex login
EOF
  exit 127
fi

# --- timeout / process-group machinery --------------------------------------

# Distinct exit code for "codex stalled and we put it down". coreutils `timeout`
# uses 124 for the same thing, so we borrow it. Callers MUST treat it apart from
# a plain failure: a stalled image tool won't un-stall on a pushier prompt, so
# the clean->forced fallback skips retry on this code (else one stall becomes
# two and the hang doubles).
readonly EXIT_TIMEOUT=124

# How long a single codex invocation may run before we kill it. 360s is roomy
# for gpt-image-2 (normal gens land in 30-90s) and far short of the 71-minute
# orphan that prompted this.
CODEX_TIMEOUT="${PIXELTAMER_CODEX_TIMEOUT:-360}"
[[ "$CODEX_TIMEOUT" =~ ^[0-9]+$ ]] || { echo "$prog: PIXELTAMER_CODEX_TIMEOUT must be an integer (seconds)" >&2; exit 2; }
# Grace between SIGTERM and SIGKILL when reaping a stalled codex.
KILL_GRACE="${PIXELTAMER_CODEX_KILL_GRACE:-5}"
[[ "$KILL_GRACE" =~ ^[0-9]+$ ]] || { echo "$prog: PIXELTAMER_CODEX_KILL_GRACE must be an integer (seconds)" >&2; exit 2; }

# system perl is guaranteed on macOS (/usr/bin/perl) and near-universal on
# Linux. We use it to drop codex into its OWN process group via setpgid(0,0) so
# the watchdog can signal the whole tree: codex is a Node launcher that spawns a
# child binary and forwards SIGTERM but CANNOT forward SIGKILL, so killing only
# the direct PID can orphan grandchildren. `setsid` would be simpler but macOS
# doesn't ship it; bash `set -m` job control is shell-global state that
# misbehaves in non-interactive scripts. perl needs no Homebrew. If perl is
# somehow absent we still time out — just on the direct PID only.
PERL_BIN="$(command -v perl 2>/dev/null || true)"

# _wd_signal PID SIG — signal PID's process group when we own it (perl set it up
# and ps confirms pgid == pid), else just the PID. Confirming pgid first avoids
# the nightmare of `kill -SIG -PID` landing on the caller's own group.
_wd_signal() {
  local pid="$1" sig="$2" pgid=""
  if [[ -n "$PERL_BIN" ]]; then
    pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
    if [[ -n "$pgid" && "$pgid" == "$pid" ]]; then
      kill -"$sig" -"$pid" 2>/dev/null || true
      return 0
    fi
  fi
  kill -"$sig" "$pid" 2>/dev/null || true
}

# run_with_watchdog SECONDS CMD [ARG...]
# Runs CMD in its own process group and kills the whole group if it outlives
# SECONDS. Returns CMD's own exit code, or $EXIT_TIMEOUT if the watchdog fired.
# Redirect at the call site as usual — CMD inherits the redirections
# (e.g. `run_with_watchdog 360 codex exec <prompt >log 2>&1`).
run_with_watchdog() {
  local timeout_s="$1"; shift

  # Marker file: the watchdog touches it iff it actually fired. Its presence
  # after the wait is how we tell "timed out" from "codex failed on its own".
  local marker
  marker="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-timeout.XXXXXX")"
  rm -f "$marker"

  # NOTE the explicit `<&0`: when job control is off (every non-interactive
  # script), bash redirects an `&` command's stdin from /dev/null unless the
  # redirection is explicit ON the backgrounded command. Our call-site
  # `<"$promptfile"` is on the function, not this `&`, so without `<&0` codex
  # would read an empty prompt. `<&0` forwards the inherited fd0 (the prompt
  # file) and defeats the /dev/null default.
  if [[ -n "$PERL_BIN" ]]; then
    "$PERL_BIN" -e 'use POSIX; setpgid(0,0); exec @ARGV or die "exec failed: $!\n"' "$@" <&0 &
  else
    "$@" <&0 &
  fi
  local child_pid=$!

  # Watchdog polls once a second so it exits promptly when codex finishes (no
  # lingering long sleep). Only after the full budget elapses does it mark+kill.
  (
    waited=0
    while [ "$waited" -lt "$timeout_s" ]; do
      kill -0 "$child_pid" 2>/dev/null || exit 0
      sleep 1
      waited=$(( waited + 1 ))
    done
    kill -0 "$child_pid" 2>/dev/null || exit 0
    # Accepted micro-race: if codex exits on its own in the sliver between this
    # check and the marker write, we'll report a timeout for a run that just
    # finished. The window is sub-millisecond against a 360s budget, and the only
    # cost is one spurious "timed out" the caller can retry — not worth the
    # complexity of distinguishing "we killed it" from "it died at the buzzer".
    : > "$marker"
    _wd_signal "$child_pid" TERM
    sleep "$KILL_GRACE"
    _wd_signal "$child_pid" KILL
  ) &
  local watchdog_pid=$!

  # `wait` only returns once codex is truly dead, so we never retire the
  # watchdog mid-grace and let codex survive.
  local rc=0
  wait "$child_pid" 2>/dev/null || rc=$?

  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true

  if [[ -f "$marker" ]]; then
    rm -f "$marker"
    return "$EXIT_TIMEOUT"
  fi
  rm -f "$marker"
  return "$rc"
}

# --- preflight: codex logged in (with its own short timeout) -----------------

# Even `codex login status` can hang if the codex daemon is wedged, so it gets
# the same watchdog on a short leash.
login_log="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-login.XXXXXX")"
login_rc=0
run_with_watchdog 30 "$CODEX" login status >"$login_log" 2>&1 || login_rc=$?
if (( login_rc == EXIT_TIMEOUT )); then
  echo "$prog: 'codex login status' timed out after 30s — codex may be wedged." >&2
  rm -f "$login_log"
  exit 127
fi
# Trust the exit code first. Any non-timeout, non-zero exit (crash, network
# error, unknown state) means we can't confirm login — don't fall through to
# string-matching the output, which could accept a broken state whose text
# happens to contain "logged in".
if (( login_rc != 0 )); then
  echo "$prog: 'codex login status' failed (exit $login_rc). Run: codex login" >&2
  tail -n 30 "$login_log" >&2
  rm -f "$login_log"
  exit 127
fi
# Exit 0 but still parse the text: codex prints "Logged in"/"Not logged in" and
# returns 0 either way. Reject "not logged in" explicitly — it contains the
# substring "logged in", so a bare `grep "logged in"` would wrongly accept it.
if grep -qi "not logged in" "$login_log" || ! grep -qi "logged in" "$login_log"; then
  echo "$prog: codex is not logged in. Run: codex login" >&2
  rm -f "$login_log"
  exit 127
fi
rm -f "$login_log"

# --- output paths ------------------------------------------------------------

# Resolve absolute output path. If the parent dir doesn't exist, create it.
out_dir="$(dirname "$out")"
mkdir -p "$out_dir"
out_dir="$(cd "$out_dir" && pwd)"
out_base="$(basename "$out")"
out_stem="${out_base%.*}"
out_ext="${out_base##*.}"
[[ "$out_ext" == "$out_base" ]] && out_ext="png"

# final_paths: where the caller actually wants the PNG(s).
# work_paths:  per-process temp siblings IN the same directory. codex writes
#              here; on success we atomically mv into place. Two reasons:
#                - same-dir mv is a true atomic rename. A temp in TMPDIR would
#                  NOT be — this repo lives on /Volumes/MyEXT while TMPDIR sits
#                  on the boot volume, so that mv would silently degrade to
#                  copy+unlink (non-atomic, and a reader could see a partial).
#                - concurrent gens to the same -o stop clobbering each other:
#                  every run owns a $$-tagged temp, so nobody's rm deletes
#                  someone else's just-written file. That was the old race.
final_paths=()
work_paths=()
if (( count == 1 )); then
  final_paths+=("$out_dir/${out_stem}.${out_ext}")
  work_paths+=("$out_dir/.${out_stem}.tmp.$$.${out_ext}")
else
  for i in $(seq 1 "$count"); do
    final_paths+=("$(printf "%s/%s-%02d.%s" "$out_dir" "$out_stem" "$i" "$out_ext")")
    work_paths+=("$(printf "%s/.%s-%02d.tmp.%s.%s" "$out_dir" "$out_stem" "$i" "$$" "$out_ext")")
  done
fi
# No pre-clean of final_paths — that was the clobber bug. work_paths are
# $$-unique, so run_codex cleans those itself, race-free.

# Fail fast if a target is an existing directory — a later `mv file dir/` would
# move the PNG INTO it and we'd print the dir as if it were the image. (Publish
# re-checks this too, but bailing here avoids a wasted codex call.)
for fp in "${final_paths[@]}"; do
  [[ -d "$fp" ]] && { echo "$prog: output path is a directory: $fp" >&2; exit 2; }
done

# --- prompt builders ---------------------------------------------------------

# Pattern 1: clean numbered task list. Codex's reasoning loop tends to
# invoke image_gen naturally with this shape, no forcing required.
build_clean_prompt() {
  local target_block=""
  if (( count == 1 )); then
    target_block="6. Save the image to '${work_paths[0]}'."
  else
    local lines="6. Save the images to these exact paths in order:"
    for i in "${!work_paths[@]}"; do
      lines+=$'\n'"   $(( i + 1 )). ${work_paths[$i]}"
    done
    target_block="$lines"
  fi
  local ref_note=""
  if (( ${#images[@]} > 0 )); then
    ref_note=$'\n''0. Attached to this message are '"${#images[@]}"' reference image(s). Look at them and treat them as the visual style and character anchor for the new image — match the character design, color palette, lighting, and proportions you see there. Do not literally copy or paste the references; generate a new composition that visibly belongs to the same visual world.'
  fi
  cat <<EOF
Perform the following tasks:${ref_note}
1. Use the built-in image_gen tool to generate $count image(s).
2. Prompt: $prompt
3. Size: $size
4. Quality: $quality
5. Count: $count
$target_block
7. After saving, print only the absolute file path(s), one per line.
EOF
}

# Pattern 2: augmented "force tool use". Adds explicit guardrails so codex
# doesn't fabricate a PNG via Python or curl when pattern 1 misfires.
build_forced_prompt() {
  local target_block=""
  if (( count == 1 )); then
    target_block="Save the image to this exact path: ${work_paths[0]}"
  else
    target_block="Save the images to these exact paths, in order:"
    for i in "${!work_paths[@]}"; do
      target_block+=$'\n'"  $(( i + 1 )). ${work_paths[$i]}"
    done
  fi
  local ref_note=""
  if (( ${#images[@]} > 0 )); then
    ref_note=$'\n\n''REFERENCES: '"${#images[@]}"' image(s) are attached to this message. Use them as the visual anchor — match the character design, palette, lighting, and proportions. Generate a new composition in the same visual world; do not literally copy them.'
  fi
  cat <<EOF
Use your image_generation tool (gpt-image-2) to create $count image(s).${ref_note}

PROMPT: $prompt
SIZE: $size
QUALITY: $quality
COUNT: $count

Requirements:
- You MUST call the image_generation tool. This is non-negotiable.
- Do NOT write a Python script, shell out to curl, or fabricate a PNG any other way.
- ${target_block}
- Reply with only the absolute path(s) of the saved PNG(s), one per line. Nothing else.
EOF
}

# --- runner ------------------------------------------------------------------

run_codex() {
  local prompt_text="$1"
  local log promptfile start_marker
  log="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-codex.XXXXXX")"
  promptfile="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-prompt.XXXXXX")"
  # start_marker's mtime == run start. The recovery scan below uses it to
  # ignore cache images left by OTHER (concurrent) runs.
  start_marker="$(mktemp "${TMPDIR:-/tmp}/pixeltamer-start.XXXXXX")"

  # Feed the prompt via a file (`codex exec` reads stdin when the positional
  # prompt is omitted) instead of `printf | codex`. Same delivery, but codex is
  # now a single process we can background and group-kill — the right-hand side
  # of a pipeline is awkward to signal cleanly. This still keeps the prompt off
  # the positional args, which matters because `-i/--image` greedily eats the
  # next positional.
  # The `${arr[@]+"${arr[@]}"}` idiom expands to nothing when the array is empty
  # and to its elements when it isn't — needed on macOS bash 3.2, which trips
  # `set -u` on a bare empty-array expansion.
  printf '%s' "$prompt_text" > "$promptfile"

  # Clean our own work paths. Race-free: they're $$-tagged, so no other process
  # shares them — the whole reason we write to temps.
  for p in "${work_paths[@]}"; do rm -f "$p"; done

  local rc=0
  run_with_watchdog "$CODEX_TIMEOUT" \
      "$CODEX" exec \
          --skip-git-repo-check \
          -s workspace-write \
          -c "model_reasoning_effort=\"${reasoning}\"" \
          ${image_args[@]+"${image_args[@]}"} \
      <"$promptfile" >"$log" 2>&1 || rc=$?

  rm -f "$promptfile"

  if (( rc == EXIT_TIMEOUT )); then
    echo "$prog: codex timed out after ${CODEX_TIMEOUT}s (raise PIXELTAMER_CODEX_TIMEOUT to change)." >&2
    tail -n 30 "$log" >&2
    echo "(full log: $log)" >&2   # always keep the log on a timeout
    # codex was killed mid-write — sweep any partial work temp it left behind.
    rm -f "$start_marker" "${work_paths[@]}"
    return "$EXIT_TIMEOUT"
  fi

  if (( rc != 0 )); then
    echo "$prog: codex exec failed (last 30 log lines):" >&2
    tail -n 30 "$log" >&2
    echo "(full log: $log)" >&2
    rm -f "$start_marker" "${work_paths[@]}"
    return 1
  fi

  # Did codex actually drop the requested PNG(s) at the work paths?
  local missing=0
  for p in "${work_paths[@]}"; do
    [[ -f "$p" ]] || missing=1
  done

  if (( missing == 1 )); then
    # Last-ditch recovery: codex sometimes saves to ~/.codex/generated_images/
    # without copying. Grab the most recent ig_*.png(s) — but ONLY ones created
    # after this run started (-newer "$start_marker"), so a concurrent run can't
    # have its image stolen. The old "newest overall" scan was globally racy.
    local cache="$HOME/.codex/generated_images"
    if [[ -d "$cache" ]]; then
      local found latest
      # Collect candidates first and guard the empty case explicitly: GNU xargs
      # runs `ls -t` with NO args (listing the cwd) on empty input, which could
      # then publish an arbitrary file. BSD xargs doesn't, but we don't rely on
      # the difference. codex names cache files ig_<ts>.png (no newlines), so a
      # newline-delimited list is safe here.
      found="$(find "$cache" -type f -name 'ig_*.png' -newer "$start_marker" 2>/dev/null)"
      latest=""
      if [[ -n "$found" ]]; then
        latest="$(printf '%s\n' "$found" | tr '\n' '\0' | xargs -0 ls -t 2>/dev/null | head -n "$count")"
      fi
      if [[ -n "$latest" ]]; then
        local i=0
        while IFS= read -r src; do
          [[ -n "$src" ]] || continue
          cp "$src" "${work_paths[$i]}"
          i=$(( i + 1 ))
        done <<< "$latest"
        missing=0
        for p in "${work_paths[@]}"; do
          [[ -f "$p" ]] || missing=1
        done
      fi
    fi
  fi

  rm -f "$start_marker"

  if (( missing == 1 )); then
    echo "$prog: codex finished but expected PNG(s) not found." >&2
    tail -n 30 "$log" >&2
    echo "(full log: $log)" >&2
    rm -f "${work_paths[@]}"
    return 1
  fi

  # Every work file exists — publish them. Each mv is checked EXPLICITLY: run_codex
  # is called in an `|| rc=$?` context, which disables `set -e` inside the
  # function, so an unchecked failed mv would slip through to a false "ok".
  # Validate-all-first shrinks the partial-batch window, but per-file mv can't be
  # transactional across multiple outputs — a mid-batch failure leaves a mixed
  # set. We detect and report that rather than claim success; a staged-dir
  # transaction would be overkill for an image-gen tool.
  for p in "${work_paths[@]}"; do
    [[ -f "$p" ]] || { echo "$prog: internal: work file vanished before publish: $p" >&2; rm -f "${work_paths[@]}"; return 1; }
  done
  for i in "${!work_paths[@]}"; do
    # Reject a directory at the target — `mv file dir/` would move INTO it and we
    # would then print the dir path as if it were the PNG.
    if [[ -d "${final_paths[$i]}" ]]; then
      echo "$prog: output path is a directory, refusing to publish: ${final_paths[$i]}" >&2
      rm -f "${work_paths[@]}"
      return 1
    fi
    if ! mv -f "${work_paths[$i]}" "${final_paths[$i]}" || [[ ! -f "${final_paths[$i]}" ]]; then
      echo "$prog: failed to publish ${final_paths[$i]}" >&2
      rm -f "${work_paths[@]}"
      return 1
    fi
  done

  if (( debug == 1 )); then
    echo "$prog: log preserved at $log" >&2
  else
    rm -f "$log"
  fi
  return 0
}

# Try pattern 1 (clean). On a plain failure, fall back to pattern 2 (forced).
# On a TIMEOUT, do NOT fall back: a stalled image tool won't un-stall for a
# pushier prompt, and retrying would just burn another full timeout — that's
# the "one stall becomes two" double-hang we're specifically avoiding.
rc=0
run_codex "$(build_clean_prompt)" || rc=$?
if (( rc == 0 )); then
  used="clean"
elif (( rc == EXIT_TIMEOUT )); then
  exit "$EXIT_TIMEOUT"
else
  echo "$prog: clean pattern produced no image — retrying with augmented prompt..." >&2
  rc=0
  run_codex "$(build_forced_prompt)" || rc=$?
  if (( rc == 0 )); then
    used="forced"
  elif (( rc == EXIT_TIMEOUT )); then
    exit "$EXIT_TIMEOUT"
  else
    exit 1
  fi
fi

# stdout stays a clean list of the final paths for callers; status to stderr.
for p in "${final_paths[@]}"; do echo "$p"; done
echo "$prog: ok (pattern: $used)" >&2
